// Deciding when the tray app has anything to do, kept apart from Electron so it can be tested.
//
// The desktop app only has something to do while Claude Code is in use: sessions to look at, questions to alert on. So
// it watches for signs of Claude's activity (its transcripts being written, hook events, the status line) and polls only
// while there is some. The rest of the time it sits in the tray and does nothing.

const fs = require('node:fs');
const path = require('node:path');

// HOLDMYSESSION_BUSY_MS shortens the spell, for testing the real app without waiting.
/** How long after the last sign of activity the app still polls, so a state that is about to change is seen. */
const BUSY_MS = Number(process.env.HOLDMYSESSION_BUSY_MS) || 10 * 60_000;

/**
 * Whether to look for sessions that need the user now. Always while the window is open, and while Claude was active lately.
 * Without a way to watch for activity, always, as before.
 */
function shouldPoll({ nowMs, lastActivityMs, windowOpen, watching }) {
  if (!watching || windowOpen) return true;
  return nowMs - lastActivityMs <= BUSY_MS;
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

module.exports = { BUSY_MS, shouldPoll, newestTranscriptMtime };
