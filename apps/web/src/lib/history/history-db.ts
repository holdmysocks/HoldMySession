import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { openSqlite, type Db } from './sqlite'

/**
 * Where the dashboard keeps its own data. `CLAUDE_DASHBOARD_DIR` moves it, so a packaged app or a
 * copy on another machine can point anywhere. Nothing here is ever written under ~/.claude.
 */
export function dashboardDataDir(): string {
  return process.env.CLAUDE_DASHBOARD_DIR || path.join(os.homedir(), '.claude-dashboard')
}

export function historyDbPath(): string {
  return path.join(dashboardDataDir(), 'history.db')
}

/**
 * Schema changes, in order. Each entry takes a database from version N to N+1, where N is its index.
 * The version is kept in SQLite's `user_version`. Never edit an entry that has shipped: add a new one.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- One row per session. A session whose transcript has gone stays, marked on_disk = 0.
  CREATE TABLE sessions (
    session_key TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    project_key TEXT NOT NULL,
    project_path TEXT NOT NULL,
    project_display_name TEXT NOT NULL,
    session_name TEXT,
    started_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    message_count INTEGER NOT NULL DEFAULT 0,
    tool_call_count INTEGER NOT NULL DEFAULT 0,
    on_disk INTEGER NOT NULL DEFAULT 1,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    machine_id TEXT NOT NULL
  );
  CREATE INDEX sessions_project ON sessions (project_key);
  CREATE INDEX sessions_started ON sessions (started_at);

  -- Tokens per session, local day and model, after each request has been counted once across all sessions.
  CREATE TABLE usage_daily (
    session_key TEXT NOT NULL REFERENCES sessions (session_key),
    day TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    thinking_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_key, day, model)
  );
  CREATE INDEX usage_daily_day ON usage_daily (day);

  CREATE TABLE scan_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    sessions_seen INTEGER NOT NULL DEFAULT 0,
    sessions_added INTEGER NOT NULL DEFAULT 0,
    sessions_updated INTEGER NOT NULL DEFAULT 0,
    sessions_missing INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    message TEXT
  );
  `,
]

export const LATEST_SCHEMA_VERSION = MIGRATIONS.length

export function schemaVersion(db: Db): number {
  return Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0)
}

/**
 * Brings a database up to the latest schema. Each step runs in a transaction, so a failure leaves
 * the database at the last good version. A file written by a newer app is refused, not changed.
 */
export function migrate(db: Db): void {
  const version = schemaVersion(db)
  if (version > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `history.db is schema version ${version}, but this app only knows up to ${LATEST_SCHEMA_VERSION}. Update the app.`,
    )
  }
  for (let v = version; v < LATEST_SCHEMA_VERSION; v++) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[v])
      db.exec(`PRAGMA user_version = ${v + 1}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}

/** Runs `fn` in a transaction: all of it is kept, or none. */
export function inTransaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function getMeta(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key)
  return row ? String(row.value) : null
}

export function setMeta(db: Db, key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value)
}

/**
 * Opens (creating if needed) the database at `file`, with the schema up to date. An existing file
 * that needs migrating is copied to `<file>.bak-v<version>` first. Pass ':memory:' for tests.
 */
export function openHistoryDb(file: string = historyDbPath()): Db {
  const inMemory = file === ':memory:'
  if (!inMemory) fs.mkdirSync(path.dirname(file), { recursive: true })

  if (!inMemory && fs.existsSync(file)) {
    const probe = openSqlite(file)
    try {
      const version = schemaVersion(probe)
      if (version > 0 && version < LATEST_SCHEMA_VERSION) {
        probe.close()
        fs.copyFileSync(file, `${file}.bak-v${version}`)
      }
    } finally {
      try {
        probe.close()
      } catch {
        // Already closed.
      }
    }
  }

  const db = openSqlite(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db)
  if (getMeta(db, 'machine_id') === null) {
    setMeta(db, 'machine_id', randomUUID())
    setMeta(db, 'created_at', new Date().toISOString())
    setMeta(db, 'timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)
  }
  return db
}
