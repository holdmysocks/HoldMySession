// Run with: node --test launch.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const { isBackgroundLaunch, shouldShowWindowFor } = require('./launch.cjs');

test('a start by hand shows the window of the running app', () => {
  assert.strictEqual(shouldShowWindowFor(['C:\\Apps\\HoldMySession.exe']), true);
});

test('a background start, from the start hook or sign-in, leaves the running window alone', () => {
  assert.strictEqual(isBackgroundLaunch(['HoldMySession.exe', '--background']), true);
  assert.strictEqual(shouldShowWindowFor(['HoldMySession.exe', '--background']), false);
});

test('the flag is found wherever it sits among the arguments', () => {
  assert.strictEqual(shouldShowWindowFor(['x', '--no-sandbox', '--background']), false);
});

const net = require('node:net');
const { portInUse } = require('./launch.cjs');

function listen(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, host, () => resolve(server));
  });
}

test('finds an app listening on the IPv4 loopback', async () => {
  const server = await listen('127.0.0.1');
  try {
    assert.strictEqual(await portInUse(server.address().port, 500), true);
  } finally {
    server.close();
  }
});

test('finds an app listening only on the IPv6 loopback, which "localhost" can mean', async (t) => {
  let server;
  try {
    server = await listen('::1');
  } catch {
    t.skip('this computer has no IPv6 loopback');
    return;
  }
  try {
    assert.strictEqual(await portInUse(server.address().port, 500), true);
  } finally {
    server.close();
  }
});

test('says nothing is running when nothing listens', async () => {
  const server = await listen('127.0.0.1');
  const { port } = server.address();
  await new Promise((r) => server.close(r));
  assert.strictEqual(await portInUse(port, 500), false);
});
