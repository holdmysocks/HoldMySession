import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { openHistoryDb, schemaVersion, LATEST_SCHEMA_VERSION, getMeta, migrate } from './history-db'
import { openSqlite } from './sqlite'

describe('history database', () => {
  it('creates the schema, a machine id and the timezone on a new database', () => {
    const db = openHistoryDb(':memory:')
    expect(schemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)
    expect(getMeta(db, 'machine_id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(getMeta(db, 'timezone')).toBeTruthy()
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name)
    expect(tables).toEqual(expect.arrayContaining(['meta', 'sessions', 'usage_daily', 'scan_log']))
  })

  it('keeps its data and machine id when opened again', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hist-'))
    const file = path.join(dir, 'history.db')
    const first = openHistoryDb(file)
    const id = getMeta(first, 'machine_id')
    first.close()
    const second = openHistoryDb(file)
    expect(getMeta(second, 'machine_id')).toBe(id)
    second.close()
    fs.rmSync(dir, { recursive: true })
  })

  it('refuses a database written by a newer version, and leaves it alone', () => {
    const db = openSqlite(':memory:')
    db.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1}`)
    expect(() => migrate(db)).toThrow(/newer|Update the app/)
    expect(schemaVersion(db)).toBe(LATEST_SCHEMA_VERSION + 1)
  })
})

describe('migration 2: the machine is part of the key', () => {
  it('keeps existing rows, gives the usage rows their machine, and lets two machines share a session key', () => {
    const db = openSqlite(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
    migrate(db, 1)
    db.prepare(
      `INSERT INTO sessions VALUES ('k', 's', 'p', '/p', 'P', 'name', 'a', 'b', 1, 2, 3, 1, 'x', 'y', 'machine-1')`,
    ).run()
    db.prepare(`INSERT INTO usage_daily VALUES ('k', '2026-03-01', 'm', 1, 2, 3, 4, 5)`).run()

    migrate(db)
    expect(schemaVersion(db)).toBe(LATEST_SCHEMA_VERSION)
    expect(db.prepare('SELECT machine_id, session_name FROM sessions').get()).toMatchObject({ machine_id: 'machine-1', session_name: 'name' })
    expect(db.prepare('SELECT machine_id, output_tokens FROM usage_daily').get()).toMatchObject({ machine_id: 'machine-1', output_tokens: 2 })

    db.prepare(`INSERT INTO sessions (machine_id, session_key, session_id, project_key, project_path, project_display_name, session_name, started_at, last_active_at, duration_ms, message_count, tool_call_count, on_disk, first_seen_at, last_seen_at) VALUES ('machine-2', 'k', 's', 'p', '/p', 'P', 'other', 'a', 'b', 1, 2, 3, 1, 'x', 'y')`).run()
    expect(Number(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n)).toBe(2)
  })
})
