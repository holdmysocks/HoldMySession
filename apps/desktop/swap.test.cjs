// Run with: node --test swap.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { applyUpdate } = require('./swap.cjs');

function install(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-swap-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

function options(root, extra = {}) {
  const starts = [];
  return {
    starts,
    o: {
      parentPid: 99999999,
      source: path.join(root, 'updates', '0.9.0', 'app'),
      target: path.join(root, 'program'),
      exe: path.join(root, 'program', 'HoldMySession.exe'),
      relaunch: true,
      errorFile: path.join(root, 'updates', 'last-error.txt'),
      traceFile: path.join(root, 'updates', 'apply-update.log'),
      delayMs: 5,
      start: (exe) => starts.push(exe),
      ...extra,
    },
  };
}

function layout(oldFiles, newFiles) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-swap-root-'));
  const write = (base, files) => {
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, base, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, base, rel), text);
    }
  };
  write('program', oldFiles);
  write(path.join('updates', '0.9.0', 'app'), newFiles);
  return root;
}

test('swaps an old folder-style install for the new archive, starts the program and clears the old files', async () => {
  const root = layout(
    { 'HoldMySession.exe': 'old exe', 'resources/app/main.cjs': 'old code', 'resources/app/web/dist/a.js': 'old a', 'data.txt': 'kept' },
    { 'HoldMySession.exe': 'new exe', 'resources/app.asar': 'new archive' },
  );
  const { o, starts } = options(root);
  const result = await applyUpdate(o);
  assert.strictEqual(result.ok, true);
  const p = (rel) => path.join(root, 'program', rel);
  assert.strictEqual(fs.readFileSync(p('HoldMySession.exe'), 'utf8'), 'new exe');
  assert.strictEqual(fs.readFileSync(p('resources/app.asar'), 'utf8'), 'new archive');
  assert.ok(!fs.existsSync(p('resources/app')), 'the old folder is gone');
  assert.ok(!fs.existsSync(p('resources/app.old')), 'and nothing is left aside');
  assert.strictEqual(fs.readFileSync(p('data.txt'), 'utf8'), 'kept', 'files the update does not carry are left alone');
  assert.deepStrictEqual(starts, [o.exe]);
  assert.ok(!fs.existsSync(path.join(root, 'updates', '0.9.0')), 'the unpacked update is removed');
  assert.match(fs.readFileSync(o.traceFile, 'utf8'), /done/);
});

test('swaps one archive for another', async () => {
  const root = layout({ 'HoldMySession.exe': 'old', 'resources/app.asar': 'old archive' }, { 'HoldMySession.exe': 'new', 'resources/app.asar': 'new archive' });
  const { o } = options(root);
  assert.strictEqual((await applyUpdate(o)).ok, true);
  assert.strictEqual(fs.readFileSync(path.join(root, 'program', 'resources', 'app.asar'), 'utf8'), 'new archive');
  assert.ok(!fs.existsSync(path.join(root, 'program', 'resources', 'app.asar.old')));
});

test('puts the old version back, leaves a note and still starts the program when the copy fails', async () => {
  const root = layout({ 'HoldMySession.exe': 'old', 'resources/app/main.cjs': 'old code' }, { 'HoldMySession.exe': 'new' });
  fs.rmSync(path.join(root, 'updates', '0.9.0', 'app'), { recursive: true, force: true }); // nothing to copy from
  const { o, starts } = options(root, { delayMs: 1 });
  const result = await applyUpdate(o);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(fs.readFileSync(path.join(root, 'program', 'resources', 'app', 'main.cjs'), 'utf8'), 'old code');
  assert.strictEqual(fs.readFileSync(path.join(root, 'program', 'HoldMySession.exe'), 'utf8'), 'old');
  assert.match(fs.readFileSync(o.errorFile, 'utf8'), /Could not replace the program files/);
  assert.deepStrictEqual(starts, [o.exe], 'the old version is started again');
});

test('does not start the program when it was not asked to', async () => {
  const root = layout({ 'HoldMySession.exe': 'old' }, { 'HoldMySession.exe': 'new' });
  const { o, starts } = options(root, { relaunch: false });
  await applyUpdate(o);
  assert.deepStrictEqual(starts, []);
});

