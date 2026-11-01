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
try {
  for ($i = 0; $i -lt 120; $i++) { if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 500 }
  # The app's own files are swapped as a whole, so files an older version had do not pile up. A version keeps them
  # as the folder resources\\app (older ones) or the single file resources\\app.asar. The old copy is kept until the new one is in place.
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
  # The new version starts first. Clearing the old copy can take a while when it is thousands of files.
  if ($Relaunch -eq 1) { Start-Process -FilePath $Exe; $Relaunch = 0 }
  foreach ($item in $items) {
    $aside = Join-Path $Target ('resources\\' + $item[1])
    if (Test-Path $aside) { if ((Get-Item $aside).PSIsContainer) { cmd.exe /c rd /s /q ('"' + $aside + '"') } else { Remove-Item -Force $aside -ErrorAction SilentlyContinue } }
  }
  Remove-Item -Recurse -Force (Split-Path $Source -Parent) -ErrorAction SilentlyContinue
} catch { Set-Content -Path $Log -Value $_.Exception.Message }
if ($Relaunch -eq 1) { Start-Process -FilePath $Exe }
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

  /** Starts the swap script and, unless the app is already quitting, quits. */
  function spawnSwap(restart) {
    fs.mkdirSync(updatesDir, { recursive: true });
    const script = path.join(updatesDir, platform === 'win32' ? 'apply-update.ps1' : 'apply-update.sh');
    fs.writeFileSync(script, helperScript(platform), { mode: 0o755 });
    const target = targetPath();
    const common = [String(o.pid), staged.dir, target];
    const child =
      platform === 'win32'
        ? spawn(
            'powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script,
              '-ParentPid', common[0], '-Source', common[1], '-Target', common[2], '-Exe', o.exePath, '-Relaunch', restart ? '1' : '0', '-Log', errorFile],
            { detached: true, stdio: 'ignore', windowsHide: true },
          )
        : spawn('/bin/sh', [script, ...common, restart ? '1' : '0', errorFile], { detached: true, stdio: 'ignore' });
    child.unref();
  }

  function install(restart) {
    if (!staged || state.phase === 'installing') return;
    state = { ...state, phase: 'installing' };
    spawnSwap(restart);
    o.quit();
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
        spawnSwap(false);
      }
    },
  };
}

module.exports = { createUpdater, parseSums, helperScript };
