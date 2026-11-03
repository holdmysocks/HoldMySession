const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BUSY_MS, shouldPoll, shouldQuitWhenIdle, isLinked, hasStartHook, newestTranscriptMtime } = require('./idle.cjs');

const NOW = 1_000_000_000_000;
const MIN = 60_000;
const base = { nowMs: NOW, lastActivityMs: NOW, windowOpen: false, watching: true };

test('polls while Claude was active lately, and stops after a quiet spell', () => {
  assert.strictEqual(shouldPoll(base), true);
  assert.strictEqual(shouldPoll({ ...base, lastActivityMs: NOW - BUSY_MS }), true);
  assert.strictEqual(shouldPoll({ ...base, lastActivityMs: NOW - BUSY_MS - 1 }), false);
});

test('polls whenever the window is open, or when activity cannot be watched', () => {
  assert.strictEqual(shouldPoll({ ...base, lastActivityMs: NOW - 5 * 60 * MIN, windowOpen: true }), true);
  assert.strictEqual(shouldPoll({ ...base, lastActivityMs: NOW - 5 * 60 * MIN, watching: false }), true);
});

const quiet = { ...base, lastActivityMs: NOW - 31 * MIN, waitingCount: 0, setting: { quit: true, minutes: 30 }, linked: false, startHookInstalled: true };

test('quits after the chosen quiet spell, not before', () => {
  assert.strictEqual(shouldQuitWhenIdle(quiet), true);
  assert.strictEqual(shouldQuitWhenIdle({ ...quiet, lastActivityMs: NOW - 29 * MIN }), false);
  assert.strictEqual(shouldQuitWhenIdle({ ...quiet, setting: { quit: true, minutes: 60 } }), false);
  assert.strictEqual(shouldQuitWhenIdle({ ...quiet, setting: { quit: true, minutes: 10 }, lastActivityMs: NOW - 11 * MIN }), true);
});

test('an unknown number of minutes means thirty', () => {
  assert.strictEqual(shouldQuitWhenIdle({ ...quiet, setting: { quit: true, minutes: 7 }, lastActivityMs: NOW - 29 * MIN }), false);
  assert.strictEqual(shouldQuitWhenIdle({ ...quiet, setting: { quit: true, minutes: 7 }, lastActivityMs: NOW - 31 * MIN }), true);
});

test('never quits when that is not safe', () => {
  assert.strictEqual(shouldQuitWhenIdle({ ...quiet, setting: { quit: false, minutes: 30 } }), false);
  assert.strictEqual(shouldQuitWhenIdle({ ...quiet, setting: undefined }), false);
  assert.strictEqual(shouldQuitWhenIdle({ ...quiet, windowOpen: true }), false);
  assert.strictEqual(shouldQuitWhenIdle({ ...quiet, waitingCount: 1 }), false);
  assert.strictEqual(shouldQuitWhenIdle({ ...quiet, linked: true }), false);
  assert.strictEqual(shouldQuitWhenIdle({ ...quiet, startHookInstalled: false }), false);
  assert.strictEqual(shouldQuitWhenIdle({ ...quiet, watching: false }), false);
});

test('a computer is linked as a master, or as a node with a master', () => {
  assert.strictEqual(isLinked({ role: 'master' }), true);
  assert.strictEqual(isLinked({ role: 'node', masterUrl: 'http://x:3000' }), true);
  assert.strictEqual(isLinked({ role: 'node', masterUrl: '', masterUrls: ['http://x:3000'] }), true);
  assert.strictEqual(isLinked({ role: 'node', masterUrl: '', masterUrls: [] }), false);
  assert.strictEqual(isLinked(undefined), false);
});

test('finds the start hook in a Claude settings file', () => {
  assert.strictEqual(hasStartHook('{"hooks":{"SessionStart":[{"hooks":[{"command":"\\"C:/H/HoldMySession.exe\\" --holdmysession-start"}]}]}}'), true);
  assert.strictEqual(hasStartHook('node "/a/bin/ensure-running.mjs"'), true);
  assert.strictEqual(hasStartHook('{"hooks":{}}'), false);
  assert.strictEqual(hasStartHook(null), false);
});

test('an app started with Claude not in use has nothing to poll', () => {
  assert.strictEqual(shouldPoll({ nowMs: NOW, lastActivityMs: 0, windowOpen: false, watching: true }), false);
});

test('finds when a transcript was last written, from file times alone', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-'));
  try {
    const write = (project, name, seconds) => {
      fs.mkdirSync(path.join(dir, project), { recursive: true });
      const file = path.join(dir, project, name);
      fs.writeFileSync(file, '{}\n');
      fs.utimesSync(file, seconds, seconds);
    };
    write('p1', 'a.jsonl', 1000);
    write('p2', 'b.jsonl', 5000);
    write('p2', 'notes.txt', 9000);
    assert.strictEqual(newestTranscriptMtime(dir), 5_000_000);
    assert.strictEqual(newestTranscriptMtime(path.join(dir, 'missing')), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
