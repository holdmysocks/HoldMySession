#!/usr/bin/env node
// Claude Code status line command: keeps the subscription limits Claude Code reports (the 5-hour and weekly
// windows) in usage.json for HoldMySession, then prints a status line.
//
// If a status line was set up before this one was added, its command is saved in statusline-previous.json
// and runs here with the same input, and what it prints is passed through unchanged. Otherwise a short
// "5h 62% · 7d 18%" is printed.
//
// Runs as a separate process on every update, so it stays dependency-free and every path exits 0.
// The file paths must match usageFilePath() in src/lib/usage/usage-file.ts.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// Must match dataDir() in src/lib/data-dir.ts, as in holdmysession-hook.mjs.
function dataDir() {
  const override = process.env.HOLDMYSESSION_DIR || process.env.CLAUDE_DASHBOARD_DIR || process.env.CLAUDE_DASHBOARD_HOME;
  if (override) return override;
  const next = join(homedir(), '.holdmysession');
  const legacy = join(homedir(), '.claude-dashboard');
  return existsSync(next) || !existsSync(legacy) ? next : legacy;
}

function windowFrom(value) {
  if (!value || typeof value !== 'object') return null;
  const used = Number(value.used_percentage);
  const resets = Number(value.resets_at);
  if (!Number.isFinite(used) || !Number.isFinite(resets) || resets <= 0) return null;
  return { usedPercentage: Math.min(100, Math.max(0, used)), resetsAt: resets };
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

const live = (w, nowMs) => (w && Number.isFinite(Number(w.resetsAt)) && Number(w.resetsAt) * 1000 > nowMs ? w : null);

// Keeps a window the new report leaves out while it has not reset, as mergeSnapshots() does.
function record(input, dir, now) {
  const limits = input && typeof input === 'object' ? input.rate_limits : null;
  if (!limits || typeof limits !== 'object') return null;
  const fiveHour = windowFrom(limits.five_hour);
  const sevenDay = windowFrom(limits.seven_day);
  if (!fiveHour && !sevenDay) return null;
  const file = join(dir, 'usage.json');
  const previous = readJson(file);
  const snapshot = {
    updatedAt: new Date(now).toISOString(),
    fiveHour: live(fiveHour, now) ?? live(previous?.fiveHour, now),
    sevenDay: live(sevenDay, now) ?? live(previous?.sevenDay, now),
    // When a 5-hour window was last reported at all. Some plans never have one.
    fiveHourSeenAt: fiveHour ? new Date(now).toISOString() : (previous?.fiveHourSeenAt ?? null),
  };
  mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(snapshot), 'utf-8');
  renameSync(tmp, file);
  return snapshot;
}

function summary(snapshot) {
  if (!snapshot) return '';
  const part = (label, w) => (w ? `${label} ${Math.round(w.usedPercentage)}%` : null);
  return [part('5h', snapshot.fiveHour), part('7d', snapshot.sevenDay)].filter(Boolean).join(' · ');
}

function main() {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf-8');
  } catch {
    // No input: nothing to record.
  }
  let input = null;
  try {
    input = JSON.parse(raw);
  } catch {
    // Not JSON: still pass it on to the previous status line.
  }
  const dir = dataDir();
  let snapshot = null;
  try {
    snapshot = record(input, dir, Date.now());
  } catch {
    // Never let a full disk or a locked file break the status line.
  }

  const previous = readJson(join(dir, 'statusline-previous.json'));
  if (previous && typeof previous.command === 'string' && previous.command.trim() !== '') {
    const result = spawnSync(previous.command, { input: raw, shell: true, encoding: 'utf-8', timeout: 5000, windowsHide: true });
    if (typeof result.stdout === 'string' && result.stdout !== '') process.stdout.write(result.stdout);
    return;
  }
  const text = summary(snapshot);
  if (text) process.stdout.write(text + '\n');
}

try {
  main();
} catch {
  // Swallow everything: a broken status line must not affect the Claude Code session.
}
process.exitCode = 0;
