# The desktop app

HoldMySession can run as a desktop app for Windows and Mac. It is the same server and the same pages as the command line, wrapped in Electron: a window, and an icon in the tray (Windows) or menu bar (Mac) so it keeps running with the window closed. The server is still on port 3000, so a browser on this machine works, and other machines can reach it when **Listen on the network** is on.

## Using it

1. Download the zip for your system from the [releases page](https://github.com/holdmysocks/HoldMySession/releases), unzip it anywhere, and run `HoldMySession.exe` (Windows) or `HoldMySession` (Mac).
2. Closing the window hides it. Use the tray icon to open it again, open it in a browser, turn on Start with Windows (Open at login on a Mac), restart it, or quit.
3. Running it again while it is already running opens the existing window.
4. `--background` starts it in the tray without opening the window.

The programs are not signed, so Windows SmartScreen or macOS Gatekeeper will warn on first run. On Windows choose More info, then Run anyway. On a Mac, Control-click the app, choose Open, then Open again.

The app's data is in `~/.holdmysession`, the same folder the command line uses, so switching between them keeps everything. To uninstall, delete the folder you unzipped.

## Claude Code hooks

Settings, under **Claude Code hooks**, has two switches that add or remove entries in Claude Code's `settings.json` (`src/lib/claude-hooks/`):

- **Needs you notifications** adds a Notification and Stop hook, which feed the map's Needs you panel and recent events.
- **Start HoldMySession with Claude Code** adds a SessionStart hook that starts the app in the background if it is not running.

Only these entries are added or removed. The rest of the file is kept, a copy is saved first in `~/.holdmysession/claude-settings-backups`, a file that is not valid JSON is left alone, and a hook that points to an old location is shown as out of date. It is the only thing HoldMySession writes under `~/.claude`.

The hooks are commands run by Claude Code. For the installed app they are the app's own program with a flag (`--holdmysession-notify`, `--holdmysession-start`), so no Node is needed. From a source checkout they are `node bin/holdmysession-hook.mjs` and `node bin/ensure-running.mjs`. Both are written with forward slashes so any shell reads the path. Claude Code reads hooks when a session starts, so sessions already open need restarting.

## Building it

The build is done on your own machine, not in CI. In `apps/desktop`:

```bash
npm install
node scripts/package.mjs win32 x64 --build      # Windows zip
node scripts/package.mjs darwin arm64 x64       # Mac zips, Apple Silicon and Intel
```

`--build` runs `npm run build` in `apps/web` first. The script stages the built web app with its production dependencies, packages it with Electron for each platform and architecture, puts the icon on the Windows program (done with `resedit`, so no Windows tooling is needed), and writes `release/HoldMySession-<version>-<win|mac>-<arch>.zip` and `release/SHA256SUMS.txt`. Mac builds can be made from Windows or Linux, but they are not signed or notarised.

The version is the one in `apps/web/package.json`. The sidebar shows it, links it to the releases page, and says when a newer release is published (Settings, About and updates, can turn that check off).

## The icon

`npm run icons` draws it (HM in white and S in the Claude orange on the dark app colour) and writes `icons/icon.png`, `icon.ico`, `icon.icns` and the tray icons. It needs Playwright to draw with a real browser. The results are committed, so building does not need to run it.

## Releasing

1. Change the version in `apps/web/package.json` (and the top of its lock file) and in `apps/desktop/package.json`, and commit.
2. Build the zips as above.
3. Tag `v<version>`, push the tag, and create a release for it on GitHub with the zips and `SHA256SUMS.txt` attached.
