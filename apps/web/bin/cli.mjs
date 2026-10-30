#!/usr/bin/env node

import { createAppServer, listenHost } from './server.mjs';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { homedir } from 'node:os';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');
const pkg = JSON.parse(await readFile(resolve(__dirname, '..', 'package.json'), 'utf-8'));

// --- Argument parsing ---

const args = process.argv.slice(2);

function getArg(name, short) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}` || (short && args[i] === `-${short}`)) {
      return args[i + 1] || true;
    }
    if (args[i].startsWith(`--${name}=`)) {
      return args[i].split('=')[1];
    }
  }
  return undefined;
}

const hasFlag = (name, short) => args.includes(`--${name}`) || (short && args.includes(`-${short}`));

if (hasFlag('help', 'h')) {
  console.log(`
HoldMySession v${pkg.version}

Usage: holdmysession [options]

Options:
  -p, --port <number>   Port to listen on (default: 3000)
  --host <hostname>     Host to bind to (default: localhost)
  -o, --open            Open browser after starting
  --print-hook-config   Print a settings.json hooks snippet (Notification and Stop)
                        for the Session Map. Prints only; never writes files.
  -v, --version         Show version number
  -h, --help            Show this help message
`);
  process.exit(0);
}

if (hasFlag('version', 'v')) {
  console.log(pkg.version);
  process.exit(0);
}

if (hasFlag('print-hook-config')) {
  const hookScript = resolve(__dirname, 'holdmysession-hook.mjs');
  const command = hookScript.includes(' ') ? `node "${hookScript}"` : `node ${hookScript}`;
  const hook = { hooks: [{ type: 'command', command }] };
  console.error('Add the "hooks" block below to settings.json in your Claude config directory (merge it with any existing "hooks").');
  console.log(JSON.stringify({ hooks: { Notification: [hook], Stop: [hook] } }, null, 2));
  process.exit(0);
}

const port = Number(getArg('port', 'p')) || 3000;
const host = getArg('host') || listenHost();
const shouldOpen = hasFlag('open', 'o');

// --- Pre-flight checks ---

// Same precedence as src/lib/utils/claude-path.ts: CLAUDE_CONFIG_DIR, then CLAUDE_HOME, then ~/.claude.
const claudeDir = process.env.CLAUDE_CONFIG_DIR || process.env.CLAUDE_HOME || join(homedir(), '.claude');
try {
  await access(claudeDir);
} catch {
  console.warn(`\nWarning: Claude directory not found at ${claudeDir}. The dashboard may not show any sessions.\n`);
}

try {
  await access(join(distDir, 'server', 'server.js'));
} catch {
  console.error(`\nError: Built files not found at ${distDir}/server/server.js`);
  console.error('Run "npm run build" first, then try again.\n');
  process.exit(1);
}

// --- Server setup ---

const server = await createAppServer({ distDir, host, port });

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nError: Port ${port} is already in use.`);
    console.error(`Try a different port: holdmysession --port ${port + 1}\n`);
    process.exit(1);
  }
  console.error('Server error:', err);
  process.exit(1);
});

server.listen(port, host, () => {
  const onNetwork = host === '0.0.0.0' || host === '::';
  const url = `http://${onNetwork ? 'localhost' : host}:${port}`;

  console.log(`
  HoldMySession v${pkg.version}
  Running at ${url}${onNetwork ? `\n  Listening on every address of this computer (local network and tailnet), port ${port}` : ''}
  Reading sessions from ${claudeDir}

  Press Ctrl+C to stop
`);

  // Load the app once, so the server starts its automatic history scan now, not when the first browser arrives.
  fetch(`http://${host === '0.0.0.0' || host === '::' ? 'localhost' : host}:${port}/`, { redirect: 'manual' }).catch(() => {});

  if (shouldOpen) {
    const cmd = process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
    exec(cmd, (err) => {
      if (err) console.log(`  Open ${url} in your browser`);
    });
  }
});