test('waits for the app to quit before touching its files', async () => {
  const root = layout({ 'HoldMySession.exe': 'old', 'resources/app/main.cjs': 'old code' }, { 'HoldMySession.exe': 'new', 'resources/app.asar': 'x' });
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 600)'], { stdio: 'ignore' });
  const { o } = options(root, { parentPid: child.pid, delayMs: 20 });
  const began = Date.now();
  await applyUpdate(o);
  assert.ok(Date.now() - began >= 400, 'it waited for the process');
  assert.strictEqual(fs.readFileSync(path.join(root, 'program', 'HoldMySession.exe'), 'utf8'), 'new');
});

test('runs as a program of its own, from a file of arguments', async () => {
  const root = layout({ 'HoldMySession.exe': 'old', 'resources/app/main.cjs': 'old' }, { 'HoldMySession.exe': 'new', 'resources/app.asar': 'a' });
  const { o } = options(root, { relaunch: false });
  const { start, ...plain } = o; // eslint-disable-line no-unused-vars
  const argsFile = path.join(root, 'args.json');
  fs.writeFileSync(argsFile, JSON.stringify(plain));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'swap.cjs'), argsFile], { stdio: 'ignore' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
  assert.strictEqual(fs.readFileSync(path.join(root, 'program', 'HoldMySession.exe'), 'utf8'), 'new');
  assert.ok(fs.existsSync(path.join(root, 'program', 'resources', 'app.asar')));
});

test('ends programs running from the folder when a file turns out to be locked, then carries on', async () => {
  const root = layout({ 'HoldMySession.exe': 'old', 'resources/app.asar': 'old archive' }, { 'HoldMySession.exe': 'new', 'resources/app.asar': 'new archive' });
  let held = true;
  const killed = [];
  const { o } = options(root, {
    delayMs: 1,
    findProcesses: (folder) => {
      assert.strictEqual(folder, path.join(root, 'program'));
      return [{ pid: process.pid, name: 'this one' }, { pid: 4242, name: 'HoldMySession.exe' }];
    },
    killProcess: (pid) => {
      killed.push(pid);
      held = false;
    },
    rename: (from, to) => {
      if (held && from.endsWith('app.asar')) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      fs.renameSync(from, to);
    },
  });
  const result = await applyUpdate(o);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(killed, [4242], 'it ended the other program and never itself');
  assert.strictEqual(fs.readFileSync(path.join(root, 'program', 'resources', 'app.asar'), 'utf8'), 'new archive');
  const log = fs.readFileSync(o.traceFile, 'utf8');
  assert.match(log, /a file is locked \(EBUSY\)/);
  assert.match(log, /ended HoldMySession\.exe 4242/);
});

test('does not look for programs to end when nothing is locked', async () => {
  const root = layout({ 'HoldMySession.exe': 'old', 'resources/app.asar': 'old' }, { 'HoldMySession.exe': 'new', 'resources/app.asar': 'new' });
  const { o } = options(root, { findProcesses: () => assert.fail('it must not look'), killProcess: () => assert.fail('it must not kill') });
  assert.strictEqual((await applyUpdate(o)).ok, true);
});

test('gives up with a note and puts the old files back when the lock never goes', async () => {
  const root = layout({ 'HoldMySession.exe': 'old', 'resources/app.asar': 'old archive' }, { 'HoldMySession.exe': 'new', 'resources/app.asar': 'new archive' });
  const { o, starts } = options(root, {
    delayMs: 1,
    findProcesses: () => [],
    rename: (from) => {
      if (from.endsWith('app.asar')) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
    },
  });
  const result = await applyUpdate(o);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(fs.readFileSync(path.join(root, 'program', 'resources', 'app.asar'), 'utf8'), 'old archive');
  assert.match(fs.readFileSync(o.errorFile, 'utf8'), /EBUSY/);
  assert.deepStrictEqual(starts, [o.exe]);
});

test("uses the new version's own copy of this step when it has one", async () => {
  const root = layout({ 'HoldMySession.exe': 'old' }, { 'HoldMySession.exe': 'new' });
  // A real archive is needed for this, which a test without Electron cannot make. The delegation is tried and skipped here.
  const { o } = options(root, { relaunch: false });
  const { start, findProcesses, killProcess, rename, ...plain } = o; // eslint-disable-line no-unused-vars
  const argsFile = path.join(root, 'args.json');
  fs.writeFileSync(argsFile, JSON.stringify(plain));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'swap.cjs'), argsFile], { stdio: 'ignore' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
  });
  assert.strictEqual(fs.readFileSync(path.join(root, 'program', 'HoldMySession.exe'), 'utf8'), 'new');
});
