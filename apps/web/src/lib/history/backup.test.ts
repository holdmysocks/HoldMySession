import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { openHistoryDb, historyDbPath, migrate, schemaVersion, LATEST_SCHEMA_VERSION, getMeta } from './history-db'
import { openSqlite } from './sqlite'
import { KEEP_BACKUPS, backupPath, backupsDir, checkBackupFile, createBackup, deleteBackup, listBackups, restoreFromFile } from './backup'

describe('backup and restore', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'))
    vi.stubEnv('HOLDMYSESSION_DIR', dir)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const addSession = (db: ReturnType<typeof openHistoryDb>, id: string) =>
    db
      .prepare(
        `INSERT INTO sessions (machine_id, session_key, session_id, project_key, project_path, project_display_name, started_at,
           last_active_at, first_seen_at, last_seen_at, cwd, project_name) VALUES ('m', ?, ?, 'p', '/p', 'P', 'a', 'b', 'x', 'y', '/p', 'p')`,
      )
      .run(id, id)
  const count = (db: ReturnType<typeof openHistoryDb>) => Number(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n)

  it('makes a consistent copy that opens on its own with the same data', () => {
    const db = openHistoryDb()
    addSession(db, 'a')
    const info = createBackup(db)
    expect(info.name).toMatch(/^history-.*-manual\.db$/)
    expect(listBackups().map((b) => b.name)).toEqual([info.name])
    const copy = openSqlite(path.join(backupsDir(), info.name))
    expect(count(copy as never)).toBe(1)
    copy.close()
    db.close()
  })

  it('keeps only the newest backups', () => {
    const db = openHistoryDb()
    for (let i = 0; i < KEEP_BACKUPS + 3; i++) createBackup(db, 'manual', new Date(2026, 0, 1, 0, 0, i))
    expect(listBackups()).toHaveLength(KEEP_BACKUPS)
    db.close()
  })

  it('deletes a backup by name, and nothing else', () => {
    const db = openHistoryDb()
    const info = createBackup(db)
    fs.writeFileSync(path.join(dir, 'settings.json'), '{}')
    expect(deleteBackup('../settings.json')).toBe(false)
    expect(fs.existsSync(path.join(dir, 'settings.json'))).toBe(true)
    expect(deleteBackup(info.name)).toBe(true)
    expect(deleteBackup(info.name)).toBe(false)
    expect(listBackups()).toHaveLength(0)
    db.close()
  })

  it('only names files in the backups folder', () => {
    expect(backupPath('history-2026-01-01_00-00-00-manual.db')).toBe(path.join(backupsDir(), 'history-2026-01-01_00-00-00-manual.db'))
    expect(backupPath('../settings.json')).toBeNull()
    expect(backupPath('history-../../x.db')).toBeNull()
    expect(backupPath('history-a/b.db')).toBeNull()
  })

  it('refuses a file that is not a history database, and one from a newer app', () => {
    const junk = path.join(dir, 'junk.db')
    fs.writeFileSync(junk, 'not a database at all')
    expect(() => checkBackupFile(junk)).toThrow(/not a HoldMySession/)

    const other = openSqlite(path.join(dir, 'other.db'))
    other.exec('CREATE TABLE t (a)')
    other.close()
    expect(() => checkBackupFile(path.join(dir, 'other.db'))).toThrow(/not a HoldMySession/)

    const newer = openSqlite(path.join(dir, 'newer.db'))
    newer.exec(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1}`)
    newer.close()
    expect(() => checkBackupFile(path.join(dir, 'newer.db'))).toThrow(/newer version/)
  })

  it('restores a backup over the current database, after saving the current one', () => {
    const db = openHistoryDb()
    addSession(db, 'old')
    const machine = getMeta(db, 'machine_id')
    const backup = createBackup(db)
    addSession(db, 'newer-than-backup')
    expect(count(db)).toBe(2)

    const result = restoreFromFile(db, path.join(backupsDir(), backup.name))
    expect(result.sessions).toBe(1)
    expect(result.savedAs.name).toMatch(/before-restore/)

    const after = openHistoryDb()
    expect(count(after)).toBe(1)
    expect(getMeta(after, 'machine_id')).toBe(machine)
    after.close()

    // The state before the restore is kept, so it can be undone.
    const saved = openSqlite(path.join(backupsDir(), result.savedAs.name))
    expect(count(saved as never)).toBe(2)
    saved.close()
  })

  it('upgrades an older backup to the current schema when restoring it', () => {
    const old = path.join(dir, 'old-backup.db')
    const v1 = openSqlite(old)
    migrate(v1, 1)
    v1.close()

    const db = openHistoryDb()
    restoreFromFile(db, old)
    const after = openSqlite(historyDbPath())
    expect(schemaVersion(after)).toBe(LATEST_SCHEMA_VERSION)
    after.close()
  })

  it('leaves the current database alone when the file is refused', () => {
    const db = openHistoryDb()
    addSession(db, 'keep')
    const junk = path.join(dir, 'junk.db')
    fs.writeFileSync(junk, 'nope')
    expect(() => restoreFromFile(db, junk)).toThrow()
    expect(count(db)).toBe(1)
    expect(listBackups()).toHaveLength(0)
    db.close()
  })
})
