# Session Map

The Session Map is a read-only view of one project's Claude Code sessions. Each session in the project is a node. A **fork** of a session is a child node of that session. A **subagent** the session (or fork) dispatched is a small child card. A side panel lists what is waiting on you and recent hook events. The map never writes to `~/.claude`.

Field-level detail for every file the map reads is in [docs/guide-claude-data-mapping.md](../guide-claude-data-mapping.md). It also says which parts are documented and which are internal to Claude Code.

## Running it

From the repository:

```bash
cd apps/web
npm run build && npm start
```

Open `http://localhost:3000/map`, or pick a project from the **Map** entry in the sidebar. The project selector shows each project's name and session count.

Options: `-p, --port <number>` (default 3000), `--host <hostname>` (default localhost), and `-o, --open`. Run `claude-dashboard --help` for the full list.

## Setup on Windows

The dashboard reads the Claude config directory on Windows, which is `%USERPROFILE%\.claude` (for example `C:\Users\<you>\.claude`). Nothing needs configuring for that.

1. **Run it.** Install from npm (`npm install -g claude-session-dashboard`, then `claude-dashboard`), or from a clone. From a clone, `Update-SessionMap.ps1` in the repo root pulls the session map branch, installs dependencies when the lock file changed, rebuilds and starts the dashboard. Run it from PowerShell in the repo folder: `powershell -ExecutionPolicy Bypass -File .\Update-SessionMap.ps1`. Use `-SkipTests` to skip the test run, `-ForceInstall` to reinstall dependencies, and `-Port` to change the port (default 3000).
2. **Custom config dir (optional).** Set `CLAUDE_CONFIG_DIR` to the folder that holds `projects\`. `CLAUDE_HOME` is accepted as an older alias.
3. **Notifications (optional).** Run `claude-dashboard --print-hook-config`. Merge the `hooks` block into `%USERPROFILE%\.claude\settings.json`. The printed command points at the hook script's absolute path, quoted if the path has spaces.
4. **WSL.** When the dashboard runs on Windows, WSL distributions with a `.claude` folder under `\\wsl$` are listed as extra data sources. They appear in the Sessions list. **They do not appear on the map** (see limitations).

**Not verified:** the hook command on Windows. We do not know whether Claude Code on Windows runs the hook through `cmd`, PowerShell or Git Bash. The hook script itself is tested on Linux only. Check that a Notification event lands in `%USERPROFILE%\.claude-dashboard\events.jsonl` after you trigger one.

## What the map shows

- **Session nodes.** The session name sits next to the status dot. The project is not shown on the card, because the map is already for one project. Short id and message count come next, then the branch, then the model. The text is 11 to 15 px.
- **Fork nodes.** A fork of a session in the same project hangs off that session, joined by a dashed edge. The node says "Forked session" in the details panel.
- **Subagent cards.** Small cards (180 by 44) under the session or fork that dispatched them. The label is the subagent type, then its description. Only running subagents are drawn (see the subagent rule under Status).
- **Expired subagents.** A subagent quiet for more than 5 minutes is not drawn and takes no space. Its session node shows a small **+N** chip with the count, and the page info line gives the project total.
- **Layout.** Each depth is a column: top-level sessions, then their forks and subagents, then forks of forks. A parent is centred on its children. Top-level sessions are in the desktop app's activity order, newest first, and the map follows the app's order as it changes. See [Moving around and editing the layout](#moving-around-and-editing-the-layout) for how the canvas is shown.
- **Every session in the project is shown, except sessions with no project and archived sessions.** There is no cap. See [Sessions with no project](#sessions-with-no-project) and [Archived and split sessions](#archived-and-split-sessions).

### Moving around and editing the layout

- **The map fills the page.** On the Map page the content is not held to a narrow column. The map panel takes the width the window gives it, minus the side panels, and about the height of the window. **Hide panels** gives the map the full width. Nothing scrolls sideways.
- **Pan and zoom.** Drag empty space to pan, in any direction. The wheel zooms around the pointer, and a pinch gesture on a trackpad does too. The corner buttons zoom in and out and show the zoom level. **Fit** shows the whole map. When the page opens, the map is fitted to the panel, but never smaller than 50%, so the text stays readable. The view follows the panel size until you first pan or zoom.
- **Edit layout.** The **Edit layout** button turns on the editor. Drag a card to move it anywhere. Dragging empty space still pans, and a focused card moves 10 units per arrow key. Edges follow the cards. Outside the editor, dragging a card pans the map, and a click still selects it.
- **Positions are saved in this browser**, per project, in local storage under `session-map-offsets:<project folder>`. Each card is saved as how far it was moved from its automatic place. A new session that shifts the automatic layout therefore moves the cards you placed with it. **Reset layout** clears the project's saved positions. If storage is blocked, the positions last until the page is closed. Nothing is written to `~/.claude`, so the map stays read-only.

### Sessions with no project

A session has a project when its transcript records a working directory (`cwd`) that is not blank. A session without one is hidden from:

- the map, including its subagents,
- the Sessions list: the page, the totals, the Active filter count and the sidebar badge,
- the project dropdown on the map, so a directory that holds only such sessions does not appear.

The map info line and the Sessions page each show the count, as **N hidden (no project)**. The rule is one pure function, `src/lib/map/session-visibility.ts`.

**Stats and project analytics do not use this rule.** They still count every session, including those with no project and archived ones. This is deliberate: the change is scoped to the map and the Sessions list.

### Archived and split sessions

The Claude desktop app keeps two flags per session in its own store, not in the transcript. The dashboard reads them from `src/lib/desktop/desktop-records.ts`. Read-only.

- **Archived.** `isArchived: true` hides the session from the map, the project dropdown, the Sessions list and the sidebar badge. The map info line and the Sessions page show **N archived hidden**. A session that is archived and also has no project is counted as archived.
- **Split to top level.** `lineageDetached: true` means the user split the session from its parent in the desktop app. The transcript and `spawnedFrom` still name the parent, so the map draws no parent link for it, and it is a top-level node. Its own forks and subagents stay under it. A fork of a split session is still linked to the split session.

**Where the flags come from.** The app writes one file per session, `local_<id>.json`, under `%APPDATA%\Claude\claude-code-sessions\<account>\<org>\`. The record's `cliSessionId` is the transcript session ID, which is the join key. On a machine without that folder, the flags are all false. Set `CLAUDE_DESKTOP_SESSIONS_DIR` to read the records from another folder.

**Caveats.** The record format is internal to the desktop app and may change. The reader uses only the three fields above and treats anything missing as not set. A session that was never opened in the desktop app has no record, so it is never hidden or split. Records are read on every request, reusing each file's parse while its modification time is unchanged.

### Project naming

The project's name comes from its working directory as recorded in the transcripts (the `cwd` field), not from the directory name. Claude Code names the directory by replacing every non-alphanumeric character with `-`, which cannot be reversed. For example, `D:\MCLA` becomes `D--MCLA`.

The name is picked in this order:

1. `name` in the project's `package.json`.
2. The `origin` remote's repository name, read from the git config. Worktrees and submodules are followed.
3. The last segment of the working directory.

If no transcript has a `cwd`, the directory name is shown as the project path and name. It is not a real path in that case.

### Session naming

The session's name is picked in this order:

1. The newest `custom-title` in the transcript. This is what `/rename` and `--name` set. The whole file is read once per change, so a rename in the middle of a long session is found.
2. Claude Code's `summary` text.
3. The first real user message, cut to 80 characters.

A session with none of these shows "Untitled session". The branch is never used as the name.

### Fork links

A session is linked to a parent when its first 50 lines carry `forkedFrom.sessionId` and that parent is in the same project. Links are drawn from the parent, not the other way round. A fork whose parent is not in the project is shown at the top level, unlinked.

Continuations (a session started because the previous one ran out of context) are not linked to anything, even though their first message says so. They are top-level sessions.

### Status

One rule set drives the Sessions list and the map (`src/lib/status/session-status.ts`). Priority is needs-you, then active, then completed, then idle.

Every status border is 2 px wide on session cards and on map session nodes.

| Status | Border (2 px) | Motion | Rule |
|---|---|---|---|
| Needs you | yellow `#facc15` | fast pulse, 1.2 s. The glow grows to about 14 px at 0.9 alpha, and the border brightens at the peak. | The session is active and has an open `AskUserQuestion`, or a Notification hook event is newer than its last write. An open question in an idle session is ignored, since it was abandoned. |
| Active | green | slow pulse, 2.4 s. The glow grows to about 10 px at 0.7 alpha. | Active: the transcript file was written in the last 2 minutes, its last record is also in the last 2 minutes, and the session's folder exists (see limitations). A file that is only touched, with no new record, is not active. |
| Completed | Claude orange `#d97757`, solid | none | Not active, the last assistant `stop_reason` is `end_turn`, and the last write was within the **last hour**. |
| Idle | grey | none | Anything else. Including completed sessions older than an hour. |

