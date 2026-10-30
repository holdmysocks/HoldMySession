// Run with: node --test updater.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createUpdater, parseSums, helperScript } = require('./updater.cjs');

const NAME = 'HoldMySession-0.7.0-win-x64.zip';

function makeZip(dir) {
  const content = path.join(dir, 'content');
  fs.mkdirSync(content, { recursive: true });
  fs.writeFileSync(path.join(content, 'HoldMySession.exe'), 'new program');
  const zip = path.join(dir, NAME);
  execFileSync('zip', ['-q', '-r', zip, '.'], { cwd: content });
  return fs.readFileSync(zip);
}

function fakeFetch(files) {
  return async (url) => {
    const body = files[url];
    return body === undefined ? new Response('', { status: 404 }) : new Response(body, { status: 200, headers: { 'content-length': String(Buffer.byteLength(body)) } });
  };
}

function updaterFor(dir, files, extra = {}) {
  const quits = [];
  const updater = createUpdater({
    dataDir: path.join(dir, 'data'),
    exePath: path.join(dir, 'app', 'HoldMySession.exe'),
    pid: 1234,
    platform: 'win32',
    packaged: true,
    quit: () => quits.push(1),
    fetchImpl: fakeFetch(files),
    extract: async (zip, dest) => execFileSync('unzip', ['-q', zip, '-d', dest]),
    ...extra,
  });
  return { updater, quits };
}

const release = { version: '0.7.0', name: NAME, url: 'https://github.com/x/y/releases/download/v0.7.0/' + NAME, sumsUrl: 'https://github.com/x/y/releases/download/v0.7.0/SHA256SUMS.txt' };
const settled = async (updater) => {
  for (let i = 0; i < 200 && updater.status().phase === 'downloading'; i++) await new Promise((r) => setTimeout(r, 10));
  return updater.status();
};

test('parseSums finds the checksum for one file', () => {
  const hex = 'a'.repeat(64);
  assert.strictEqual(parseSums(`${hex}  other.zip\n${'b'.repeat(64)}  ${NAME}\n`, NAME), 'b'.repeat(64));
  assert.strictEqual(parseSums(`${hex} *${NAME}`, NAME), hex);
  assert.strictEqual(parseSums('nothing here', NAME), null);
});

test('a good download is verified, unpacked and ready', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-upd-'));
  fs.mkdirSync(path.join(dir, 'app'));
  const zip = makeZip(dir);
  const sums = `${crypto.createHash('sha256').update(zip).digest('hex')}  ${NAME}\n`;
  const { updater } = updaterFor(dir, { [release.url]: zip, [release.sumsUrl]: sums });
  updater.download(release, false);
  const status = await settled(updater);
  assert.strictEqual(status.phase, 'ready', status.error);
  assert.ok(fs.existsSync(path.join(dir, 'data', 'updates', '0.7.0', 'app', 'HoldMySession.exe')));
  assert.ok(!fs.existsSync(path.join(dir, 'data', 'updates', '0.7.0', NAME)), 'the zip is removed once unpacked');
});

test('a download that does not match its checksum is refused and cleaned up', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-upd-'));
  fs.mkdirSync(path.join(dir, 'app'));
  const zip = makeZip(dir);
  const { updater, quits } = updaterFor(dir, { [release.url]: zip, [release.sumsUrl]: `${'0'.repeat(64)}  ${NAME}\n` });
  updater.download(release, true);
  const status = await settled(updater);
  assert.strictEqual(status.phase, 'error');
  assert.match(status.error, /checksum/);
  assert.strictEqual(quits.length, 0, 'it must not install');
  assert.ok(!fs.existsSync(path.join(dir, 'data', 'updates', '0.7.0')));
});

test('a release without checksums for the file, or not on GitHub, is refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-upd-'));
  fs.mkdirSync(path.join(dir, 'app'));
  const zip = makeZip(dir);
  let { updater } = updaterFor(dir, { [release.url]: zip, [release.sumsUrl]: 'nothing' });
  updater.download(release, false);
  assert.match((await settled(updater)).error, /checksums/);
  ({ updater } = updaterFor(dir, {}));
  updater.download({ ...release, url: 'https://evil.example/x.zip' }, false);
  assert.match((await settled(updater)).error, /GitHub/);
});

test('a source checkout does not replace itself', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-upd-'));
  const { updater } = updaterFor(dir, {}, { packaged: false });
  assert.strictEqual(updater.supported().ok, false);
});

test('the swap scripts wait for the app, copy over it, and relaunch only when asked', () => {
  const win = helperScript('win32');
  assert.match(win, /Get-Process -Id \$ParentPid/);
  assert.match(win, /Copy-Item/);
  assert.match(win, /\$Relaunch -eq 1/);
  const mac = helperScript('darwin');
  assert.match(mac, /kill -0 "\$PARENT"/);
  assert.match(mac, /ditto/);
  assert.match(mac, /RELAUNCH" = "1"/);
});
