# History database

The dashboard keeps its own copy of your usage in one SQLite file, `~/.holdmysession/history.db`, so the history survives `~/.claude` being cleared. Copy the file to another machine to bring the history with you. Set `HOLDMYSESSION_DIR` to keep it somewhere else. Nothing is ever written under `~/.claude`.

It uses the SQLite module built into Node 22 (`node:sqlite`), so nothing needs compiling.

## Status

Done: the database, migrations, the scan that fills it, the data folder rename (`src/lib/data-dir.ts`) and the machine in the keys. Stats and the per-project overview now read from it. Pricing history and subscription history do not yet.

## Tables

- `meta`: the machine id, creation time and timezone.

Every row in `sessions` and `usage_daily` carries the `machine_id` it came from, and the machine is part of the primary key.
- `sessions`: one row per session, with its name, project, times and counts. A session whose transcript has gone stays, with `on_disk = 0`.
- `usage_daily`: tokens per session, local day and model. Each request is counted once across all sessions, using the same de-duplication as Stats. A model's tokens are spread over the days it replied, in proportion to its replies that day, and the totals are exact.
- `scan_log`: one row per scan, with how many sessions were seen, added and missing, and any error.

The schema version is SQLite's `user_version`. `MIGRATIONS` in `src/lib/history/history-db.ts` takes it up one step at a time, each in a transaction. Before an existing file is migrated it is copied to `history.db.bak-v<version>`. A file from a newer app is refused and left alone.

## Scanning

`runHistoryScan` (`src/lib/history/scan.ts`) reads every session, parses it, and replaces each session's usage rows as a whole, so scanning twice gives the same totals. Only one scan runs at a time. A scan that finds no sessions at all records nothing and marks nothing missing, so a wiped Claude folder never empties the history.

Settings, under History database, shows the file, the session count, the days covered and the last scan, and has a Rescan now button.

## Stats from the database

The overall Stats and the Overview by Project tab read from the database first, and fall back to reading the session files if it cannot be used (`src/lib/history/history-read.ts`, `history-stats.ts`). Sessions that are no longer on disk are included. If the database is empty it is filled first. Keeping it fresh is the automatic scan's job, below, or the Rescan now button's.

Two things differ from reading the files: tokens are counted on the day each reply happened, not all on the day the session was last active, and days are local days. Session, message and tool counts still go on the day the session was last active.

Migration 3 added the working folder and folder name to `sessions`, which the project grouping needs. Sessions stored before it are rescanned automatically on first use.

**Check against session files** in Settings, under History database, rescans and shows the totals from the files next to the totals from the database, row by row, for sessions, messages, every token kind and each model.

## Dated pricing

A model's base price is the built-in one with the user's override from Settings. On top of it sit dated entries in the `price_entries` table, each for one model and either **from a day onward** or **a window of days**, with an optional note. To price a day, the entries are replayed in the order they were made and the latest one covering the day wins, so a later entry overwrites an earlier one wherever they overlap (`src/lib/pricing/price-timeline.ts`). For example: $1, then $2 from day 12, then $3 from day 6 gives $1 for days 1 to 5 and $3 from day 6 on. A window changes only its own days.

Cost is worked out when read, from the stored tokens and the price in force on each day (`src/lib/history/history-cost.ts`), so a backdated entry or a deleted one changes the past immediately and nothing needs recalculating. Stats' Estimated Cost, overall and per project, uses it, and falls back to today's prices if the history cannot be used. A session's own cost on its detail page still uses today's prices. Settings has a Price history panel to see a model's price over time, add entries and delete them.

## Subscription

The plan paid for is kept as dated periods in `subscription_periods`: a plan, its price per month, and the day it starts. A period lasts until the next one starts. Settings has a Subscription card to add and delete them, which replaces the old tier picker. The `subscriptionTier` field in `settings.json` is kept only so older files still load.