**Subagent cards** use a separate, simpler rule. Their border is 1.5 px wide.

| State | Border | Motion | Rule |
|---|---|---|---|
| Running | green | slow pulse, as for active | The timestamp of the subagent transcript's **last record** is within the last **5 minutes** (`SUBAGENT_CACHE_WINDOW_MS`). The file's modification time is not used. |
| Expired | not drawn | none | Anything else, including a subagent with no transcript file or no `agentId`. It is counted on the session's **+N** chip. |

**How the pulse is drawn.** Session cards glow with a `box-shadow` on their border. Map nodes have a halo rect behind them that fades in and scales from 1 to 1.03 around its centre, inset 2 px. Both are CSS keyframes, with no JavaScript timers. With `prefers-reduced-motion: reduce`, the pulse stops, the halo is hidden, and the status colour and border stay.

### Subagent details

The side panel shows tokens, duration, tool calls, model and the dispatch time. Session tokens include the subagents. Subagent cards are not sessions, so they are not listed in the Sessions list.

### Hook events

`bin/claude-dashboard-hook.mjs` appends one line per `Notification` or `Stop` event to `~/.claude-dashboard/events.jsonl` (or `$CLAUDE_DASHBOARD_HOME/events.jsonl`):

```json
{"ts":"2026-10-29T10:03:00.000Z","event":"Notification","sessionId":"<id>","cwd":"/path/to/project","message":"Claude needs your permission to use Bash","notificationType":"permission_prompt","title":null}
```

