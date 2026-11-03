// The HoldMySession desktop app. It runs the same server as the command line, shows it in a window, and
// lives in the tray (Windows) or menu bar (Mac) so it can keep running with the window closed. The server
// is still on port 3000, so a browser, and other machines when "Listen on the network" is on, can use it too.
//
// The same program also answers Claude Code's hooks, so the hook commands need nothing but this file:
//   --holdmysession-notify   record a Notification or Stop event (reads the hook's JSON on stdin), then exit
//   --holdmysession-start    start the app in the background if it is not running, then exit
//   --holdmysession-statusline  Claude Code's status line: record the subscription limits it reports, print a status line
//   --background             start in the tray without opening the window

const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog, Notification } = require('electron');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { createUpdater } = require('./updater.cjs');
const { shouldShowWindowFor, portInUse } = require('./launch.cjs');
const { planAlerts, notificationFor, trayState, mapPathFor, planLimitAlerts, limitsText } = require('./alerts.cjs');
const { shouldPoll, newestTranscriptMtime } = require('./idle.cjs');
const fs = require('node:fs');

const args = process.argv.slice(1);
const flag = (name) => args.includes(name);
const NOTIFY = flag('--holdmysession-notify');
const START = flag('--holdmysession-start');
const STATUSLINE = flag('--holdmysession-statusline');
const BACKGROUND = flag('--background');

// The dashboard is a few pages of text and an SVG map, so it does not need the graphics card, and without it the
// graphics process, which is the biggest part of the app's memory after the window, stays small. HOLDMYSESSION_GPU=1 turns it back on.
if (!process.env.HOLDMYSESSION_GPU) app.disableHardwareAcceleration();

// Started only to answer a hook: no Dock icon for it on a Mac, which would flash for a moment each time.
if (process.platform === 'darwin' && (NOTIFY || START || STATUSLINE)) app.dock?.hide();

// The server, hook script and built pages. Packaged, they sit next to this file. From a checkout, in apps/web.
const WEB_DIR = app.isPackaged || require('node:fs').existsSync(path.join(__dirname, 'web'))
  ? path.join(__dirname, 'web')
  : path.join(__dirname, '..', 'web');
const ICONS = path.join(__dirname, 'icons');
const PORT = Number(process.env.HOLDMYSESSION_PORT) || 3000;
// The start-up entry is saved with these arguments, and has to be read back with the same ones: on Windows the
// check is by program and arguments together, so reading it without them always says it is off.
const LOGIN_ARGS = ['--background'];
const loginEnabled = () => app.getLoginItemSettings({ path: process.execPath, args: LOGIN_ARGS }).openAtLogin;
const setLogin = (enabled) => app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: LOGIN_ARGS });

app.setAppUserModelId('com.holdmysocks.holdmysession');

// --- Hook modes: no window, no server, quick ---

async function runNotifyHook() {
  try {
    await import(pathToFileURL(path.join(WEB_DIR, 'bin', 'holdmysession-hook.mjs')).href);
  } catch {
    // A broken hook must not affect the Claude Code session.
  }
  app.exit(0);
}

