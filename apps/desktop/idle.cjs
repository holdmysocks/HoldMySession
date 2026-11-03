// Deciding when the app can stop working, kept apart from Electron so it can be tested.
//
// The desktop app only has something to do while Claude Code is in use: sessions to look at, questions to alert on. So
// it watches for signs of Claude's activity (its transcripts being written, hook events, the status line), polls only
// while there is some, and, when asked to, quits after a long quiet spell. The Claude Code hook that starts the app
// brings it back with the next session or the next message.

const fs = require('node:fs');
const path = require('node:path');

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
 * waiting on the user, this computer is not a master (a master stays running so its nodes can reach it), and the start hook
 * is installed, so the next Claude session starts the app again. A node may quit: it has sent its sessions to its master,
 * and the master shows it as offline until it starts again.
 */
function shouldQuitWhenIdle({ nowMs, lastActivityMs, windowOpen, watching, waitingCount, setting, master, startHookInstalled }) {
  if (!setting || !setting.quit || !watching || windowOpen || waitingCount > 0 || master || !startHookInstalled) return false;
  const minutes = QUIT_AFTER_MINUTES.includes(setting.minutes) ? setting.minutes : 30;
  return nowMs - lastActivityMs >= (Number(process.env.HOLDMYSESSION_IDLE_MS) || minutes * 60_000);
}

/** Whether this computer is a master, which stays running so its nodes can reach it. */
function isMaster(link) {
  return Boolean(link) && link.role === 'master';
}

/** Whether this computer is a node with a master to send its sessions to. */
function isLinkedNode(link) {
  if (!link || link.role === 'master') return false;
  return Boolean(link.masterUrl) || (Array.isArray(link.masterUrls) && link.masterUrls.length > 0);
}

/** Whether a Claude settings file text holds our start hook. A plain look, so a file that is not valid JSON still counts. */
function hasStartHook(settingsText) {
  return typeof settingsText === 'string' && (settingsText.includes('--holdmysession-start') || settingsText.includes('ensure-running'));
}

/**
 * When a session transcript under `projectsDir` was last written, in milliseconds, or 0 if there is none. Looks at file
 * times only, so launching the app does not read any transcript, and an app started with nothing going on has nothing to poll.
 */
function newestTranscriptMtime(projectsDir) {
  let newest = 0;
  let projects;
  try {
    projects = fs.readdirSync(projectsDir);
  } catch {
    return 0;
  }
  for (const project of projects) {
    let names;
    try {
      names = fs.readdirSync(path.join(projectsDir, project));
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue;
      try {
        newest = Math.max(newest, fs.statSync(path.join(projectsDir, project, name)).mtimeMs);
      } catch {
        // Gone since it was listed.
      }
    }
  }
  return newest;
}

module.exports = { BUSY_MS, QUIT_AFTER_MINUTES, shouldPoll, shouldQuitWhenIdle, isMaster, isLinkedNode, hasStartHook, newestTranscriptMtime };
