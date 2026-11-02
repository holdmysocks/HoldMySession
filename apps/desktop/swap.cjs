// The swap step of an update: wait for the app to quit, put the new program files in place of the old ones,
// start the app again, and clear the old copy. It is plain Node, so it needs no PowerShell: the app runs it with the
// NEW version's program in Node mode (ELECTRON_RUN_AS_NODE), from the folder the update was unpacked in.
//
// The old files are moved aside first and put back if anything fails, so a failed swap leaves the old version working.

// In Electron, even looking at a file called app.asar opens it as an archive and keeps it open, which on Windows stops
// that very file from being renamed (EBUSY). So files are handled with original-fs, which treats an archive as a plain file.
const fs = (() => {
  try {
    return require('original-fs');
  } catch {
    return require('node:fs');
  }
})();
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

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

async function retry(fn, tries, delayMs, onError) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (onError) await onError(error, i);
      await sleep(delayMs);
    }
  }
  throw last;
}

/** An error that means "something has this file open". */
const isLocked = (error) => error && ['EBUSY', 'EPERM', 'EACCES'].includes(error.code);

/**
 * The programs running from a folder, as [{pid, name}]. On Windows that is asked of the system (PowerShell by its
 * full path, then wmic); elsewhere nothing is looked for. Anything that fails gives an empty list: this only helps.
 */
function findProcessesIn(folder) {
  if (process.platform !== 'win32') return [];
  const env = { ...process.env, HMS_FOLDER: folder };
  const parse = (text) =>
    text
      .split(/\r?\n/)
      .map((line) => line.trim().split('|'))
      .filter((p) => /^\d+$/.test(p[0]))
      .map((p) => ({ pid: Number(p[0]), name: p[1] || '' }));
  try {
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script =
      "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($env:HMS_FOLDER + '\\', [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { '' + $_.ProcessId + '|' + $_.Name }";
    return parse(execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], { env, encoding: 'utf8', timeout: 20000, windowsHide: true }));
  } catch {
    // PowerShell could not be used. Try wmic.
  }
  try {
    const out = execFileSync('wmic', ['process', 'get', 'ProcessId,ExecutablePath', '/format:csv'], { encoding: 'utf8', timeout: 20000, windowsHide: true });
    const prefix = (folder.endsWith('\\') ? folder : folder + '\\').toLowerCase();
    return out
      .split(/\r?\n/)
      .map((line) => line.split(','))
      .filter((c) => c.length >= 3 && c[1].toLowerCase().startsWith(prefix) && /^\d+$/.test(c[2].trim()))
      .map((c) => ({ pid: Number(c[2].trim()), name: path.basename(c[1]) }));
  } catch {
    return [];
  }
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
 * @param {(folder: string) => Array<{pid: number, name: string}>} [o.findProcesses] replaces looking for programs running from the folder (tests)
 * @param {(pid: number) => void} [o.killProcess] replaces ending one (tests)
 * @param {(from: string, to: string) => void} [o.rename] replaces renaming (tests)
 */
async function applyUpdate(o) {
  // The same, for anything that still goes through the regular fs.
  process.noAsar = true;
  const delayMs = o.delayMs ?? 500;
  const tries = 40;
  const start = o.start || startDetached;
  const findProcesses = o.findProcesses || findProcessesIn;
  const killProcess = o.killProcess || ((pid) => process.kill(pid, 'SIGKILL'));
  const rename = o.rename || fs.renameSync;
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

  // Something else may still have the program's files open: a copy a Claude Code hook started in the meantime, or a
  // helper that has not exited. Anything running from the program's folder is in the way of replacing it, so it is
  // ended, at most every couple of seconds, once a file turns out to be locked.
  let lastCleared = 0;
  const clearLockers = async (error) => {
    if (!isLocked(error) || Date.now() - lastCleared < 2000) return;
    lastCleared = Date.now();
    const others = findProcesses(o.target).filter((p) => p.pid !== process.pid);
    note(`a file is locked (${error.code}). Running from the program's folder: ${others.length ? others.map((p) => `${p.name} ${p.pid}`).join(', ') : 'nothing found'}`);
    for (const p of others) {
      try {
        killProcess(p.pid);
        note(`ended ${p.name} ${p.pid}`);
      } catch (killError) {
        note(`could not end ${p.name} ${p.pid}: ${killError && killError.message}`);
      }
    }
    await sleep(Math.min(400, delayMs * 4));
  };

  let moved = [];
  try {
    note('the program has quit, moving the old files aside');
    clearAside();
    for (const item of ITEMS) {
      await retry(() => (fs.existsSync(place(item)) ? rename(place(item), aside(item)) : undefined), tries, delayMs, clearLockers);
      if (fs.existsSync(aside(item))) moved.push(item);
    }
    note('copying the new files in');
    for (const name of fs.readdirSync(o.source)) {
      await retry(() => fs.cpSync(path.join(o.source, name), path.join(o.target, name), { recursive: true, force: true }), tries, delayMs, clearLockers);
    }
    note('new files in place');
  } catch (error) {
    note(`failed: ${error && error.message}`);
    for (const item of moved) {
      try {
        fs.rmSync(place(item), { recursive: true, force: true });
        rename(aside(item), place(item));
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
  // The new version brings its own copy of this step, which is the one to run: a fix in it reaches the very update that
  // installs it. This copy, from the version being replaced, is the fallback.
  let run = applyUpdate;
  try {
    const next = require(path.join(args.source, 'resources', 'app.asar', 'swap.cjs'));
    if (typeof next.applyUpdate === 'function') run = next.applyUpdate;
  } catch {
    // The new version has none, or it cannot be read here.
  }
  run(args).then(
    () => process.exit(0),
    () => process.exit(1),
  );
}
