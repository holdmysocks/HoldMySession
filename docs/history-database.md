# History database

The dashboard keeps its own copy of your usage in one SQLite file, `~/.claude-dashboard/history.db`, so the history survives `~/.claude` being cleared. Copy the file to another machine to bring the history with you. Set `CLAUDE_DASHBOARD_DIR` to keep it somewhere else. Nothing is ever written under `~/.claude`.

It uses the SQLite module built into Node 22 (`node:sqlite`), so nothing needs compiling.

## Status

Step 1 and 2 of the build order are done: the database, migrations, and the scan that fills it. Stats, pricing history and subscription history do not read from it yet.

## Tables

- `meta`: the machine id, creation time and timezone.
- `sessions`: one row per session, with its name, project, times and counts. A session whose transcript has gone stays, with `on_disk = 0`.
- `usage_daily`: tokens per session, local day and model. Each request is counted once across all sessions, using the same de-duplication as Stats. A model's tokens are spread over the days it replied, in proportion to its replies that day, and the totals are exact.
- `scan_log`: one row per scan, with how many sessions were seen, added and missing, and any error.

The schema version is SQLite's `user_version`. `MIGRATIONS` in `src/lib/history/history-db.ts` takes it up one step at a time, each in a transaction. Before an existing file is migrated it is copied to `history.db.bak-v<version>`. A file from a newer app is refused and left alone.

## Scanning

`runHistoryScan` (`src/lib/history/scan.ts`) reads every session, parses it, and replaces each session's usage rows as a whole, so scanning twice gives the same totals. Only one scan runs at a time. A scan that finds no sessions at all records nothing and marks nothing missing, so a wiped Claude folder never empties the history.

Settings, under History database, shows the file, the session count, the days covered and the last scan, and has a Rescan now button.

## Planned

Stats reading from the database, dated pricing (from a date, or a window, with later changes overwriting earlier ones), subscription history, an automatic scan interval, and backup and restore.
