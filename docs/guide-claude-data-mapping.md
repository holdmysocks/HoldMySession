# Data Mapping Guide: Claude Code files and what the dashboard reads

**Verified against:** Claude Code **2.1.312** (installed CLI bundle, `cli.js`), and the official Claude Code documentation at `code.claude.com/docs`.
**Date verified:** 2026-10-29.
**Dashboard version:** 0.5.1 on branch `feature/session-map-phase1`.

This guide replaces the 2025 version. It covers only what the code reads today.

## How to read the status column

| Status | Meaning |
|---|---|
| **Documented** | Stated in the official Claude Code docs (`code.claude.com/docs`, fetched 2026-10-29). |
| **Internal, verified in 2.1.312** | Not in the docs. Seen in the 2.1.312 CLI bundle (`cli.js`), so it may change in any release. |
| **Unverified** | We used it, but could not confirm it in the docs or the bundle. Treat as a guess until checked. |

**Warning: the transcript format is internal.** Claude Code does not document the JSONL record shapes. Everything under "Transcripts" below can change between releases. Re-check this guide after each upgrade, using the checklist at the end.

## Where the data lives

The Claude config directory is resolved in this order (`apps/web/src/lib/utils/claude-path.ts`):

1. `CLAUDE_CONFIG_DIR`. Documented. Claude Code moves everything under `~/.claude` to this folder.
2. `CLAUDE_HOME`. The dashboard's older name. Kept as an alias for step 1 and used only when step 1 is unset or empty.
3. `~/.claude`. On Windows, `~` is `%USERPROFILE%`, so this is `C:\Users\<you>\.claude`.

`CLAUDE_CODE_PROJECT_DIR_NAME` is Documented as naming the project directory when `CLAUDE_CONFIG_DIR` is set. It does not appear in the 2.1.312 bundle, and the dashboard does not read it. The dashboard lists every directory under `projects/`, so it never needs to know a project's directory name in advance.

### Windows paths

| What | Example |
|---|---|
| Config dir | `C:\Users\<you>\.claude` |
| Transcript | `C:\Users\<you>\.claude\projects\D--MCLA\<session-id>.jsonl` |
| Subagent transcript | `C:\Users\<you>\.claude\projects\D--MCLA\<session-id>\subagents\agent-<agentId>.jsonl` |
| Dashboard hook log | `C:\Users\<you>\.claude-dashboard\events.jsonl` |
| Recorded cwd | `D:\MCLA` (the directory name `D--MCLA` is only a key) |

The `D--MCLA` example comes from the rule above: `D`, `:` and `\` each become `-`.

`CLAUDE_DASHBOARD_HOME` is not a Claude variable. It sets where the dashboard keeps its own hook log (`events.jsonl`), default `~/.claude-dashboard`. The dashboard never writes under the Claude config directory.

## Directory layout

| Path under the config dir | Status | Dashboard use |
|---|---|---|
| `projects/<project>/<session-id>.jsonl` | Documented (location). Record shapes: Internal, verified in 2.1.312 | Session list, map, detail. One file per session. |
| `projects/<project>/<session-id>/subagents/agent-<agentId>.jsonl` | Documented (location). Internal, verified in 2.1.312 for the `agent-<agentId>` naming | Subagent transcripts. Read for the running or done state of a subagent card. |
| `projects/<project>/<session-id>/agents/` | Unverified (an older fallback the code still checks) | Same as `subagents/`, used only when `subagents/` is absent. |
| `projects/<project>/<session-id>/tool-results/` | Documented | Not read. |
| `projects/<project>/<session-id>/` (the folder itself) | Documented as the place for subagents and tool results | Used as a *lock directory*: the active check requires it to exist. See the warning in the active-session section. |
| `sessions/` (one small file per running session) | Documented. **Not located in the 2.1.312 bundle** | Not used. The dashboard keeps the mtime heuristic. |
| `settings.json` (`hooks` key) | Documented | Not read. The dashboard prints a snippet for you to merge (`claude-dashboard --print-hook-config`). |
| `stats-cache.json`, `history.jsonl` | Unverified in the 2.1.312 bundle review | Stats page. Not part of the Session Map. |

### Project directory naming (why the dashboard never decodes it)

Documented: a project's directory is its working directory with **every non-alphanumeric character replaced by `-`**. If the result is longer than 200 characters, it is truncated and a hash is appended.

This rule is lossy. `D:\MCLA` becomes `D--MCLA`. The folder `rusty-mcla` and the path `rusty/mcla` both become `-rusty-mcla`. A reverse mapping cannot recover the path, so **the dashboard does not decode the directory name at all.**

Before this change, the dashboard decoded `D--MCLA` back to `D//MCLA`. The drive-letter check then failed, so the package name and git lookups never ran, and the folder name was shown instead of the project's real name.

