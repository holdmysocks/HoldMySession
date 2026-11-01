// Run with: node --test alerts.test.cjs
const test = require('node:test');
const assert = require('node:assert');
const { planAlerts, notificationFor, trayState, mapPathFor } = require('./alerts.cjs');

const wait = (id, since = 't1', extra = {}) => ({ sessionId: id, since, title: `Session ${id}`, projectName: 'checkout-app', projectKey: '-home-me-checkout-app', waiting: { kind: 'permission', text: 'Wants to run Bash' }, ...extra });

test('tells about a new wait once, then not again while it lasts', () => {
  const first = planAlerts({ waiting: [wait('a')], alerted: new Set(), enabled: true, windowFocused: false });
  assert.deepStrictEqual(first.notify.map((w) => w.sessionId), ['a']);
  const again = planAlerts({ waiting: [wait('a')], alerted: first.alerted, enabled: true, windowFocused: false });
  assert.deepStrictEqual(again.notify, []);
});

test('a session that waits again later is a new wait', () => {
  const first = planAlerts({ waiting: [wait('a', 't1')], alerted: new Set(), enabled: true, windowFocused: false });
  const gone = planAlerts({ waiting: [], alerted: first.alerted, enabled: true, windowFocused: false });
  const later = planAlerts({ waiting: [wait('a', 't2')], alerted: gone.alerted, enabled: true, windowFocused: false });
  assert.strictEqual(later.notify.length, 1);
});

test('says nothing while the window is in view or alerts are off, and does not bring those waits back afterwards', () => {
  const quiet = planAlerts({ waiting: [wait('a')], alerted: new Set(), enabled: true, windowFocused: true });
  assert.deepStrictEqual(quiet.notify, []);
  const looked = planAlerts({ waiting: [wait('a')], alerted: quiet.alerted, enabled: true, windowFocused: false });
  assert.deepStrictEqual(looked.notify, []);
  const off = planAlerts({ waiting: [wait('b')], alerted: new Set(), enabled: false, windowFocused: false });
  assert.deepStrictEqual(off.notify, []);
  assert.strictEqual(planAlerts({ waiting: [wait('b')], alerted: off.alerted, enabled: true, windowFocused: false }).notify.length, 0);
});

test('a new wait next to an old one is the only one announced', () => {
  const first = planAlerts({ waiting: [wait('a')], alerted: new Set(), enabled: true, windowFocused: false });
  const next = planAlerts({ waiting: [wait('a'), wait('b')], alerted: first.alerted, enabled: true, windowFocused: false });
  assert.deepStrictEqual(next.notify.map((w) => w.sessionId), ['b']);
});

test('words one wait with what it wants, and several as a count', () => {
  assert.deepStrictEqual(notificationFor([wait('a')]), { title: 'Session a needs you', body: 'Wants to run Bash (checkout-app)' });
  assert.deepStrictEqual(notificationFor([wait('a'), wait('b'), wait('c')]), { title: '3 sessions need you', body: 'Session a, Session b and 1 more' });
  assert.strictEqual(notificationFor([wait('a'), wait('b')]).body, 'Session a and Session b');
});

test('the tray shows a count, and goes back to plain when nobody waits', () => {
  assert.deepStrictEqual(trayState(2, '0.8.6'), { alert: true, tooltip: 'HoldMySession 0.8.6: 2 sessions need you', macTitle: '2' });
  assert.strictEqual(trayState(1, '0.8.6').tooltip, 'HoldMySession 0.8.6: 1 session needs you');
  assert.deepStrictEqual(trayState(0, '0.8.6'), { alert: false, tooltip: 'HoldMySession 0.8.6', macTitle: '' });
});

test('a click opens the map on that session', () => {
  assert.strictEqual(mapPathFor(wait('abc')), '/map?project=-home-me-checkout-app&session=abc');
});
