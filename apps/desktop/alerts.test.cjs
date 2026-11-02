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

const { planLimitAlerts, limitsText, timeLeft } = require('./alerts.cjs');

const NOW = Date.parse('2026-11-02T21:10:00Z');
const w = (used, hoursLeft = 2.5) => ({ usedPercentage: used, resetsAt: Math.round((NOW + hoursLeft * 3600000) / 1000) });
const look = (limits, state = {}, extra = {}) =>
  planLimitAlerts({ limits: { enabled: true, fiveHour: null, sevenDay: null, ...limits }, state, windowFocused: false, nowMs: NOW, ...extra });
const later = (limits, state, minutes) =>
  planLimitAlerts({ limits: { enabled: true, fiveHour: null, sevenDay: null, ...limits }, state, windowFocused: false, nowMs: NOW + minutes * 60000 });
const RESET = { title: '5-hour window reset', body: 'You are back to 0%.' };

test('limits: the first look only sets the baseline, even at 80%', () => {
  const r = look({ fiveHour: w(80) });
  assert.deepStrictEqual(r.notify, []);
  assert.strictEqual(r.state.fiveHour.level, 1);
});

test('limits: tells once as a window passes 75, and again at 90', () => {
  let r = look({ fiveHour: w(60) });
  r = look({ fiveHour: w(76) }, r.state);
  assert.deepStrictEqual(r.notify, [{ title: '5-hour window at 76%', body: 'It resets in 2h 30m.' }]);
  r = look({ fiveHour: w(80) }, r.state);
  assert.deepStrictEqual(r.notify, []);
  r = look({ fiveHour: w(91) }, r.state);
  assert.deepStrictEqual(r.notify, [{ title: '5-hour window at 91%', body: 'Only 9% is left. It resets in 2h 30m.' }]);
  r = look({ fiveHour: w(95) }, r.state);
  assert.deepStrictEqual(r.notify, []);
});

test('limits: a jump from under 75 to over 90 is one alert, the red one', () => {
  const r = look({ fiveHour: w(95) }, look({ fiveHour: w(10) }).state);
  assert.strictEqual(r.notify.length, 1);
  assert.ok(r.notify[0].body.includes('Only 5% is left'));
});

test('limits: says the weekly limit by name, with its time left', () => {
  const r = look({ sevenDay: w(76, 77) }, look({ sevenDay: w(50, 77) }).state);
  assert.deepStrictEqual(r.notify, [{ title: 'Weekly limit at 76%', body: 'It resets in 3d 5h.' }]);
});

test('limits: tells when a window that was run up has reset, in a new window or with none', () => {
  const high = look({ fiveHour: w(92, 0.25) }).state;
  const replaced = later({ fiveHour: w(3, 5) }, high, 20);
  assert.deepStrictEqual(replaced.notify, [RESET]);
  assert.strictEqual(replaced.state.fiveHour.level, 0);
  const none = later({}, high, 20);
  assert.deepStrictEqual(none.notify, [RESET]);
  assert.strictEqual(none.state.fiveHour, undefined);
});

test('limits: says nothing when a window that never got high ends', () => {
  assert.deepStrictEqual(later({}, look({ fiveHour: w(20, 0.25) }).state, 20).notify, []);
});

test('limits: a window missing from one report, before its reset, is kept', () => {
  const state = look({ fiveHour: w(80) }).state;
  const r = look({ fiveHour: null }, state);
  assert.deepStrictEqual(r.state.fiveHour, state.fiveHour);
  assert.deepStrictEqual(r.notify, []);
});

test('limits: keeps the baseline and says nothing while alerts are off or the window is in view', () => {
  const state = look({ fiveHour: w(60) }).state;
  const off = look({ enabled: false, fiveHour: w(80) }, state);
  assert.deepStrictEqual(off.notify, []);
  assert.strictEqual(off.state.fiveHour.level, 1);
  // Turning alerts on later does not bring the old crossing back.
  assert.deepStrictEqual(look({ fiveHour: w(80) }, off.state).notify, []);
  assert.deepStrictEqual(look({ fiveHour: w(80) }, state, { windowFocused: true }).notify, []);
});

test('limits: a plan with no 5-hour window is only ever told about the week', () => {
  const r = look({ sevenDay: w(80, 70) }, look({ sevenDay: w(10, 70) }).state);
  assert.deepStrictEqual(r.notify.map((n) => n.title), ['Weekly limit at 80%']);
  assert.strictEqual(r.state.fiveHour, undefined);
});

test('limits: the tray line shows only the windows there are', () => {
  assert.strictEqual(limitsText({ fiveHour: w(78), sevenDay: w(41) }), '5h 78% · week 41%');
  assert.strictEqual(limitsText({ fiveHour: null, sevenDay: w(41) }), 'week 41%');
  assert.strictEqual(limitsText({ fiveHour: null, sevenDay: null }), '');
  assert.strictEqual(limitsText(null), '');
});

test('limits: trayState adds the limits line to the tooltip, within what Windows allows', () => {
  assert.strictEqual(trayState(0, '0.9.0', 'week 41%').tooltip, 'HoldMySession 0.9.0 · week 41%');
  assert.strictEqual(trayState(2, '0.9.0', '5h 78% · week 41%').tooltip, 'HoldMySession 0.9.0: 2 sessions need you · 5h 78% · week 41%');
  assert.ok(trayState(2, '0.9.0', '5h 78% · week 41%').tooltip.length < 127);
  assert.strictEqual(trayState(0, '0.9.0').tooltip, 'HoldMySession 0.9.0');
});

test('limits: timeLeft', () => {
  assert.strictEqual(timeLeft(Math.round((NOW + 45 * 60000) / 1000), NOW), '45m');
  assert.strictEqual(timeLeft(Math.round((NOW + 77 * 3600000) / 1000), NOW), '3d 5h');
  assert.strictEqual(timeLeft(1, NOW), '0m');
});
