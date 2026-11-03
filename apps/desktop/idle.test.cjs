const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BUSY_MS, shouldPoll, newestTranscriptMtime } = require('./idle.cjs');

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

test('an app started with Claude not in use has nothing to poll', () => {
  assert.strictEqual(shouldPoll({ ...base, lastActivityMs: 0 }), false);
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
