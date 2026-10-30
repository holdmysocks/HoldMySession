#!/usr/bin/env node
// Claude Code SessionStart hook for a source checkout: starts HoldMySession in the background if
// nothing is listening on its port. The installed app does the same with --holdmysession-start.
// It must be quick and must never fail or block Claude Code: every path exits 0.

import { connect } from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.HOLDMYSESSION_PORT) || 3000;

function listening() {
  return new Promise((done) => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = (value) => {
      socket.destroy();
      done(value);
    };
    socket.setTimeout(800, () => finish(false));
    socket.on('connect', () => finish(true));
    socket.on('error', () => finish(false));
  });
}

try {
  if (!(await listening()) && existsSync(resolve(here, '..', 'dist', 'server', 'server.js'))) {
    const child = spawn(process.execPath, [resolve(here, 'cli.mjs'), '--port', String(port)], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  }
} catch {
  // A broken hook must not affect the Claude Code session.
}
process.exitCode = 0;
