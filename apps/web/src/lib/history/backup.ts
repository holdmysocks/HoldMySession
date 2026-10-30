import * as fs from 'node:fs'
import * as path from 'node:path'
import { dataDir } from '@/lib/data-dir'
import type { Db } from './sqlite'
import { openSqlite } from './sqlite'
import { LATEST_SCHEMA_VERSION, historyDbPath, migrate, schemaVersion } from './history-db'

/** How many backup files are kept. The oldest are deleted when a new one is made. */
export const KEEP_BACKUPS = 10

const NAME = /^history-[A-Za-z0-9._-]+\.db$/

export interface BackupInfo {
  name: string
  sizeBytes: number
  createdAt: string
}

export function backupsDir(): string {
  return path.join(dataDir(), 'backups')
}

/** The path of a backup by name, or null if the name is not one of ours. Never builds a path from anything else. */
export function backupPath(name: string): string | null {
  return NAME.test(name) ? path.join(backupsDir(), name) : null
}

export function listBackups(): BackupInfo[] {
  let names: string[]
  try {
    names = fs.readdirSync(backupsDir()).filter((n) => NAME.test(n))
  } catch {
    return []
  }
  return names
    .map((name) => {
      const stat = fs.statSync(path.join(backupsDir(), name))
      return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() }
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.name < b.name ? 1 : -1))
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

/**
 * Writes a consistent copy of the database to the backups folder (SQLite's VACUUM INTO, which is safe
 * while the database is in use), then deletes the oldest copies beyond KEEP_BACKUPS.
 */
export function createBackup(db: Db, label: string = 'manual', now: Date = new Date()): BackupInfo {
  fs.mkdirSync(backupsDir(), { recursive: true })
  const name = `history-${stamp(now)}-${label.replace(/[^A-Za-z0-9_-]/g, '')}.db`
  const target = path.join(backupsDir(), name)
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
  for (const old of listBackups().slice(KEEP_BACKUPS)) fs.rmSync(path.join(backupsDir(), old.name), { force: true })
  const stat = fs.statSync(target)
  return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() }
}

/** Deletes one backup by name. False if there is no such backup. Only files in the backups folder can be named. */
export function deleteBackup(name: string): boolean {
  const file = backupPath(name)
  if (!file || !fs.existsSync(file)) return false
  fs.rmSync(file)
  return true
}

export interface BackupCheck {
  schemaVersion: number
  sessions: number
}

/** Throws a plain message if the file is not a history database this app can use. Opens it, never changes it. */
export function checkBackupFile(file: string): BackupCheck {
  let db: Db | null = null
  try {
    db = openSqlite(file)
    const version = schemaVersion(db)
    if (version < 1) throw new Error('This is not a HoldMySession history database.')
    if (version > LATEST_SCHEMA_VERSION) {
      throw new Error(`This backup is from a newer version of the app (schema ${version}). Update the app first.`)
    }
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => String(r.name)))
    for (const needed of ['meta', 'sessions', 'usage_daily', 'scan_log']) {
      if (!tables.has(needed)) throw new Error(`This is not a HoldMySession history database (no ${needed} table).`)
    }
    const integrity = String(db.prepare('PRAGMA integrity_check').get()?.integrity_check ?? '')
    if (integrity !== 'ok') throw new Error('The file is damaged and cannot be restored.')
    return { schemaVersion: version, sessions: Number(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()?.n ?? 0) }
  } catch (error) {
    if (error instanceof Error && /not a HoldMySession|newer version|damaged/.test(error.message)) throw error
    throw new Error('This is not a HoldMySession history database.')
  } finally {
    db?.close()
  }
}

/**
 * Replaces the history database with the file at `source`. The file is checked first, then the
 * current database is saved to the backups folder as "before-restore", so a restore can be undone.
 * The restored file is upgraded to this app's schema. Its machine id comes with it, so a database
 * copied to a new machine carries on as the same machine.
 */
export function restoreFromFile(current: Db, source: string): BackupCheck & { savedAs: BackupInfo } {
  const check = checkBackupFile(source)
  const savedAs = createBackup(current, 'before-restore')

  const target = historyDbPath()
  const staging = `${target}.restoring`
  fs.copyFileSync(source, staging)
  try {
    const staged = openSqlite(staging)
    try {
      migrate(staged)
    } finally {
      staged.close()
    }
    current.close()
    for (const suffix of ['-wal', '-shm']) fs.rmSync(target + suffix, { force: true })
    fs.renameSync(staging, target)
  } catch (error) {
    fs.rmSync(staging, { force: true })
    throw error
  }
  return { ...check, savedAs }
}
