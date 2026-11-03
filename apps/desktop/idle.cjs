// Deciding when the app can stop working, kept apart from Electron so it can be tested.
//
// The desktop app only has something to do while Claude Code is in use: sessions to look at, questions to alert on. So
// it watches for signs of Claude's activity (its transcripts being written, hook events, the status line), polls only
// while there is some, and, when asked to, quits after a long quiet spell. The Claude Code hook that starts the app
// brings it back with the next session or the next message.

/** How long after the last sign of activity the app still polls, so a state that is about to change is seen. */
// HOLDMYSESSION_BUSY_MS and HOLDMYSESSION_IDLE_MS shorten the two spells, for testing the real app without waiting.
const BUSY_MS = Number(process.env.HOLDMYSESSION_BUSY_MS) || 10 * 60_000;

/** The choices for how long a quiet spell must last before the app quits, in minutes. */
const QUIT_AFTER_MINUTES = [10, 30, 60, 120];

/**
 * Whether to look for sessions that need the user now. Always while the window is open, and while Claude was active lately.
 * Without a way to watch for activity, always, as before.
 */
function shouldPoll({ nowMs, lastActivityMs, windowOpen, watching }) {
  if (!watching || windowOpen) return true;
  return nowMs - lastActivityMs <= BUSY_MS;
}

/**
 * Whether the app should quit for being idle. Only when it is safe: the setting is on, no window is open, nothing is
 * waiting on the user, this computer is not linked to another (a master serves the others, and a node answers its
 * master), and the start hook is installed, so the next Claude session starts the app again.
 */
function shouldQuitWhenIdle({ nowMs, lastActivityMs, windowOpen, watching, waitingCount, setting, linked, startHookInstalled }) {
  if (!setting || !setting.quit || !watching || windowOpen || waitingCount > 0 || linked || !startHookInstalled) return false;
  const minutes = QUIT_AFTER_MINUTES.includes(setting.minutes) ? setting.minutes : 30;
  return nowMs - lastActivityMs >= (Number(process.env.HOLDMYSESSION_IDLE_MS) || minutes * 60_000);
}

/** Whether this computer is linked to another one, as a master with nodes or as a node with a master. */
function isLinked(link) {
  if (!link) return false;
  if (link.role === 'master') return true;
  return Boolean(link.masterUrl) || (Array.isArray(link.masterUrls) && link.masterUrls.length > 0);
}

/** Whether a Claude settings file text holds our start hook. A plain look, so a file that is not valid JSON still counts. */
function hasStartHook(settingsText) {
  return typeof settingsText === 'string' && (settingsText.includes('--holdmysession-start') || settingsText.includes('ensure-running'));
}

module.exports = { BUSY_MS, QUIT_AFTER_MINUTES, shouldPoll, shouldQuitWhenIdle, isLinked, hasStartHook };
