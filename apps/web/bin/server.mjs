// The HoldMySession web server: serves the built client files and hands every other request to the
// built app. Shared by the command line (cli.mjs) and the desktop app (desktop/main.cjs).

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

// --- MIME types ---

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/**
 * Which addresses to listen on, from the choice made in Settings: this computer only, or the network, which
 * covers every address of this computer, local network and tailnet alike. The command line's --host wins over it.
 */
export function listenHost() {
  const override = process.env.HOLDMYSESSION_DIR || process.env.CLAUDE_DASHBOARD_DIR || process.env.CLAUDE_DASHBOARD_HOME;
  const dirs = override ? [override] : [join(homedir(), '.holdmysession'), join(homedir(), '.claude-dashboard')];
  for (const dir of dirs) {
    try {
      const settings = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf-8'));
      return settings?.link?.listen === 'network' ? '0.0.0.0' : 'localhost';
    } catch {
      // Try the next folder.
    }
  }
  return 'localhost';
}

/**
 * Builds the server without listening. `distDir` is the built app, and `host` and `port` are only used
 * to read request URLs. Call `.listen(port, host)` on what it returns.
 */
export async function createAppServer({ distDir, host, port }) {
  process.env.NODE_ENV = 'production';
  // Where the app lives, for the hook commands written to Claude Code's settings.
  process.env.HOLDMYSESSION_APP_DIR ||= resolve(distDir, '..');
  const clientDir = join(distDir, 'client');

  const serverModule = await import(pathToFileURL(join(distDir, 'server', 'server.js')).href);
  const appServer = serverModule.default;

  async function tryServeStatic(pathname) {
    const filePath = join(clientDir, pathname);

    // Prevent directory traversal
    if (!filePath.startsWith(clientDir)) return null;

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) return null;
      const content = await readFile(filePath);
      const ext = extname(filePath);
      return { content, contentType: MIME_TYPES[ext] || 'application/octet-stream' };
    } catch {
      return null;
    }
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${host}:${port}`);

      // Try static files first (client assets)
      const staticFile = await tryServeStatic(url.pathname);
      if (staticFile) {
        res.writeHead(200, {
          'Content-Type': staticFile.contentType,
          'Content-Length': staticFile.content.byteLength,
          'Cache-Control': url.pathname.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        });
        res.end(staticFile.content);
        return;
      }

      // Build a standard Request from the Node.js request
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }

      const body = req.method !== 'GET' && req.method !== 'HEAD'
        ? await new Promise((resolve) => {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => resolve(Buffer.concat(chunks)));
          })
        : undefined;

      const request = new Request(url.href, {
        method: req.method,
        headers,
        body,
        duplex: body ? 'half' : undefined,
      });

      // Delegate to the TanStack Start server
      const response = await appServer.fetch(request);

      // Write the response back
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));

      if (response.body) {
        const reader = response.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { res.end(); break; }
            res.write(value);
          }
        };
        await pump();
      } else {
        res.end();
      }
    } catch (err) {
      console.error('Request error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    }
  });

  return server;
}
