const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// The packaged app holds only the files the packaging script copies. A file the program needs that it does not copy makes
// the app fail at start, and only in the packaged app, so this checks the two agree.
const script = fs.readFileSync(path.join(__dirname, 'scripts', 'package.mjs'), 'utf8');

function required(file) {
  const text = fs.readFileSync(path.join(__dirname, file), 'utf8');
  return [...text.matchAll(/require\('\.\/([\w.-]+\.cjs)'\)/g)].map((m) => m[1]);
}

test('every program file the app requires is copied into the package', () => {
  const files = new Set(['main.cjs', 'updater.cjs', 'launch.cjs', 'swap.cjs', 'alerts.cjs', 'idle.cjs']);
  for (const file of fs.readdirSync(__dirname)) {
    if (file.endsWith('.cjs') && !file.endsWith('.test.cjs')) files.add(file);
  }
  for (const file of files) {
    assert.ok(script.includes(`join(desktop, '${file}')`), `${file} is not copied by scripts/package.mjs`);
  }
});

test('everything main.cjs and the files it requires depend on is a file that exists', () => {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    assert.ok(fs.existsSync(path.join(__dirname, file)), `${file} is required but is not there`);
    for (const next of required(file)) visit(next);
  };
  visit('main.cjs');
  for (const file of seen) assert.ok(script.includes(`join(desktop, '${file}')`), `${file} is required by the app but not copied into the package`);
});
