# History database

The dashboard keeps its own copy of your usage in one SQLite file, `~/.holdmysession/history.db`, so the history survives `~/.claude` being cleared. Copy the file to another machine to bring the history with you. Set `HOLDMYSESSION_DIR` to keep it somewhere else. Nothing is ever written under `~/.claude`.

It uses the SQLite module built into Node 22 (`node:sqlite`), so nothing needs compiling.

## Status

Done: the database, migrations, the scan that fills it, the data folder rename (`src/lib/data-dir.ts`) and the machine in the keys. Stats, pricing history and subscription history do not read from it yet.

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

## Planned

Build order from here. Each step is its own commit.

1. **Data folder rename (done).** Move the dashboard's own data from `~/.claude-dashboard` to `~/.holdmysession`. One function decides the folder, and the settings, map layouts, cache, hook log and history database all use it. `HOLDMYSESSION_DIR` overrides it, and the older `CLAUDE_DASHBOARD_DIR` and `CLAUDE_DASHBOARD_HOME` still work. On first start the old folder is copied across, not moved, and left in place. The hook script uses the same rule, so notifications keep working.
2. **Keys that include the machine (done).** A migration makes `machine_id` part of the keys of `sessions` and `usage_daily`, so rows from two machines can never collide. Done before anything else is stored, while there is only one machine's data.
3. **Stats read from the database**, compared against today's numbers first.
4. **Dated pricing.** An append-only list of price entries per model, each either "from date D onward" or "window D1 to D2". To price a day, replay the entries in the order they were made, each painting its range over the ones before. A note can be attached to an entry.
5. **Subscription history.** Tier, monthly price and start date as dated rows (Pro $20, then Max 20x $200 from October 10 as the first test case), the savings against API cost, a monthly view, and a second number on the cost card.
6. **Automatic scan.** On or off, every 5, 10, 15, 30 min, or 1, 2, 6, 12, 24 h, run by a server-side timer so it works with no tab open.
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