`summarizeSubscription` (`src/lib/pricing/subscription.ts`) compares the cost of the plan with the cost of the same usage at API prices, from the day the first plan starts to today, using the day-by-day prices. Each day of a plan costs its monthly price divided by the days in that month, so a part month is paid for in part. Usage before the first plan is left out of both sides. API Only pays the API cost, so it saves nothing. The Subscription card shows the saving or the extra cost, with a month-by-month table, and the Stats cost card shows one line under Estimated Cost. The plan belongs to the account, so the per-project overview does not show it.

## Automatic scan

Settings, under History database, has a switch and an interval: 5, 10, 15, 30 minutes, or 1, 2, 6, 12, 24 hours. It is on every 15 minutes by default, and is saved as `autoScan` in `settings.json`. A scan runs inside the server process (`src/lib/history/auto-scan.ts`), so it works with no browser open. It looks at the clock every 30 seconds, scans when the last scan finished more than the interval ago, and reads the setting each time, so a change applies without a restart. A scan that is overdue runs at server start. `bin/cli.mjs` loads the app once after it starts listening so that happens at once. When it is switched off the history only refreshes with Rescan now, so Stats can be behind. A failed scan is recorded in the scan log and tried again after the interval.

## Planned

Build order from here. Each step is its own commit.

1. **Data folder rename (done).** Move the dashboard's own data from `~/.claude-dashboard` to `~/.holdmysession`. One function decides the folder, and the settings, map layouts, cache, hook log and history database all use it. `HOLDMYSESSION_DIR` overrides it, and the older `CLAUDE_DASHBOARD_DIR` and `CLAUDE_DASHBOARD_HOME` still work. On first start the old folder is copied across, not moved, and left in place. The hook script uses the same rule, so notifications keep working.
2. **Keys that include the machine (done).** A migration makes `machine_id` part of the keys of `sessions` and `usage_daily`, so rows from two machines can never collide. Done before anything else is stored, while there is only one machine's data.
3. **Stats read from the database (done).** See below.
4. **Dated pricing (done).** See below.
5. **Subscription history (done).** See below.
6. **Automatic scan (done).** See below.
7. **Backup and restore** of the database from Settings.
8. **Linked machines**, below.

## Linked machines (master and node)

Two or more machines running HoldMySession can be joined so their history ends up in one place.

- **Roles.** Every install is a **node** by default, with no master set, and works on its own exactly as now. In Settings one install can be set as **master**. A node is linked by giving it the master's address and a token.
- **What a node sends.** After each scan it pushes the sessions and usage rows that changed since the last successful push. It sends names, project names, times and token counts. It never sends transcripts or prompt text. Pushes are idempotent (a session's rows are replaced as a whole), so a retry is always safe. The position only moves forward after the master confirms, so a node that was offline catches up on its own, and a node whose database is lost can resend everything.
- **What the master does.** It accepts pushes at an authenticated endpoint, stores them under the node's machine id, and also scans its own files like any install. Stats on the master gain a Machine filter: all, or one machine. The Settings page lists linked nodes with their name, last seen, sessions and status, and lets you remove one, keeping or deleting its data. Rows are never merged across machines, so one machine's data cannot overwrite another's.
- **Pricing and subscription.** Price entries and the subscription are facts about the account, not the machine, so the master holds them and linked nodes read them from it. A node with no master uses its own. To be confirmed.
- **Security.** The master endpoint is off until the role is switched on, needs the token on every request, limits the size of a push, and refuses a node whose schema version differs. It needs the server to listen beyond localhost, so there is a bind address setting, localhost by default. Plain HTTP on a trusted network is the first version. A VPN such as Tailscale, or TLS, should come before using it over the internet.
- **Clocks.** The master stamps pushes with its own receive time, so a node with a wrong clock cannot put data into the future.
- **Limits.** The same Claude session synced between two machines (for example through a shared folder) would be counted on both. There is no de-duplication across machines in the first version.
- **Switching role.** Setting a node as master keeps its data and starts accepting pushes. Setting a master back to a node stops accepting them and keeps what it has.
