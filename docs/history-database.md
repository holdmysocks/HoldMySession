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

The pages follow the scans without a refresh. The page frame checks the scan state every 10 seconds, and every 2 seconds while one is running (`useHistoryRefresh`). The History database card shows Scanning while one runs, and when a scan finishes, the stats, costs and subscription are fetched again. A scan left marked running by a crash stops counting as running after 15 minutes.

## Backup and restore

Settings, under Backup and restore, has **Back up now**, a list of backups with a Download link each, and **Restore from file…**. A backup is a consistent copy of the database made with SQLite's `VACUUM INTO`, which is safe while the dashboard is running, saved in `backups/` in the data folder. The newest 10 are kept (`src/lib/history/backup.ts`).

A restore checks the file first: it must be a SQLite database with this app's tables, pass SQLite's integrity check, and not be from a newer app. It then saves the current database as a `before-restore` backup, upgrades the uploaded file to the current schema, and swaps it in, so a restore can be undone by restoring that backup. The machine id travels with the file, so a database copied to a new machine carries on as the same machine. A restore is refused while a scan is running.

Download and restore are two small server routes, `/api/history-backup` and `/api/history-restore`. The dashboard has no login, so the restore only accepts a request that carries the `x-holdmysession` header and, if the browser names an origin, one that is this server (`request-guard.ts`), so another website open in the same browser cannot replace the history through localhost. Backup names are checked against a fixed pattern, never used to build a path.

## Planned

Build order from here. Each step is its own commit.

1. **Data folder rename (done).** Move the dashboard's own data from `~/.claude-dashboard` to `~/.holdmysession`. One function decides the folder, and the settings, map layouts, cache, hook log and history database all use it. `HOLDMYSESSION_DIR` overrides it, and the older `CLAUDE_DASHBOARD_DIR` and `CLAUDE_DASHBOARD_HOME` still work. On first start the old folder is copied across, not moved, and left in place. The hook script uses the same rule, so notifications keep working.
2. **Keys that include the machine (done).** A migration makes `machine_id` part of the keys of `sessions` and `usage_daily`, so rows from two machines can never collide. Done before anything else is stored, while there is only one machine's data.
3. **Stats read from the database (done).** See below.
4. **Dated pricing (done).** See below.
5. **Subscription history (done).** See below.
6. **Automatic scan (done).** See below.
7. **Backup and restore (done).** See below.
8. **Linked machines (done).** See below.

## Linked machines (master and node)

Two or more machines running HoldMySession can be joined so their history ends up in one place. Settings, under Linked machines, sets it up.

- **Roles.** Every install is a **node** by default and works on its own. One install is switched to **master**. A node is linked by giving it the master's address and token, and the Connect button checks both before saving them.
- **Addresses.** The master has a **Listen on the network** switch in Settings, saved as `link.listen` and applied when the server starts (`bin/cli.mjs` reads it, and `--host` still wins). On makes the server listen on every address of the computer, so a node can use the master's local-network address or its tailnet address, whichever it can reach, and different nodes can use different ones. Off listens on this computer only. The traffic is plain HTTP, so use a network you trust or a tailnet.
- **Token.** The master makes a random token the first time it becomes a master, shows it in Settings (Show, Copy, New token), and requires it as a bearer token on every request. A new token cuts off every node until it is given the new one.
- **What a node sends.** After each scan (`src/lib/history/scan.ts`) the node sends the sessions that changed since the last successful push, with their usage rows: names, projects, times and token counts, never transcripts or prompts. Every stored session has a fingerprint (`sync_hash`) of its fields and usage, and the one last sent (`synced_hash`). Only sessions whose fingerprints differ are sent, 100 to a request. The sent position only moves forward after the master answers, so a failed push is repeated next time, and a push is always made, even with nothing new, so the master knows the node is alive. **Send now** and **Send everything again** are in Settings. The last result and any error are shown there. Code: `src/lib/link/node-sync.ts`.
- **What the master does.** `/api/link/push` (`src/routes/api.link.push.ts`) checks the token, validates the payload, and stores each session and its usage under the node's machine id, replacing what it held for those sessions (`src/lib/link/receive.ts`). A node cannot write another machine's rows or claim the master's own id, and a node on a different database version is refused with a message. `/api/link/ping` lets a node check the address and token.
- **Names.** `machines` has a row for every machine, this one included. A machine's name starts as its computer name. A node can rename only itself, the master can rename any machine, and the most recent change wins, so a rename on the master reaches the node on its next push, and the other way round.
- **Prices and plan.** The master owns the dated price entries, the price overrides and the subscription. Each push reply carries them, the node stores copies, and a linked node's Price history, Subscription and API pricing cards say so and are read-only. A node that is not linked uses its own. Unlinking keeps the copies.
- **Machine filter.** A master with at least one linked node shows a Machine selector above every page (hidden otherwise, and on nodes): All machines, this machine, or a node. Stats, the cost, the Projects tab and the Sessions list follow it. Sessions of a node show a badge with its name. They have no detail page and no live status, because the master has no transcript. The Map draws live sessions, so with another machine chosen it says to open that machine's own dashboard. The choice is saved in the browser. The subscription is the account's, so it ignores the filter.
- **Removing a node.** The master can remove a node and delete its history. A node that is still linked appears again the next time it sends.
- **Limits.** The same Claude session synced between two machines is counted on both, because there is no de-duplication across machines. A node and its master must run the same database version. Live status of a node's sessions is not sent.
