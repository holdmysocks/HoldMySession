# Session Map

The Session Map is a read-only view of one project's Claude Code sessions. Each session in the project is a node, its subagents are child nodes joined by dispatch edges, and a side panel lists what is waiting on you and recent hook notifications.

Phase 1 is read-only. It never writes to `~/.claude`. Messaging and linking sessions are Phase 2 (see [Status](#status)).

## Running it

From the repository:

```bash
cd apps/web
npm run build && npm start
```

Open `http://localhost:3000/map`, or pick a project from the **Map** entry in the sidebar.

Options are the same as the dashboard: `--port`, `--host`, `--open`. Run `claude-dashboard --help` for the list.

## Turning on notifications

Notifications come from Claude Code hooks, which you opt into. The dashboard does not install anything.

1. Print the snippet:

   ```bash
   claude-dashboard --print-hook-config
   ```

   It prints JSON with `Notification` and `Stop` hooks. It only prints; it never writes files. A note on stderr says where it goes.

2. Merge the `hooks` block into `~/.claude/settings.json`. If the file already has a `hooks` key, merge the two `Notification` and `Stop` arrays rather than replacing the object.

3. Restart any running Claude Code session before relying on notifications, so it loads the new hook configuration. Sessions started after the change will record events.

**The path is absolute.** The snippet points at `bin/claude-dashboard-hook.mjs` inside the install directory it was printed from. If you run the dashboard from a checkout and later move or delete it, the hook breaks silently. A global install (`npm install -g claude-session-dashboard`) is recommended, and then re-run `--print-hook-config` from that install.

The hook is designed never to block Claude Code. It always exits 0, and any error is swallowed.

## Data sources

Everything below is read from `~/.claude` (or `$CLAUDE_HOME`), except the hook log.

| Feature | Read from | Fields used |
|---|---|---|
| Project list | `projects/<dir>/*.jsonl` (file names and mtimes), decoded directory name | Project path comes from the directory name. Lossy for paths containing `-`, as in the rest of the app. |
| Sessions listed | Every top-level `projects/<dir>/*.jsonl` | No filter. A `queue-operation` line does not make a session headless: interactive sessions can contain one too. Subagent transcripts live in subfolders and are not listed as sessions. |
| Project name | `name` in the project's `package.json`, then the `origin` remote's repo name in `.git/config`, then the folder name | Read-only, cached by path. Only absolute decoded paths are looked up. |
| Session node: title | Latest `summary` line (Claude Code's auto-title), else the first user text message, cut to 80 characters | Falls back to `gitBranch`, then the first 8 characters of the session id. The `summary` line shape is assumed; verify on a real session file. |
| Session node: status | Session file mtime, a lock directory `projects/<dir>/<sessionId>/`, the last assistant `stop_reason`, hook notifications, and open `AskUserQuestion` calls | See [Session status](#session-status). |
| Session node: model | First assistant `message.model` | |
| Session node: duration | First and last `timestamp` | |
| Session node: tool calls | Count of `tool_use` blocks in assistant messages | |
| Session node: tokens | `message.usage` (input, output, cache read, cache creation) | Summed over the session, and includes its subagents (the parser folds them in). |
| Subagent node | `tool_use` blocks named `Agent` or `Task` (`input.subagent_type`, `description`) | Dispatch record in the parent session. |
| Subagent stats | `toolUseResult` on the matching `tool_result` (`totalTokens`, `totalToolUseCount`, `totalDurationMs`, `agentId`) | Subagent transcripts in `<sessionId>/subagents/agent-*.jsonl` (or `agents/`) fill in model and token detail when they can be matched by `agentId`. |
| Orphan subagent | A subagent transcript that matches no dispatch record | Shown as `unknown`. |
| Requests from me | `tool_use` named `AskUserQuestion` with no `tool_result` for the same id | Header and question text. Oldest first. |
| Notifications | `~/.claude-dashboard/events.jsonl` (written by the hook) | Latest `Notification` per session. |

### What the hook writes

`bin/claude-dashboard-hook.mjs` appends one JSON object per line to `events.jsonl`, for `Notification` and `Stop` events only:

```json
{"ts":"2026-10-29T10:03:00.000Z","event":"Notification","sessionId":"<id>","cwd":"/path/to/project","message":"Claude needs your permission to use Bash"}
```

- `ts` is the time the hook ran, as an ISO 8601 string.
- `cwd` and `message` are `null` when the payload does not provide them.
- The log lives in `~/.claude-dashboard/` by default. Set `CLAUDE_DASHBOARD_HOME` to change it. The dashboard and the hook must agree on this value (it is read from the same environment).

The hook is the only writer. The dashboard reads the log and never writes to it.

## Session status

One shared rule set drives the Sessions list cards and the map nodes (`src/lib/status/session-status.ts`). Priority is needs-you, then active, then completed, then idle.

| Status | Border | Look | Rule |
|---|---|---|---|
| needs-you | yellow | fast pulse, about 1 s | Session is active and has an open `AskUserQuestion`, or a `Notification` hook event newer than its last write. Waiting questions in an idle session are ignored, since they were abandoned. |
| active | green | slow pulse, about 2.5 s | Active, per the 2-minute mtime and lock-directory check. |
| completed | solid Claude orange | none | Not active, last assistant `stop_reason` is `end_turn`, and the last write is within 1 hour. Older sessions are idle. |
| idle | grey | none | Anything else. |

The pulse is CSS only. With `prefers-reduced-motion: reduce`, the pulse stops and the colour stays.

## Status

| Feature | Status | Notes |
|---|---|---|
| Project map (sessions as nodes) | Built | Newest 25 sessions per project. |
| Subagents as child nodes with dispatch edges | Built | From the parent's dispatch records, with stats from `toolUseResult`. |
| Child sessions (subagent transcripts as their own nodes) | Not built | Subagent transcripts are used only to enrich the matching subagent node. They are not mapped as separate sessions. |
| Requests from me (open `AskUserQuestion`) | Built | Shown on the session node, in Needs you, and in the details panel. |
| Permission prompts | Built, opt-in | Only through the `Notification` hook. They are not in the transcript. |
| Notifications (recent hook events) | Built, opt-in | Recent events panel; a session needs you when a `Notification` is newer than its last write. |
| Sending messages to a session | Not built (Phase 2) | Planned: a Stop-hook inbox, plus a headless `claude --resume <id> -p "..."` fallback for idle sessions. |
| Linking two sessions | Not built (Phase 2) | Session-to-session links cannot be inferred from the data yet. |
| Stats: tokens | Built | Per session, including subagents. Per subagent, its own total. |
| Stats: duration | Built | Session: first to last timestamp. Subagent: `totalDurationMs`. |
| Stats: tool calls | Built | Per session and per subagent where available. |
| Stats: model | Built | Session: first assistant model. Subagent: transcript model, else dispatch model. |
| Stats: cost | Not built on the map | Available per session on the session detail page. |

## Known limitations

- **Permission prompts are not in the transcript.** Only a `Notification` hook reveals them, so without the hook, a session waiting on a permission prompt looks idle.
- **An unanswered `AskUserQuestion` can belong to an abandoned session.** A question with no answer is shown as open even if the session was closed. Check the session's status before acting.
- **Maps are capped at 25 sessions** per project, newest first.
- **The events log is unbounded and is read whole** on each request. Only the last 500 events (for notifications) and last 100 (for the panel) are used, but the whole file is read. Rotation is not implemented.
- **The subagent cache can go stale while the parent is idle.** Cached session detail is keyed by the parent file's mtime. A subagent transcript that changes while its parent is idle does not invalidate the cache until the parent is written.
- **Orphan subagents show as `unknown`.** These are subagent transcripts that cannot be matched to a dispatch, usually because the parent's dispatch record is missing or was written in a format the parser does not read.
- **Session-to-session links cannot be inferred yet.** The map shows dispatch edges only, from a session to its own subagents.
- **Project paths come from directory names,** which are lossy when a path contains `-`. This is the same limitation as the rest of the dashboard.
- **Hook payload field names are unverified against every Claude Code version.** The hook reads `hook_event_name`, `session_id`, `cwd` and `message`, as we understand the hooks documentation. Verify them against your installed Claude Code before relying on notifications, and update `bin/claude-dashboard-hook.mjs` if they differ.

## Upgrade path

Work through these in order. Each step is independent enough to ship on its own.

1. **Verify the hook payload** (small, do first). Run a session with the snippet installed, inspect what the `Notification` and `Stop` hooks receive, and adjust field names in `bin/claude-dashboard-hook.mjs` (`payload.hook_event_name`, `payload.session_id`, `payload.cwd`, `payload.message`). The tests in `src/lib/events/hook-script.test.ts` pipe a payload into the script, so update the fixtures to match.

2. **Stop-hook inbox (Phase 2a).** A message written by the dashboard goes into an inbox file under `~/.claude-dashboard/`, and a Stop hook delivers it to the running session when Claude finishes a turn. Changes:
   - `bin/claude-dashboard-hook.mjs`: on `Stop`, read the session's pending inbox entries and return them to Claude Code in the hook's documented output format. Confirm that format against the installed version first.
   - `src/lib/events/` (or a new `src/lib/inbox/`): inbox schema and append/read helpers. Keep writes under `~/.claude-dashboard/`, never `~/.claude`.
   - `src/features/project-map/`: a composer on the node details panel, with a server function that appends to the inbox. Keep it in its own slice (for example `src/features/session-messages/`).
   - Consider this a design decision: which Claude Code hook output shape delivers a message, and how a message to an idle session is handled. Review this with an architect before implementing.

3. **Headless resume for idle sessions (Phase 2b).** For sessions that are not running, the dashboard runs `claude --resume <id> -p "<message>"`. Changes: a server function that spawns that process with `execFile` (never a shell string), a per-session lock so two messages do not run at once, and a clear UI state while it runs. This needs careful handling of concurrency, timeouts and output, and of the case where the user has the session open in a terminal. Suited to a more capable agent or a careful reviewer.

4. **Session linking (Phase 2c).** Store links under `~/.claude-dashboard/`, never `~/.claude`. Add a `link` edge kind to `MapEdge` in `src/lib/map/project-map.ts`, and have `layoutProjectMap` draw it. Decide the link model first (one-way or two-way, and what a link means for the inbox). This is a data-model decision: architect first, then implement.

5. **Cost per node.** Add `tokensByModel` to `MapNode` in `src/lib/map/project-map.ts`, then reuse `src/features/cost-estimation/cost-calculator.ts` in the details panel. Small and mechanical.

6. **Cache correctness.** Include the subagent directory's mtime in the cache key in `src/features/project-map/project-map.api.ts`, so subagent changes invalidate the parent's cache. Add a test for `resolveSessionDetail` with a changed subagent mtime.

7. **Scale.** Lift the 25-session cap with pagination or virtualised rows. Add rotation or an index for `events.jsonl`. Both are mechanical and suit a smaller agent.

## Changelog

### Phase 1 (unreleased)

- New **Map** page at `/map` with a per-project map of sessions and their subagents, dispatch edges, a Needs you panel, a recent hook events panel, and a details panel.
- Open `AskUserQuestion` calls are detected from session transcripts.
- Opt-in `Notification` and `Stop` hooks write to `~/.claude-dashboard/events.jsonl`. Print the snippet with `claude-dashboard --print-hook-config`.
- New `--print-hook-config` CLI flag and help text.
- Read-only: no writes to `~/.claude`.
