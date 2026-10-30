#!/usr/bin/env node
// Claude Code hook: appends Notification and Stop events to the dashboard event log.
// Runs as a separate process per event, so it must stay dependency-free and must
// never fail or block Claude Code: every path exits 0.
//
// Log path must match getEventLogPath() in src/lib/events/event-inbox.ts.

import { appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const RECORDED_EVENTS = new Set(['Notification', 'Stop']);

// Must match dataDir() in src/lib/data-dir.ts. The hook cannot import from src/, and the hook test checks the two agree.
// It never copies the old folder: until the dashboard has started and done that, it keeps writing to the old one.
function eventLogPath() {
  const override = process.env.HOLDMYSESSION_DIR || process.env.CLAUDE_DASHBOARD_DIR || process.env.CLAUDE_DASHBOARD_HOME;
  if (override) return join(override, 'events.jsonl');
  const next = join(homedir(), '.holdmysession');
  const legacy = join(homedir(), '.claude-dashboard');
  return join(existsSync(next) || !existsSync(legacy) ? next : legacy, 'events.jsonl');
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

async function main() {
  const payload = JSON.parse(await readStdin());
  if (!payload || typeof payload !== 'object') return;

  const event = payload.hook_event_name;
  const sessionId = payload.session_id;
  if (!RECORDED_EVENTS.has(event) || typeof sessionId !== 'string') return;

  const record = {
    ts: new Date().toISOString(),
    event,
    sessionId,
    cwd: typeof payload.cwd === 'string' ? payload.cwd : null,
    message: typeof payload.message === 'string' ? payload.message : null,
    notificationType: typeof payload.notification_type === 'string' ? payload.notification_type : null,
    title: typeof payload.title === 'string' ? payload.title : null,
  };

  const file = eventLogPath();
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(record) + '\n', 'utf-8');
}

try {
  await main();
} catch {
  // Swallow everything: a broken hook must not affect the Claude Code session.
}
process.exitCode = 0;
