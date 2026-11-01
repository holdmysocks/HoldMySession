// The desktop app's own updater. It downloads the release zip for this system, checks it against the
// release's SHA256SUMS.txt, unpacks it next to the app's data, and swaps the program for it after the app
// has quit (a running program cannot overwrite itself on Windows). The swap is done by a small script that
// waits for the app to exit, copies the new files over, and starts the app again if asked.
//
// Nothing here touches ~/.claude. Files live in the HoldMySession data folder, under updates/.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const ALLOWED_HOSTS = ['github.com'];

/** The checksum listed for a file in a SHA256SUMS.txt ("<hex>  <name>" per line), or null. */
function parseSums(text, name) {
  for (const line of String(text).split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (match && match[2] === name) return match[1].toLowerCase();
  }
  return null;
}

/** The script that replaces the program once the app has quit. Windows: PowerShell. Mac: sh. */
function helperScript(platform) {
  if (platform === 'win32') {
    return `param([int]$ParentPid,[string]$Source,[string]$Target,[string]$Exe,[int]$Relaunch,[string]$Log)
# A step-by-step note beside the error file, so a swap that goes wrong can be read afterwards.
$Trace = Join-Path (Split-Path $Log -Parent) 'apply-update.log'
function Note($text) { try { Add-Content -Path $Trace -Value ((Get-Date -Format 's') + ' ' + $text) } catch { } }
Set-Content -Path $Trace -Value ((Get-Date -Format 's') + ' started, waiting for process ' + $ParentPid)
try {
  for ($i = 0; $i -lt 120; $i++) { if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 500 }
  # The app's own files are swapped as a whole, so files an older version had do not pile up. A version keeps them
  # as the folder resources\\app (older ones) or the single file resources\\app.asar. The old copy is kept until the new one is in place.
  Note 'the program has quit, swapping the files'
  $items = @(@('resources\\app', 'app.old'), @('resources\\app.asar', 'app.asar.old'))
  foreach ($item in $items) { Remove-Item -Recurse -Force (Join-Path $Target ('resources\\' + $item[1])) -ErrorAction SilentlyContinue }
  foreach ($item in $items) {
    $path = Join-Path $Target $item[0]
    $moved = $false
    for ($i = 0; $i -lt 40 -and -not $moved; $i++) {
      try { if (Test-Path $path) { Rename-Item -Path $path -NewName $item[1] -ErrorAction Stop }; $moved = $true } catch { $last = $_.Exception.Message; Start-Sleep -Milliseconds 500 }
    }
    if (-not $moved) { throw "Could not replace the program files: $last" }
  }
  Note 'old files moved aside, copying the new ones'
  $done = $false
  for ($i = 0; $i -lt 40 -and -not $done; $i++) {
    try { Copy-Item -Path (Join-Path $Source '*') -Destination $Target -Recurse -Force -ErrorAction Stop; $done = $true } catch { $last = $_.Exception.Message; Start-Sleep -Milliseconds 500 }
  }
  if (-not $done) {
    foreach ($item in $items) {
      $path = Join-Path $Target $item[0]
      $aside = Join-Path $Target ('resources\\' + $item[1])
      if (Test-Path $aside) { Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue; Rename-Item -Path $aside -NewName (Split-Path $path -Leaf) -ErrorAction SilentlyContinue }
    }
    throw "Could not replace the program files: $last"
  }
  Note 'new files in place'
  # The new version starts first. Clearing the old copy can take a while when it is thousands of files.
  if ($Relaunch -eq 1) { Start-Process -FilePath $Exe; $Relaunch = 0 }
  foreach ($item in $items) {
    $aside = Join-Path $Target ('resources\\' + $item[1])
    if (Test-Path $aside) { if ((Get-Item $aside).PSIsContainer) { cmd.exe /c rd /s /q ('"' + $aside + '"') } else { Remove-Item -Force $aside -ErrorAction SilentlyContinue } }
  }
  Remove-Item -Recurse -Force (Split-Path $Source -Parent) -ErrorAction SilentlyContinue
  Note 'done'
} catch { Note ('failed: ' + $_.Exception.Message); Set-Content -Path $Log -Value $_.Exception.Message }
if ($Relaunch -eq 1) { Note 'starting the program again'; Start-Process -FilePath $Exe }
`;
  }
  return `#!/bin/sh
PARENT="$1"; SRC="$2"; TARGET="$3"; RELAUNCH="$4"; LOG="$5"
i=0
while kill -0 "$PARENT" 2>/dev/null && [ "$i" -lt 120 ]; do sleep 0.5; i=$((i+1)); done
OLD="$TARGET.old"
rm -rf "$OLD"
if mv "$TARGET" "$OLD" && ditto "$SRC/HoldMySession.app" "$TARGET"; then
  rm -rf "$OLD" "$(dirname "$SRC")"
else
  echo "Could not replace the app." > "$LOG"
  rm -rf "$TARGET"; mv "$OLD" "$TARGET"
fi
if [ "$RELAUNCH" = "1" ]; then open "$TARGET"; fi
`;
}

