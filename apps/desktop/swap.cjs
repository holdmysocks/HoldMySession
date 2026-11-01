// The swap step of an update: wait for the app to quit, put the new program files in place of the old ones,
// start the app again, and clear the old copy. It is plain Node, so it needs no PowerShell: the app runs it with the
// NEW version's program in Node mode (ELECTRON_RUN_AS_NODE), from the folder the update was unpacked in.
//
// The old files are moved aside first and put back if anything fails, so a failed swap leaves the old version working.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

/** What a version keeps its own code in: a folder (older versions) or a single archive. Moved aside, then replaced. */
const ITEMS = [
  [path.join('resources', 'app'), 'app.old'],
  [path.join('resources', 'app.asar'), 'app.asar.old'],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function retry(fn, tries, delayMs) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      await sleep(delayMs);
    }
  }
  throw last;
}

function startDetached(exe) {
  const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false });
  child.on('error', () => undefined);
  child.unref();
}

/**
 * @param {object} o
 * @param {number} o.parentPid     the app that is quitting
 * @param {string} o.source        the unpacked new version: what goes into `target`
 * @param {string} o.target        the program's folder
 * @param {string} o.exe           the program to start again
 * @param {boolean} o.relaunch
 * @param {string} o.errorFile     a note for the next start, written only when the swap failed
 * @param {string} o.traceFile     a step-by-step log
 * @param {number} [o.delayMs]     pause between tries, so tests can be quick
 * @param {number} [o.waitSeconds] how long to wait for the app to quit
 * @param {(exe: string) => void} [o.start] replaces starting the program (tests)
 */
async function applyUpdate(o) {
  const delayMs = o.delayMs ?? 500;
  const tries = 40;
  const start = o.start || startDetached;
  const note = (text) => {
    try {
      fs.appendFileSync(o.traceFile, `${new Date().toISOString()} ${text}\n`);
    } catch {
      // A log that cannot be written must not stop the update.
    }
  };
  const aside = (item) => path.join(o.target, path.dirname(item[0]), item[1]);
  const place = (item) => path.join(o.target, item[0]);
  const clearAside = () => {
    for (const item of ITEMS) fs.rmSync(aside(item), { recursive: true, force: true });
  };

  try {
    fs.mkdirSync(path.dirname(o.traceFile), { recursive: true });
    fs.writeFileSync(o.traceFile, '');
  } catch {
    // See above.
  }
  note(`started, waiting for process ${o.parentPid} to quit`);
  const patience = (o.waitSeconds ?? 60) * 1000;
  for (let waited = 0; isRunning(o.parentPid) && waited < patience; waited += delayMs) await sleep(delayMs);

  let moved = [];
  try {
    note('the program has quit, moving the old files aside');
    clearAside();
    for (const item of ITEMS) {
      await retry(() => (fs.existsSync(place(item)) ? fs.renameSync(place(item), aside(item)) : undefined), tries, delayMs);
      if (fs.existsSync(aside(item))) moved.push(item);
    }
    note('copying the new files in');
    for (const name of fs.readdirSync(o.source)) {
      await retry(() => fs.cpSync(path.join(o.source, name), path.join(o.target, name), { recursive: true, force: true }), tries, delayMs);
    }
    note('new files in place');
  } catch (error) {
    note(`failed: ${error && error.message}`);
    for (const item of moved) {
      try {
        fs.rmSync(place(item), { recursive: true, force: true });
        fs.renameSync(aside(item), place(item));
      } catch (restoreError) {
        note(`could not put ${item[1]} back: ${restoreError && restoreError.message}`);
      }
    }
    try {
      fs.writeFileSync(o.errorFile, `Could not replace the program files: ${(error && error.message) || error}`);
    } catch {
      // Nothing more can be done.
    }
    if (o.relaunch) start(o.exe);
    return { ok: false, error: (error && error.message) || String(error) };
  }

  // The new version starts as soon as its files are in place. Clearing the old copy can take a while.
  if (o.relaunch) {
    note('starting the program again');
    start(o.exe);
  }
  clearAside();
  try {
    // This step may be running from the unpacked folder, which then cannot be removed yet. The app clears it on its next start.
    fs.rmSync(path.dirname(o.source), { recursive: true, force: true });
  } catch {
    // See above.
  }
  note('done');
  return { ok: true };
}

module.exports = { applyUpdate, ITEMS };

// Run as the swap step: node swap.cjs <file with the arguments as JSON>
if (require.main === module) {
  const args = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  applyUpdate(args).then(
    () => process.exit(0),
    () => process.exit(1),
  );
}