| Field | From the hook input | Notes |
|---|---|---|
| `ts` | (hook run time) | ISO 8601. |
| `event` | `hook_event_name` | Only `Notification` and `Stop` are recorded. |
| `sessionId` | `session_id` | Required. Events without it are dropped. |
| `cwd` | `cwd` | `null` when absent. |
| `message` | `message` | `null` when absent or not a string. |
| `notificationType` | `notification_type` | New. `null` for `Stop`, or when absent. The Notification types are `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` and others (see the data mapping guide). |
| `title` | `title` | New. Optional in Claude Code's input. `null` when absent. |

The hook is the only writer of this file. It always exits 0 and swallows errors, so it never blocks Claude Code.

**The snippet has no matcher.** A `Notification` entry with no matcher fires for every notification type, and the Stop entry has no matcher, since `Stop` does not support one. Use `notificationType` in the events panel to tell them apart.

**The path is absolute.** The snippet points at `bin/claude-dashboard-hook.mjs` in the install it was printed from. If you move or delete that install, the hook breaks silently. A global install is recommended. Re-run `--print-hook-config` after installing.

## Status of features

| Feature | Status | Notes |
|---|---|---|
| Map of every session in a project | Built | No cap. Every session is parsed on the first load and cached by file mtime. |
| Fork links (child of the parent session) | Built | From `forkedFrom` in the first 50 lines, or else the desktop app's `spawnedFrom`. Same project only. A split session is never linked. |
| Split-out forks shown at top level | Built | A session the desktop app split (`lineageDetached`) gets no parent link. Its transcript still names the parent. See [Archived and split sessions](#archived-and-split-sessions). |
| Continuations linked to their predecessor | Not built, by design | No structural link in the transcript. |
| Subagents as small cards, running only | Built | Running means the subagent transcript's last record is within 5 minutes. Expired subagents are counted on the session's +N chip. |
| Sessions with no project hidden | Built | Map and Sessions list. Stats and project analytics still count them. |
| Archived sessions hidden | Built | From the desktop app's session record (`isArchived`). Counted as "archived hidden". |
| Pan, zoom and fit | Built | Drag, wheel, pinch, corner buttons. The map fills the panel. |
| Layout editor | Built | Drag cards, arrow keys nudge. Saved per project in the browser. Reset layout clears it. |
| Subagent transcripts as their own sessions | Not built | Used only to judge running state. |
| Project name from package.json, git, or folder | Built | From the transcripts' `cwd`. Windows paths read only on Windows. |
| Session name from `custom-title`, summary, first prompt | Built | Newest `custom-title` wins. |
| Running sessions from `~/.claude/sessions/` | Not built | The file format was not found in the 2.1.312 bundle. The mtime heuristic is kept. |
| Config dir from `CLAUDE_CONFIG_DIR` | Built | `CLAUDE_HOME` is a legacy alias. |
| Notifications with type and title | Built, opt-in | Through the Notification hook. Permission prompts are not in the transcript. |
| Needs-you panel | Built | Open questions and Notification hook events. |
| Recent hook events panel | Built, opt-in | Last 100 events. |
| Windows setup | Documented, not tested on a Windows host | Path logic is unit-tested with Windows-style strings. |
| WSL sources on the map | Not built | Sessions list only. |
| Sending messages to a session | Not built (Phase 2) | Planned: a Stop-hook inbox, plus headless resume for idle sessions. |
| Linking sessions beyond forks | Not built (Phase 2) | Forks are the only relation the map draws. |
| Stats: tokens, duration, tool calls, model | Built | Per session, including subagents. |
| Cost per node on the map | Not built | `features/cost-estimation` has the calculator. The map does not use it yet. |

## Known limitations

- **Desktop app records are internal.** The split and archive flags come from `%APPDATA%\Claude\claude-code-sessions`, which the app writes. The format is not documented. Only Windows has this folder unless `CLAUDE_DESKTOP_SESSIONS_DIR` is set, so WSL and macOS sessions are not hidden or split by these flags. The split marker was confirmed on one real split (`lineageDetached: true`), not on a full set of cases.
- **Open question: active sessions need a folder.** The active check (`src/lib/scanner/active-detector.ts`) requires a folder named after the session id next to the transcript. A session with no such folder can never show as active, including a fork. We have not measured how often this happens on real data.
- **Transcripts are an internal format.** Claude Code does not document the JSONL record shapes. The fields the map reads are listed in the data mapping guide, marked by how sure we are. Upgrades can break them. Check that guide's upgrade checklist after each Claude Code upgrade.
- **Message counts come from the first and last 15 lines** of each file, so a long session shows a count that is too low. This predates Phase 1 and is not fixed here. The sessions list and the map both show it.
- **Permission prompts were not found in the transcript.** Only the Notification hook reveals them. Without the hook, a session waiting on one looks idle.
- **An unanswered `AskUserQuestion` can belong to an abandoned session.** It is ignored once the session is idle, but an active session with a stale question still shows as needs-you.
- **Background tasks are counted from their output file.** A task is running while its output has no exit line, is not empty, is not a subagent transcript, and was written in the last 10 minutes. A finished task ends with `[exited with code N]`. A killed or silent task drops out after 10 minutes. The exit line is confirmed on Linux task output; Windows output has not been confirmed yet.
- **Subagents quiet for more than 5 minutes are not drawn**, even if they are still working. Running is judged from the transcript's last record, so a subagent that goes silent for longer than the window counts as expired until it writes again. The session's +N chip still counts it.
- **Archive state lives in the desktop app's records, not the transcript.** The CLI transcript has no archive marker. The app's record (`isArchived`) is the source now used. A session with no desktop record cannot be archived as far as the dashboard can tell.
- **The map reads only the primary data source.** On Windows, WSL sessions are listed on the Sessions page but not on the map.
- **Scale.** The first map load parses every session in the project in full, one at a time. Later loads reuse the cache, but active sessions are parsed on every poll (every 10 seconds). A project with hundreds of long sessions will load slowly the first time.
- **A Windows path can only be read on Windows.** On a Linux server, a Windows `cwd` is shown as recorded, and the name falls back to the last segment of the path.
- **The `events.jsonl` log is read whole** on each request, and the events panel shows the newest 100. Rotation is not implemented.
- **Hook payload fields.** The fields are confirmed in the 2.1.312 bundle (see the data mapping guide), but Claude Code may change them. Check the events file after an upgrade.

## Upgrade path

Steps 1 and 2 are maintenance and should run after each Claude Code upgrade. Steps 3 to 9 are options, not decisions. Each needs a design decision before any work starts, and they are independent of each other.

1. **Re-check the transcript format after an upgrade.** Follow the checklist in [the data mapping guide](../guide-claude-data-mapping.md#upgrade-checklist-run-after-each-claude-code-upgrade). Update `src/lib/parsers/session-head.ts` and `session-parser.ts` if a field moves.

2. **Measure the active-folder rule.** Count how many real sessions are written in the last 2 minutes but have no folder. If the number is large, look for another signal, such as the `sessions/` directory once its format is confirmed.

3. **Option: Stop-hook inbox (Phase 2).** A message written by the dashboard goes into an inbox under `~/.claude-dashboard/`, and a Stop hook delivers it when Claude finishes a turn. Changes: `bin/claude-dashboard-hook.mjs` (returns pending messages in the hook's output format, confirmed for the installed version first), an inbox module under `src/lib/`, and a composer in `src/features/project-map/`. Which hook output shape delivers a message, and how a message reaches an idle session, is a design decision. Review it with an architect before implementing.

4. **Option: headless resume for idle sessions (Phase 2).** `claude --resume <id> -p "<message>"` for sessions that are not running. Spawn with `execFile`, never a shell string. Add a per-session lock, a timeout, and a clear UI state while it runs. Handle the case where the session is open in a terminal.

5. **Option: session links beyond forks (Phase 2).** Store links under `~/.claude-dashboard/`, never `~/.claude`. Add a link kind to `MapEdge` in `src/lib/map/project-map.ts`, and have `src/lib/map/layout.ts` draw it. Decide the link model first.

6. **Cost per node.** Add per-model token totals to `MapNode`, then reuse `src/features/cost-estimation/cost-calculator.ts` in the details panel.

7. **Cache correctness.** Include the subagent directory's mtime in the cache key in `src/features/project-map/project-map.api.ts`, so a subagent change invalidates its parent's cached detail. Subagent write times are already read on each request, so only the cached detail needs this.

8. **Scale.** Measure the first load on a project with hundreds of sessions. If it is too slow, add pagination or virtualised rows, and stream parses in parallel with a limit.

9. **WSL on the map.** Carry the data source through `scanProjectsFrom` and the map server function, and key projects by source as well as directory.

## Changelog

### Phase 1 follow-up: map display (2026-10-29)

- **Pulse.** Needs-you pulses every 1.2 s with a 14 px glow and a brighter border at the peak. Active pulses every 2.4 s with a 10 px glow. Both are CSS keyframes. The map draws the glow as a halo rect behind each node.
- **Borders.** Status borders are 2 px on session cards and map session nodes, and 1.5 px on subagent cards. Colours are unchanged.
- **Subagent expiry.** A subagent is running for 5 minutes after its last write (was 2). Expired subagents are not drawn. A **+N** chip on the session node counts them, and the info line shows the project total.
- **No-project sessions.** Sessions with no working directory are hidden from the map, the project dropdown and the Sessions list, and their count is shown. Stats and project analytics are unchanged.
- **Archived sessions.** Hidden, from the desktop app's `isArchived` flag (see [Archived and split sessions](#archived-and-split-sessions)). Not found in the transcripts.

### Phase 1 follow-up (2026-10-29)

Fixes for problems a Windows user reported with real data.

- **Project name.** The directory name is no longer decoded. The project's path and name come from the transcripts' `cwd`. The name then comes from `package.json`, the git `origin` remote (following `.git` files and worktrees), or the folder name. Hyphenated and dotted folder names keep their characters.
- **Session name.** Uses the newest `custom-title` (set by `/rename` or `--name`), then the summary, then the first prompt. Branch names are no longer used as titles.
- **Forks.** Forks show as child nodes of the session they were forked from. Forks whose parent is not in the project, and sessions split to the top level in the desktop app, are not linked.
- **Subagents.** Smaller cards, linked to their dispatching session or fork, with running and done states.
- **Every session.** The map no longer stops at 25 sessions per project.
- **Layout.** A tree layout, with one column per depth.
- **Hook.** Records `notificationType` and `title`. The printed snippet has no matchers.
- **Config dir.** `CLAUDE_CONFIG_DIR` is read first. `CLAUDE_HOME` is kept as an alias. The CLI pre-flight check and the app info page use the same resolution.
- **Docs.** The data mapping guide was rewritten and verified against Claude Code 2.1.312.

### Phase 1 (unreleased)

- New **Map** page at `/map` with a per-project map of sessions and their subagents, dispatch edges, a Needs you panel, a recent hook events panel, and a details panel.
- Open `AskUserQuestion` calls are detected from session transcripts.
- Opt-in `Notification` and `Stop` hooks write to `~/.claude-dashboard/events.jsonl`. Print the snippet with `claude-dashboard --print-hook-config`.
- New `--print-hook-config` CLI flag and help text.
- Read-only: no writes to `~/.claude`.

### Archived and split sessions (2026-10-30)

- **Archived sessions hidden.** Read from the desktop app's session record (`isArchived`), joined to the transcript by `cliSessionId`. Shown as **N archived hidden** on the map and the Sessions page.
- **Split sessions.** Read from `lineageDetached` in the same record. The map draws no parent link for them, so they are top-level nodes.
- **New module.** `src/lib/desktop/desktop-records.ts`, with tests. Stats and project analytics are unchanged.

### Ordering, parent links and activity (2026-10-30, later)

- **Activity needs a recent record.** An active session needs both a recently written file and a recent last record. A file that an app or a backup only touches stays idle. This removed false greens on old sessions.
- **Subagents use the last record's timestamp** from the end of their transcript, not the file's modification time.
- **Order follows the desktop app.** Top-level sessions are ordered by the desktop record's `lastActivityAt`, falling back to the transcript's last record. The order was checked against the app's sidebar.
- **Nesting follows `spawnedFrom`.** The app nests a session under its parent with `spawnedFrom`, which is written either as a string or as an object with `sessionId`. The map now links those children, as it does forks. The card says **sub-session** for these, and **fork** for a child linked by the transcript's `forkedFrom`.
- **Layout.** Session nodes are 280 by 92 px and subagent cards 190 by 50 px. The project name is no longer on the card.

### Background tasks (2026-10-30, later still)

- **Running tasks keep a session active.** A session is active while one of its background tasks is running, even if its transcript is quiet. A task is running while its output file under `%TEMP%\claude\<project folder>\<session ID>\tasks\` has no exit line, is not empty, is not a subagent transcript, and was written in the last 10 minutes. Code: `src/lib/scanner/background-tasks.ts`.
- **The card shows a green "N tasks" chip** with the number of running tasks.

### Pan, zoom and layout editor (2026-10-30, latest)

- **The map fills the window.** The Map page is no longer held to a 1024 px column, and the panel is sized to the window instead of a fixed height with scrollbars.
- **Pan and zoom replace scrolling.** Drag to pan freely, wheel to zoom, **Fit** to see everything.
- **Edit layout mode.** Drag cards to where you want them. Positions are kept per project in the browser, and **Reset layout** clears them. Code: `src/features/project-map/MapCanvas.tsx`, `src/lib/map/viewport.ts`, `applyNodeOffsets` in `src/lib/map/layout.ts`.