async function runStartHook() {
  try {
    // Both loopback addresses are tried, and a busy server gets a moment to answer, so a running app is never
    // mistaken for a stopped one. That would start a second copy, which would show the first one's window.
    if (!(await portInUse(PORT, 1500))) {
      // The installed program starts as the app. Run from a checkout, it has to be told which app to run.
      const launch = app.isPackaged ? ['--background'] : [app.getAppPath(), '--background', ...(flag('--no-sandbox') ? ['--no-sandbox'] : [])];
      const child = spawn(process.execPath, launch, { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
    }
  } catch {
    // Never block the Claude Code session.
  }
  app.exit(0);
}

// The status line has to print to the output Claude Code reads, which this program may not have as its own on
// Windows. So the script runs as a plain Node program that inherits the input and output as they were given.
function runStatusline() {
  try {
    spawnSync(process.execPath, [path.join(WEB_DIR, 'bin', 'holdmysession-statusline.mjs')], {
      stdio: 'inherit',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
      timeout: 8000,
    });
  } catch {
    // A broken status line must not affect the Claude Code session.
  }
  app.exit(0);
}

if (STATUSLINE) {
  runStatusline();
} else if (NOTIFY || START) {
  app.whenReady().then(NOTIFY ? runNotifyHook : runStartHook);
} else {
  runApp();
}

// --- The app ---

function runApp() {
  if (!app.requestSingleInstanceLock()) {
    // Another copy is running: it opens its window (unless this start was a background one), and this one leaves.
    app.quit();
    return;
  }

  let win = null;
  let tray = null;
  let trayImages = null;
  let server = null;
  let quitting = false;
  let rebuildTray = () => undefined;
  let baseUrl = `http://localhost:${PORT}`;
  const updater = createUpdater({
    dataDir: process.env.HOLDMYSESSION_DIR || path.join(os.homedir(), '.holdmysession'),
    exePath: process.execPath,
    pid: process.pid,
    platform: process.platform,
    packaged: app.isPackaged,
    quit: () => quit(),
  });

  // On a Mac the app lives in the menu bar while its window is closed, so the Dock icon shows only with the window.
  const dockHide = () => process.platform === 'darwin' && app.dock?.hide();
  const dockShow = () => (process.platform === 'darwin' ? app.dock?.show() : undefined);

  function showWindow() {
    dockShow();
    if (!win) createWindow();
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    if (process.platform === 'darwin') app.focus({ steal: true });
  }

  function createWindow() {
    win = new BrowserWindow({
      width: 1360,
      height: 900,
      minWidth: 900,
      minHeight: 600,
      title: 'HoldMySession',
      icon: path.join(ICONS, 'icon.png'),
      backgroundColor: '#141413',
      autoHideMenuBar: true,
      show: false,
    });
    win.once('ready-to-show', () => win.show());
    win.loadURL(baseUrl);
    // Links to other sites open in the browser, not in this window.
    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith(baseUrl)) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });
    // Closing the window closes it, and its page and the process that runs it go with it. A window that is only hidden keeps
    // all of that in memory. The app keeps running in the tray until Quit, and the tray opens a new window.
    win.on('closed', () => {
      win = null;
      dockHide();
    });
  }

  function createTray() {
    const load = (name) => {
      const image = nativeImage.createFromPath(path.join(ICONS, process.platform === 'win32' ? `${name}.png` : `${name}@2x.png`));
      return process.platform === 'darwin' ? image.resize({ width: 18, height: 18 }) : image;
    };
    trayImages = { plain: load('tray'), alert: load('tray-alert') };
    tray = new Tray(trayImages.plain);
    tray.setToolTip(`HoldMySession ${app.getVersion()}`);
    const rebuild = () =>
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Open HoldMySession', click: showWindow },
          { label: 'Open in browser', click: () => shell.openExternal(baseUrl) },
          { type: 'separator' },
          {
            label: process.platform === 'darwin' ? 'Open at login' : 'Start with Windows',
            type: 'checkbox',
            checked: loginEnabled(),
            click: (item) => {
              setLogin(item.checked);
              rebuild();
            },
          },
          ...(updater.status().phase === 'ready'
            ? [{ label: `Update to v${updater.status().version} and restart`, click: () => updater.install(true) }]
            : []),
          { label: 'Restart', click: () => { app.relaunch(); quit(); } },
          { type: 'separator' },
          { label: 'Quit HoldMySession', click: quit },
        ]),
      );
    rebuild();
    // The menu offers an update once one is downloaded, so it is rebuilt now and then.
    setInterval(rebuild, 30_000).unref();
    tray.on('click', showWindow);
    rebuildTray = rebuild;
  }

  // --- Activity: poll only while Claude Code is in use ---

  const HOME = os.homedir();
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || process.env.CLAUDE_HOME || path.join(HOME, '.claude');
  const dataDir = process.env.HOLDMYSESSION_DIR || process.env.CLAUDE_DASHBOARD_DIR || process.env.CLAUDE_DASHBOARD_HOME || path.join(HOME, '.holdmysession');
  // Starts from the newest transcript on disk, so an app launched with Claude Code not in use has nothing to poll.
  let lastActivity = 0;
  let watching = false;
  const touchActivity = () => {
    lastActivity = Date.now();
  };

  // A recursive watch costs next to nothing while nothing is written, and fires when Claude Code writes a transcript. The
  // hook events and the status line's limits count as well. Without a watch, everything polls as it always did.
  function startWatching() {
    if (watching) return;
    try {
      lastActivity = Math.max(lastActivity, newestTranscriptMtime(path.join(claudeDir, 'projects')));
      const watcher = fs.watch(path.join(claudeDir, 'projects'), { recursive: true, persistent: false }, touchActivity);
      watcher.on('error', () => {
        watching = false;
      });
      watching = true;
    } catch {
      watching = false;
    }
    try {
      fs.watch(dataDir, { persistent: false }, (_event, name) => {
        if (name === 'events.jsonl' || name === 'usage.json') touchActivity();
      }).on('error', () => undefined);
    } catch {
      // No data folder yet: the hooks make it when they first run.
    }
  }

  // --- Alerts: tell the user when a session starts waiting on them ---

  let alerted = new Set();

  // What the tray shows is the sessions waiting and the limits Claude Code last reported. Each is updated by its own poll.
  let waitingCount = 0;
  let lastLimits = null;
  let limitState = {};

  function showTrayState(count = waitingCount) {
    waitingCount = count;
    if (!tray || !trayImages) return;
    const state = trayState(count, app.getVersion(), limitsText(lastLimits));
    tray.setImage(state.alert ? trayImages.alert : trayImages.plain);
    tray.setToolTip(state.tooltip);
    // A Mac shows the count beside the menu bar icon.
    if (process.platform === 'darwin') tray.setTitle(state.macTitle);
  }

  function openMapFor(wait) {
    showWindow();
    win.loadURL(`${baseUrl}${mapPathFor(wait)}`);
  }

  function toast(title, body, onClick) {
    if (Notification.isSupported()) {
      const note = new Notification({ title, body });
      note.on('click', onClick);
      note.show();
    } else if (tray && process.platform === 'win32') {
      tray.displayBalloon({ title, content: body, iconType: 'info' });
    }
  }

  function announce(batch) {
    const { title, body } = notificationFor(batch);
    toast(title, body, () => openMapFor(batch[0]));
  }

  // The limits: a notification as a window passes 75% and 90%, and when one that was run up resets.
  const busy = () => shouldPoll({ nowMs: Date.now(), lastActivityMs: lastActivity, windowOpen: Boolean(win), watching });

  async function pollLimits() {
    if (!busy()) return;
    try {
      const response = await fetch(`http://localhost:${PORT}/api/limits`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const limits = await response.json();
      lastLimits = limits;
      const focused = Boolean(win && win.isVisible() && win.isFocused() && !win.isMinimized());
      const plan = planLimitAlerts({ limits, state: limitState, windowFocused: focused, nowMs: Date.now() });
      limitState = plan.state;
      showTrayState();
      for (const note of plan.notify) toast(note.title, note.body, showWindow);
    } catch {
      // The server is busy or starting: ask again next time.
    }
  }

  async function pollNeedsYou() {
    if (!busy()) return;
    try {
      const response = await fetch(`http://localhost:${PORT}/api/needs-you`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return;
      const { enabled, waiting } = await response.json();
      const focused = Boolean(win && win.isVisible() && win.isFocused() && !win.isMinimized());
      const plan = planAlerts({ waiting, alerted, enabled, windowFocused: focused });
      alerted = plan.alerted;
      showTrayState(enabled ? waiting.length : 0);
      if (plan.notify.length > 0) announce(plan.notify);
    } catch {
      // The server is busy or starting: ask again next time.
    }
  }

  function quit() {
    quitting = true;
    try {
      server?.close();
    } catch {
      // Already closed.
    }
    app.quit();
  }

  async function startServer() {
    // Hooks written from Settings use this program, so they work without Node on the machine.
    if (app.isPackaged) process.env.HOLDMYSESSION_EXE = process.execPath;
    const { createAppServer, listenHost } = await import(pathToFileURL(path.join(WEB_DIR, 'bin', 'server.mjs')).href);
    const host = listenHost();
    server = await createAppServer({ distDir: path.join(WEB_DIR, 'dist'), host, port: PORT });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(PORT, host, resolve);
    });
    // The Settings page asks the app for these through this object, since the server runs inside this process.
    globalThis.__holdmysessionDesktop = {
      getOpenAtLogin: () => loginEnabled(),
      setOpenAtLogin: (enabled) => {
        setLogin(Boolean(enabled));
        rebuildTray();
        return loginEnabled();
      },
      restart: () => {
        app.relaunch();
        quit();
      },
      updates: updater,
    };
    // Load the app once, so the server starts its background work now, not when the first page is opened.
    fetch(`http://localhost:${PORT}/`, { redirect: 'manual' }).catch(() => undefined);
  }

  // Another copy started by hand asks for the window. One started in the background (the Claude Code start hook)
  // must not show it, restore it from the taskbar or take focus.
  app.on('second-instance', (_event, argv) => {
    if (shouldShowWindowFor(argv)) showWindow();
  });
  // Closing every window must not quit: the app stays in the tray.
  app.on('window-all-closed', () => undefined);
  app.on('activate', () => showWindow());
  app.on('before-quit', () => {
    quitting = true;
    updater.applyOnQuit();
  });

  app.whenReady().then(async () => {
    createTray();
    try {
      await startServer();
    } catch (error) {
      if (error && error.code === 'EADDRINUSE') {
        // Something already serves this port, most likely another copy run from the command line. Use it.
        baseUrl = `http://localhost:${PORT}`;
      } else {
        dialog.showErrorBox('HoldMySession could not start', String((error && error.message) || error));
        quit();
        return;
      }
    }
    setInterval(pollNeedsYou, 5000).unref();
    setTimeout(pollNeedsYou, 2500).unref();
    setInterval(pollLimits, 30_000).unref();
    setTimeout(pollLimits, 4000).unref();
    startWatching();
    // A folder that was not there yet is watched once it is.
    setInterval(startWatching, 60_000).unref();
    if (BACKGROUND) dockHide();
    else showWindow();
  });
}