/**
 * @param {object} o
 * @param {string} o.dataDir     HoldMySession's data folder
 * @param {string} o.exePath     the running program
 * @param {number} o.pid         this process
 * @param {string} o.platform
 * @param {boolean} o.packaged   only an installed app replaces itself, never a checkout
 * @param {() => void} o.quit    quits the app
 * @param {(zip: string, dest: string) => Promise<void>} [o.extract]  replaces the system unpacker (tests)
 * @param {typeof fetch} [o.fetchImpl]
 */
function createUpdater(o) {
  const platform = o.platform;
  const fetchImpl = o.fetchImpl || fetch;
  const updatesDir = path.join(o.dataDir, 'updates');
  const errorFile = path.join(updatesDir, 'last-error.txt');
  let state = { phase: 'idle', version: null, percent: null, error: null };
  let staged = null; // { version, dir }
  let installOnQuit = false;

  // An update that was unpacked but never installed, or whose folder could not be cleared while the swap step ran from it.
  // Nothing is downloading at start-up, so anything left is stale.
  try {
    for (const entry of fs.readdirSync(updatesDir, { withFileTypes: true })) {
      if (entry.isDirectory()) fs.rmSync(path.join(updatesDir, entry.name), { recursive: true, force: true });
    }
  } catch {
    // No updates folder yet: the normal case.
  }

  // A swap that failed last time left a note, since the app was not running to say so.
  try {
    state = { phase: 'error', version: null, percent: null, error: fs.readFileSync(errorFile, 'utf8').trim() };
    fs.rmSync(errorFile, { force: true });
  } catch {
    // No note: the normal case.
  }

  /** The folder to replace: the program's folder on Windows, the .app bundle on a Mac. */
  function targetPath() {
    return platform === 'darwin' ? path.resolve(o.exePath, '..', '..', '..') : path.dirname(o.exePath);
  }

  function supported() {
    if (platform !== 'win32' && platform !== 'darwin') return { ok: false, reason: 'Updating itself is available on Windows and Mac.' };
    if (!o.packaged) return { ok: false, reason: 'Updating itself is only available in the installed app, not a source checkout.' };
    const target = targetPath();
    try {
      const probe = path.join(platform === 'darwin' ? path.dirname(target) : target, `.holdmysession-write-test-${process.pid}`);
      fs.writeFileSync(probe, '');
      fs.rmSync(probe, { force: true });
    } catch {
      return { ok: false, reason: `HoldMySession may not change its own folder (${target}). Move it somewhere you own, such as your Documents folder, or update by downloading the new zip.` };
    }
    return { ok: true };
  }

  function unpack(zip, dest) {
    if (o.extract) return o.extract(zip, dest);
    const [cmd, argv] =
      platform === 'win32'
        ? [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', dest]]
        : ['ditto', ['-x', '-k', zip, dest]];
    return new Promise((resolve, reject) => execFile(cmd, argv, { windowsHide: true }, (error) => (error ? reject(error) : resolve())));
  }

  async function fetchOk(url) {
    const host = new URL(url).hostname;
    if (new URL(url).protocol !== 'https:' || !ALLOWED_HOSTS.includes(host)) throw new Error('The update is not on GitHub.');
    const response = await fetchImpl(url, { headers: { 'User-Agent': 'HoldMySession' }, redirect: 'follow' });
    if (!response.ok) throw new Error(`GitHub answered ${response.status} for the download.`);
    return response;
  }

  async function run(release, installWhenReady) {
    const dir = path.join(updatesDir, release.version);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const zip = path.join(dir, release.name);
    try {
      const sums = await (await fetchOk(release.sumsUrl)).text();
      const expected = parseSums(sums, release.name);
      if (!expected) throw new Error(`${release.name} is not in the release's checksums.`);

      const response = await fetchOk(release.url);
      const total = Number(response.headers.get('content-length')) || 0;
      const hash = crypto.createHash('sha256');
      let received = 0;
      const source = Readable.fromWeb(response.body);
      source.on('data', (chunk) => {
        hash.update(chunk);
        received += chunk.length;
        if (total) state = { ...state, percent: Math.min(100, Math.floor((received / total) * 100)) };
      });
      await pipeline(source, fs.createWriteStream(zip));
      if (hash.digest('hex') !== expected) throw new Error('The download does not match its checksum, so it was not installed.');

      const app = path.join(dir, 'app');
      fs.mkdirSync(app);
      await unpack(zip, app);
      const marker = platform === 'darwin' ? 'HoldMySession.app' : 'HoldMySession.exe';
      if (!fs.existsSync(path.join(app, marker))) throw new Error(`The download does not contain ${marker}.`);
      fs.rmSync(zip, { force: true });

      staged = { version: release.version, dir: app };
      state = { phase: 'ready', version: release.version, percent: null, error: null };
      if (installWhenReady) install(true);
    } catch (error) {
      fs.rmSync(dir, { recursive: true, force: true });
      staged = null;
      state = { phase: 'error', version: release.version, percent: null, error: (error && error.message) || String(error) };
    }
  }

  function download(release, installWhenReady) {
    if (state.phase === 'downloading' || state.phase === 'installing') return;
    const check = supported();
    if (!check.ok) {
      state = { phase: 'error', version: release.version, percent: null, error: check.reason };
      return;
    }
    state = { phase: 'downloading', version: release.version, percent: 0, error: null };
    void run(release, installWhenReady);
  }

  /** The Windows PowerShell program, by its full path. A bare name is looked up on PATH, and a program started by a Claude Code hook can have a PATH without it. */
  function powershellPath() {
    return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  }

  /** Writes what went wrong where the next start shows it, since the app may not be here to say so. */
  function failed(message) {
    state = { phase: 'error', version: staged ? staged.version : null, percent: null, error: message };
    try {
      fs.mkdirSync(updatesDir, { recursive: true });
      fs.writeFileSync(errorFile, message);
    } catch {
      // Nothing more can be done.
    }
  }

  /** Starts a program and says whether Windows (or the system) accepted it. It is let go of at once, so it outlives this app. */
  function launch(cmd, argv, options) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(cmd, argv, { detached: true, stdio: 'ignore', ...options });
      } catch (error) {
        reject(error);
        return;
      }
      child.once('error', reject);
      child.once('spawn', resolve);
      child.unref();
    });
  }

  /**
   * Starts the swap step, and resolves once it is running. On Windows the first choice is the new version's own
   * program in Node mode, which needs no PowerShell; PowerShell, by its full path, is the second choice.
   */
  async function spawnSwap(restart) {
    fs.mkdirSync(updatesDir, { recursive: true });
    const target = targetPath();
    if (platform === 'win32') {
      const trace = path.join(updatesDir, 'apply-update.log');
      try {
        const script = path.join(updatesDir, 'apply-update.cjs');
        const argsFile = path.join(updatesDir, 'apply-update.json');
        fs.copyFileSync(path.join(__dirname, 'swap.cjs'), script);
        fs.writeFileSync(
          argsFile,
          JSON.stringify({ parentPid: o.pid, source: staged.dir, target, exe: o.exePath, relaunch: restart, errorFile, traceFile: trace }),
        );
        await launch(path.join(staged.dir, 'HoldMySession.exe'), [script, argsFile], {
          windowsHide: true,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        });
        return;
      } catch (error) {
        try {
          fs.appendFileSync(trace, `${new Date().toISOString()} the swap step could not be started with the new program (${(error && error.message) || error}), trying PowerShell\n`);
        } catch {
          // The log is a courtesy.
        }
      }
      const script = path.join(updatesDir, 'apply-update.ps1');
      fs.writeFileSync(script, helperScript(platform));
      await launch(
        powershellPath(),
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script,
          '-ParentPid', String(o.pid), '-Source', staged.dir, '-Target', target, '-Exe', o.exePath, '-Relaunch', restart ? '1' : '0', '-Log', errorFile],
        { windowsHide: true },
      );
      return;
    }
    const script = path.join(updatesDir, 'apply-update.sh');
    fs.writeFileSync(script, helperScript(platform), { mode: 0o755 });
    await launch('/bin/sh', [script, String(o.pid), staged.dir, target, restart ? '1' : '0', errorFile]);
  }

  function install(restart) {
    if (!staged || state.phase === 'installing') return;
    state = { ...state, phase: 'installing' };
    // The app only quits once the update step is running. If it cannot start, the app stays open and says why.
    spawnSwap(restart).then(
      () => o.quit(),
      (error) => failed(`The update step could not be started: ${(error && error.message) || error}`),
    );
  }

  return {
    supported,
    status: () => state,
    download,
    install,
    installOnQuit: (enabled) => {
      installOnQuit = Boolean(enabled);
    },
    /** Called as the app quits: installs a downloaded update if the user asked for that. */
    applyOnQuit: () => {
      if (installOnQuit && staged && state.phase === 'ready') {
        state = { ...state, phase: 'installing' };
        // The app is already quitting. If the step cannot be started, the note is there for the next start.
        spawnSwap(false).catch((error) => failed(`The update step could not be started: ${(error && error.message) || error}`));
      }
    },
  };
}

module.exports = { createUpdater, parseSums, helperScript };
