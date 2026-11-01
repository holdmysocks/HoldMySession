// Deciding when to tell the user a session needs them, kept apart from Electron so it can be tested.
//
// The app asks the server every few seconds which sessions of this computer are waiting. A session is told
// about once for each wait: its key is the session and when the wait began, so a session that waits again later
// is a new wait.

const keyOf = (w) => `${w.sessionId}@${w.since}`;

/**
 * @param {object} o
 * @param {Array<{sessionId: string, since: string}>} o.waiting  who waits right now
 * @param {Set<string>} o.alerted                                waits already told about
 * @param {boolean} o.enabled                                    the setting
 * @param {boolean} o.windowFocused                              the user is looking at the app, so no alert is needed
 * @returns {{ notify: Array, alerted: Set<string> }}
 */
function planAlerts({ waiting, alerted, enabled, windowFocused }) {
  const next = new Set(waiting.map(keyOf));
  // Every current wait counts as told about, even when it was not announced (alerts off, or the window in view),
  // so turning alerts on or looking away does not bring back old ones.
  const notify = enabled && !windowFocused ? waiting.filter((w) => !alerted.has(keyOf(w))) : [];
  return { notify, alerted: next };
}

/** The words of one notification for a batch of new waits. */
function notificationFor(batch) {
  if (batch.length === 1) {
    const w = batch[0];
    return { title: `${w.title} needs you`, body: `${w.waiting.text} (${w.projectName})` };
  }
  const names = batch.slice(0, 2).map((w) => w.title);
  const more = batch.length - names.length;
  return {
    title: `${batch.length} sessions need you`,
    body: more > 0 ? `${names.join(', ')} and ${more} more` : names.join(' and '),
  };
}

/** What the tray shows: a count on a Mac's menu bar, a dot on the icon, and a tooltip. */
function trayState(count, version) {
  return {
    alert: count > 0,
    tooltip: count > 0 ? `HoldMySession ${version}: ${count} ${count === 1 ? 'session needs' : 'sessions need'} you` : `HoldMySession ${version}`,
    macTitle: count > 0 ? String(count) : '',
  };
}

/** Where a click on a notification goes: the map of that session's project, with the session picked. */
function mapPathFor(w) {
  return `/map?project=${encodeURIComponent(w.projectKey)}&session=${encodeURIComponent(w.sessionId)}`;
}

module.exports = { planAlerts, notificationFor, trayState, mapPathFor };