What the dashboard does now (`src/lib/scanner/project-scanner.ts`):

1. For each project directory, read the head (first 50 lines) of its session files, in name order, and take the first record that has a string `cwd`. That is the project's working directory.
2. Use that `cwd` as the project path, as shown in the UI. The name comes from the last segment of the path (split on both `/` and `\`, so Windows paths work on any OS).
3. Only when no record has a `cwd` does the dashboard fall back to the directory name. That fallback is shown as-is and is not a real path.
4. The directory name is kept as an internal key (`projectKey`). It addresses the project in URLs and is never shown as a path.

`cwd` is Documented as a common hook input field. In transcripts it is Internal, verified in 2.1.312 (it appears on user and assistant records).

### Display name

`resolveProjectDisplayName` (`src/lib/scanner/project-display-name.ts`) picks, in order:

1. `name` in `<cwd>/package.json`, if non-empty.
2. The repository name from the `origin` remote in the git config at `<cwd>/.git`. A `.git` **folder** is read directly. A `.git` **file** (`gitdir: <path>`, used by worktrees and submodules) is followed. A worktree's `commondir` file is followed to the shared config.
3. The last segment of the cwd.

These files are read only and cached by path. Only absolute paths are looked up, so a Windows path read on Linux is not read.

**Not verified here:** reading `D:\...` on a Windows host was not exercised in this sandbox. The Linux test exercises the same code with POSIX paths, plus a unit test for Windows-style cwd values.

## Transcripts (`projects/<project>/<session-id>.jsonl`)

One JSON object per line. Records are not in a fixed order, and one session can hold several record types.

| Field or record | Status | Dashboard use |
|---|---|---|
| `type` values seen: `user`, `assistant`, `system`, `progress`, `file-history-snapshot`, `summary`, `custom-title`, `queue-operation`, `agent-name`, `agent-color`, `agent-setting`, `tag`, `pr-link` | Internal, verified in 2.1.312 | Counted or read where noted below. Others are ignored. |
| `timestamp` (ISO 8601) | Internal, verified | First and last activity, duration, the "last active" time. |
| `sessionId` | Internal, verified | Matches the file name. |
| `cwd` | Internal, verified (see above) | Project path. Also stored per session. |
| `gitBranch` | Internal, verified | Branch shown on the card and the map node. |
| `version` | Internal, verified | Stored. Not shown on the map. |
| `message.model`, `message.usage`, `message.stop_reason`, `message.content` (blocks: `text`, `tool_use`, `tool_result`) | Internal, verified | Model, tokens, stop reason (completed status), tool calls, questions. |
| `requestId` | Internal, verified | De-duplicates repeated API responses when token totals are summed. |
| `isSidechain`, `isMeta` | Internal, verified | `isMeta` user lines are skipped for the first prompt. |
| `type: "custom-title"`, field `customTitle`, `sessionId` | Internal, verified (writer and shape) | **Session name.** Written by `/rename`, by the picker's rename (Ctrl+R), and when a fork is created. The **newest** record wins. It can appear anywhere in the file, so the dashboard reads the whole file once per change. |
| `type: "summary"`, fields `summary` (text) and `leafUuid` | Internal, verified (the CLI reads it as `k.type==="summary"&&k.leafUuid`). **Writer not located in 2.1.312** | Session name, when there is no `custom-title`. Read from the head and tail of the file. |
| `type: "agent-name"`, field `agentName` | Internal, verified (writer and shape) | Not used. Claude Code's picker can use it for the title. The dashboard does not, so an agent name does not change the displayed name. |
| `type: "progress"`, `parentToolUseID`, `data.agentId`, `data.message.message.usage` | Internal, verified | Links a subagent id to its dispatch. Per-subagent token totals. |
| `type: "queue-operation"` | Internal, verified | Not treated as a sign that the session is non-interactive. Interactive sessions can have them too. |
| Fork link: `forkedFrom: { sessionId, messageUuid }` on each copied record | Internal, verified in 2.1.312 (writer and shape). See "Forks" | The parent session of a fork. Read from the first 50 lines. |

### Session name precedence

`resolveSessionName` (`src/lib/parsers/session-name.ts`):

1. The newest `custom-title` in the whole file.
2. The `summary` text (newest, from the head or tail).
3. The first real user message (skipping `isMeta` lines and command wrappers), cut to 80 characters.

The precedence matches the order Claude Code's own picker uses, without agent names. The order itself was taken from the 2.1.312 bundle review and was not re-checked line by line in this pass.

### Forks

Verified in 2.1.312. A fork (`--fork-session` with `--resume` or `--continue`, or `/branch`) writes a **new session file**. Each copied record is written with:

- the **new** `sessionId`,
- `isSidechain: false`,
- `parentUuid`: the previous copied record's uuid, or `null` for the first copied record,
- `forkedFrom: { sessionId: <parent session id>, messageUuid: <original record uuid> }`.

Only the copied records carry `forkedFrom`. In-memory copies do not, so `forkedFrom` appears in the file only.

What the dashboard does:

- Reads `forkedFrom.sessionId` from the first 50 lines of a session. It does not scan the rest of the file.
- If the parent session file is in the **same project directory**, the fork becomes a child node of the parent on the map. The fork is drawn with a dashed edge.
- If the parent is not present, the fork is shown at the top level, unlinked.
- A session with no `forkedFrom` is always top level, however similar its content.

**Split sessions.** When the Claude desktop app splits a fork to the top level, the transcript still shows `forkedFrom`, and `spawnedFrom` in the app's record still names the parent. The app's session record sets `lineageDetached: true`. The dashboard reads that flag and draws no parent link. See [Desktop app session records](#desktop-app-session-records) below.

### Continuations (context ran out)

Internal, verified in 2.1.312 (the text is generated in the bundle): when a session runs out of context, Claude Code starts a new session file whose first user message begins with `This session is being continued from a previous conversation that ran out of context.` That new file has **no structural link** to the old one.

The dashboard does **not** link continuations to anything. They appear as ordinary top-level sessions.

### Subagents

Documented location: `projects/<project>/<session-id>/subagents/agent-<agentId>.jsonl`.

Internal, verified in 2.1.312:

- The dispatch is a `tool_use` block in the parent transcript, named `Agent` (current) or `Task` (older). Its input carries `subagent_type` and `description`.
- The subagent's `agentId` appears on `progress` records whose `parentToolUseID` matches the dispatch.
- Token and duration totals come from the matching `tool_result`, when present.

What the dashboard does:

- A running subagent is a small card under its session (or fork) node.
- It is **running** when its transcript file was written in the last **5 minutes** (`SUBAGENT_CACHE_WINDOW_MS` in `src/lib/status/session-status.ts`). Otherwise it is **expired**. An expired subagent is not drawn. Its session node shows a count instead.
- If its transcript is missing, it is expired.
- A subagent with no `agentId` cannot be matched to a file, so it is expired.

The 5-minute window is a display rule chosen for the dashboard. It is not documented by Claude Code. It is not the same as the prompt-cache lifetime, and it is not the 2-minute window used for active sessions.

Hook input also includes `agent_transcript_path` for `SubagentStop` (Internal, verified in 2.1.312). The dashboard does not use it.

## Hooks

Documented: hooks are configured in `settings.json` under `hooks`, one entry per event, with a list of matcher groups. Each group has a `hooks` list of `{ "type": "command", "command": "...", "timeout"?: number }`. A `matcher` is optional. `Stop` does not take a matcher. `Notification` matches on `notification_type`.

Common input fields (Documented): `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `permission_mode`, and optional `agent_id`, `agent_type`, `prompt_id`, `effort`.

Notification input (Documented; the fields and the matcher values also appear in the 2.1.312 bundle):

| Field | Status | Notes |
|---|---|---|
| `message` (string) | Documented; bundle-verified | |
| `title` (string, optional) | Documented; bundle-verified | |
| `notification_type` | Documented; bundle-verified | One of `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`, `elicitation_url_dialog`, `elicitation_complete`, `elicitation_response`, `agent_needs_input`, `agent_completed`, `quota_auto_resume_fired`, `quota_auto_resume_stale`, `quota_auto_resume_disabled`, `plugin_notification`. The bundle lists four matcher values. The docs list the full set. |

`Stop` input: the common fields, plus `stop_hook_active` (bundle-verified). `last_assistant_message` is recommended by the docs for reading the last reply. We did not confirm the full field list for `Stop` in the bundle, so the dashboard does not read it.

### What the dashboard records

`bin/claude-dashboard-hook.mjs` appends one line to `~/.claude-dashboard/events.jsonl` (or `CLAUDE_DASHBOARD_HOME/events.jsonl`) for `Notification` and `Stop`:

```json
{"ts":"2026-10-29T10:03:00.000Z","event":"Notification","sessionId":"<id>","cwd":"/path","message":"Claude needs your permission to use Bash","notificationType":"permission_prompt","title":null}
```

- `ts` is the time the hook ran.
- `cwd`, `message`, `notificationType` and `title` are `null` when the payload does not have them (or has a non-string value).

## Active sessions

`src/lib/scanner/active-detector.ts`. A session is **active** when:

1. its `.jsonl` was written in the last 2 minutes (mtime), **and**
2. a folder named after the session id exists next to the file (`projects/<project>/<session-id>/`).

Check 2 is a heuristic, not documented behaviour. It was not in the original design. **A session without that folder can never show as active.** Forks, and sessions that never used a subagent or stored a tool result, may not have the folder. We have not measured how often this happens. See the open questions.

The official `sessions/` directory would give a direct signal, but its file format was not found in the 2.1.312 bundle, so it is not used.

## Scale and what is read per request

| Read | When | Note |
|---|---|---|
| First 15 and last 15 lines | Each session, when its mtime changes | Feeds the list and most fields. Message counts come only from these lines (see Known limitations). |
| First 50 lines | Same | Session name, fork link, directory cwd. |
| Whole file, one streaming pass | Same | Output tokens and the newest `custom-title`. |
| Whole file, full detail | Map and detail pages, when the session is active or its mtime changed | Dispatches, subagent totals, open questions, total tokens. |
| Subagent file mtimes | Each map request | So a running subagent updates on the next poll. |

## Upgrade checklist (run after each Claude Code upgrade)

1. Install the new version. Start one session, rename it with `/rename`, and fork it with `--fork-session --continue`.
2. Look at the new JSONL. Confirm `cwd` is still on user records, `custom-title` is still written by `/rename`, and `forkedFrom` is still on copied records.
3. Check whether `~/.claude/sessions/` now exists and what it holds (open question below).
4. Check whether `CLAUDE_CODE_PROJECT_DIR_NAME` is still in the bundle (it was not in 2.1.312).
5. Run a Notification hook and check the payload in `events.jsonl`.
6. Update this guide, the tests in `src/lib/parsers/session-listing.test.ts` and `src/lib/scanner/session-identity.test.ts`, and the version at the top.

## Desktop app session records

The Claude desktop app writes one JSON file per session, `local_<id>.json`, under `%APPDATA%\Claude\claude-code-sessions\<account>\<org>\` on Windows. The dashboard reads three fields, read-only, and joins them to transcripts by `cliSessionId`.

| Field | Used for | Confidence |
|---|---|---|
| `cliSessionId` | Joins the record to the transcript file name | Joins 87 of 87 archived records to a transcript on Windows |
| `isArchived` | Hides the session, counted as "archived hidden" | Confirmed: 87 records are `true`, and all 87 have a transcript |
| `lineageDetached` | No parent link for a session split to the top level | Confirmed on one real split and 13 records in total. A timestamp value would also count as set |

`spawnedFrom` names the parent the app nests the session under. It is written either as a string or as an object with a `sessionId` field, and the value is the parent's app ID (`local_<id>`), which the dashboard resolves to the parent's transcript ID. The map draws a nested child under its parent, except when `lineageDetached` is set. `lastActivityAt` (epoch ms) is the app's activity time, which the map uses to order sessions. Other fields (`forkedFromSessionId`, `title`, `cwd`) are not used for links. The format is internal to the app and may change. `CLAUDE_DESKTOP_SESSIONS_DIR` overrides the folder.

## Open questions

- Desktop app "split to top level": the transcript does not change. The app's record gets `lineageDetached`. Whether other app stores also change is not checked.
- Does the active-session folder requirement hide real active sessions? Needs measuring on real data.
- Where is the `sessions/` per-process file format documented, if anywhere?
- Which `summary` writer exists? The reader is confirmed; the writer was not found in 2.1.312.
- **Archived sessions: found in the desktop app's record** (`isArchived`). The 2.1.312 CLI transcript has no archive marker. Whether the app's record format is stable is not known.

## Background task output (Windows)

Claude Code writes each background task's output to `%TEMP%\claude\<project folder>\<session ID>\tasks\<task ID>.output`. The folder name is the same as the transcript's project folder, and the session ID is the transcript's file name. A running task's file has no exit line. When the task exits, the file ends with a line like `[exited with code 0]`. The dashboard counts a task as running when its file has no exit line, is not empty, is not a subagent transcript, and was written in the last 10 minutes. A session with a running task is active. Killed or silent tasks drop out after 10 minutes. The exit line is confirmed on Linux task output. Windows output has not been confirmed yet. The transcript records nothing about background tasks.

## Stats totals: where they come from

- The Stats page reads `~/.claude/stats-cache.json` when it exists. When it does not, which is the case on some machines, every Stats number is computed from the session transcripts instead, one file at a time.
- **Total Tokens** is every token processed: input (prompt), output (answer) and reasoning. Input is new input plus cache reads plus cache writes, and the card lists them. Reasoning comes from `usage.output_tokens_details.thinking_tokens` in the transcripts, which is a part of `output_tokens`, so the card takes it out of the answer figure and the three add up to the total. `stats-cache.json` has no reasoning figure, so with that file present reasoning is counted only for sessions read from transcripts. **Estimated Cost** prices input, output (reasoning included), cache reads and cache writes at the list prices on the Settings page, so it is an API-equivalent estimate, not a subscription bill.
- **Each API call is counted once.** A call is identified by its `requestId`. Some records have none, and then the API's `message.id`, which every record of a streamed response shares, stands in. Without that, one sandbox history counted 233 records for what were 95 calls. A forked or resumed session's file can also hold its parent's earlier messages with the same IDs and usage. The session file that started first keeps a call, and later copies are removed from the later file's totals. This covers the main conversation and subagent calls, including a subagent file copied into a fork. Code: `removeDuplicateRequests` in `src/lib/parsers/stats-parser.ts`, and the request sink in `parseDetail`. On one real history, 5,563 of 55,776 requests were in more than one file, about 13% of the total.
- **The Projects tab's "Output Tokens"** uses each session's `uniqueOutputTokens`, which leaves out calls an earlier-started file already holds (`src/lib/scanner/unique-output.ts`). The Sessions list and a session's own page still show that session's full figure, copied history included, because it really contains it.
- **Subagent tokens** come from the subagent's own file when there is one, and from its progress messages in the main transcript otherwise. The file replaces the progress figures, so they are never both counted.
- A model ID missing from the pricing table is priced as Sonnet 4.
- Session files are told apart by path, not session ID. The same session ID can exist under two project folders, as when a session is resumed from another directory, and both files are read. Calls they share are counted once. The two files still count as two sessions and their messages are added up, since each file really holds them.

## Context window size

The transcript does not record a session's context window, so the session page works it out (`src/lib/parsers/context-limit.ts`, `src/lib/claude-settings/auto-compact.ts`):

0. **From the user's own auto-compact setting.** The window a user sets with `/autocompact` or in a settings file is the one they work in, so it wins. It is stored as `modelSettings.<model>.autoCompactWindow` for one model, or a top-level `autoCompactWindow` for all. Claude Code reads the project's `.claude/settings.local.json`, then the project's `.claude/settings.json`, then the user's `settings.json`, and the dashboard does the same. In a file a model's own value wins over the file's general one, and the first file with either decides. The model name is matched without case, date suffix or `[1m]`. A value outside 100,000 to 1,000,000 is ignored, as Claude Code ignores it. The panel says "window set by your autocompact setting". If the session already holds more context than the setting, it ran before the setting, and steps 1 to 3 apply instead. The files are only read.
1. **From the model of the latest reply.** The current families (Fable 5.x, Opus 5.x, Opus 4.6 to 4.8, Sonnet 5.x, Sonnet 4.6, Haiku 5.x) have 1M. Older models (Opus, Sonnet and Haiku 3 to 4.5) have 200K. A `[1m]` marker in the model name means 1M. A date suffix is ignored.
2. **From what the session actually held.** A session cannot hold more context than its window. If its peak context (new input plus cache reads plus cache writes) is above the model's window, the window is the next whole million tokens, and the panel says "window detected from usage". This covers a user who gave an older model a larger window.
3. **A 200K default** for a model name it does not recognise, which step 2 still widens when the session used more.

A window that is neither the model's default nor visible in usage, and not set in a settings file the dashboard can read, cannot be known. Managed or policy settings are not read.

## Session timeline axis

The timeline chart on the session page picks its axis from the span on screen (`timeline-scale.ts`): seconds and minutes for a short session, then hours, days, weeks, months and years as the span grows or the chart shrinks. Zooming in moves back to finer units. Ticks sit on local calendar boundaries (midnight, Monday, the 1st). A band row above the ticks names the larger unit: the day above hourly ticks, the month above day and week ticks, the year above month ticks. The midnight tick on an hourly axis is bold and says the day. Ctrl or Cmd and the wheel zoom around the pointer, up to 64 times. When zoomed in, a line under the chart says which times are on screen, and a guide follows the pointer with the exact time.
