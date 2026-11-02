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
function trayState(count, version, limitsLine = '') {
  const base = count > 0 ? `HoldMySession ${version}: ${count} ${count === 1 ? 'session needs' : 'sessions need'} you` : `HoldMySession ${version}`;
  return {
    alert: count > 0,
    tooltip: limitsLine ? `${base} · ${limitsLine}` : base,
    macTitle: count > 0 ? String(count) : '',
  };
}

/** Where a click on a notification goes: the map of that session's project, with the session picked. */
function mapPathFor(w) {
  return `/map?project=${encodeURIComponent(w.projectKey)}&session=${encodeURIComponent(w.sessionId)}`;
}

// --- Subscription limits ---
//
// The app asks the server every half minute for the windows Claude Code last reported. It tells the user as a window
// passes 75% (yellow) and again at 90% (red), and when a window they had run up has reset. Nothing is said about
// where it starts: the first look only sets the baseline, so opening the app at 80% is not an alert.

const WARN_AT = 75;
const DANGER_AT = 90;
const levelOf = (used) => (used >= DANGER_AT ? 2 : used >= WARN_AT ? 1 : 0);
const WINDOWS = [
  { key: 'fiveHour', label: '5-hour window', short: '5h' },
  { key: 'sevenDay', label: 'Weekly limit', short: 'week' },
];

/** "2h 30m", "45m", "3d 5h": how long until a reset, given in epoch seconds. */
function timeLeft(resetsAtSeconds, nowMs) {
  const minutes = Math.round(Math.max(0, resetsAtSeconds * 1000 - nowMs) / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * @param {object} o
 * @param {{enabled: boolean, fiveHour: object|null, sevenDay: object|null}} o.limits  what the server reported
 * @param {object} o.state       what was seen last time: { fiveHour: {level, resetsAt}|null, sevenDay: ... }
 * @param {boolean} o.windowFocused  the user is looking at the app, so no alert is needed
 * @param {number} o.nowMs
 * @returns {{ notify: Array<{title: string, body: string}>, state: object }}
 */
function planLimitAlerts({ limits, state, windowFocused, nowMs }) {
  const next = {};
  const notify = [];
  for (const { key, label } of WINDOWS) {
    const cur = limits[key];
    const prev = state[key] || null;
    if (cur) {
      const level = levelOf(cur.usedPercentage);
      const pct = Math.round(cur.usedPercentage);
      const left = timeLeft(cur.resetsAt, nowMs);
      if (prev && prev.resetsAt === cur.resetsAt) {
        if (level > prev.level) {
          notify.push(
            level === 2
              ? { title: `${label} at ${pct}%`, body: `Only ${100 - pct}% is left. It resets in ${left}.` }
              : { title: `${label} at ${pct}%`, body: `It resets in ${left}.` },
          );
        }
        next[key] = { level: Math.max(level, prev.level), resetsAt: cur.resetsAt };
      } else {
        // A first look, or a new window: its level is the baseline. A window that was run up and has been replaced has reset.
        if (prev && prev.level >= 1) notify.push({ title: `${label} reset`, body: 'You are back to 0%.' });
        next[key] = { level, resetsAt: cur.resetsAt };
      }
    } else if (prev && nowMs < prev.resetsAt * 1000) {
      // Left out of one report, but not over yet.
      next[key] = prev;
    } else if (prev && prev.level >= 1) {
      notify.push({ title: `${label} reset`, body: 'You are back to 0%.' });
    }
  }
  return { notify: limits.enabled && !windowFocused ? notify : [], state: next };
}

/** One line for the tray, short enough for Windows' 127 characters: "HoldMySession 0.9.0 · 5h 78% · week 41%". */
function limitsText(limits) {
  return WINDOWS.filter((w) => limits && limits[w.key])
    .map((w) => `${w.short} ${Math.round(limits[w.key].usedPercentage)}%`)
    .join(' · ');
}

module.exports = { planAlerts, notificationFor, trayState, mapPathFor, planLimitAlerts, limitsText, timeLeft, levelOf };
