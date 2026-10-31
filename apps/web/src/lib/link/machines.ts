import type { Db } from '@/lib/history/sqlite'
import { getMeta, inTransaction } from '@/lib/history/history-db'

export interface MachineRow {
  machineId: string
  name: string
  nameUpdatedAt: string
  isSelf: boolean
  appVersion: string | null
  schemaVersion: number | null
  firstSeenAt: string
  lastSeenAt: string
  sessions: number
}

const MAX_NAME = 60

export function cleanName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (!trimmed) throw new Error('A machine needs a name.')
  if (trimmed.length > MAX_NAME) throw new Error(`A name can be at most ${MAX_NAME} characters.`)
  return trimmed
}

export function selfMachineId(db: Db): string {
  return getMeta(db, 'machine_id') ?? ''
}

export function listMachines(db: Db): MachineRow[] {
  return db
    .prepare(
      `SELECT m.*, (SELECT COUNT(*) FROM sessions s WHERE s.machine_id = m.machine_id) AS sessions
       FROM machines m ORDER BY m.is_self DESC, m.name COLLATE NOCASE`,
    )
    .all()
    .map((r) => ({
      machineId: String(r.machine_id),
      name: String(r.name),
      nameUpdatedAt: String(r.name_updated_at),
      isSelf: Number(r.is_self) === 1,
      appVersion: r.app_version === null ? null : String(r.app_version),
      schemaVersion: r.schema_version === null ? null : Number(r.schema_version),
      firstSeenAt: String(r.first_seen_at),
      lastSeenAt: String(r.last_seen_at),
      sessions: Number(r.sessions),
    }))
}

/** Whether there is more than one machine's data here, so a machine filter has something to choose. */
export function hasOtherMachines(db: Db): boolean {
  return Number(db.prepare('SELECT COUNT(*) AS n FROM machines WHERE is_self = 0').get()?.n ?? 0) > 0
}

export function renameMachine(db: Db, machineId: string, name: string, now: Date = new Date()): void {
  const result = db
    .prepare('UPDATE machines SET name = ?, name_updated_at = ? WHERE machine_id = ?')
    .run(cleanName(name), now.toISOString(), machineId)
  if (Number(result.changes) === 0) throw new Error('No such machine.')
}

/**
 * Records a node that has just pushed: its first push adds it, and every push refreshes when it was
 * last seen. Its name is taken from the push only if the node set it later than the master's copy.
 */
export function upsertRemoteMachine(
  db: Db,
  info: { machineId: string; name: string; nameUpdatedAt: string; appVersion: string | null; schemaVersion: number },
  now: Date = new Date(),
): { name: string; nameUpdatedAt: string } {
  const stamp = now.toISOString()
  const existing = db.prepare('SELECT name, name_updated_at FROM machines WHERE machine_id = ?').get(info.machineId)
  if (!existing) {
    db.prepare(
      `INSERT INTO machines (machine_id, name, name_updated_at, is_self, app_version, schema_version, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
    ).run(info.machineId, cleanName(info.name), info.nameUpdatedAt, info.appVersion, info.schemaVersion, stamp, stamp)
    return { name: cleanName(info.name), nameUpdatedAt: info.nameUpdatedAt }
  }
  const nodeIsNewer = info.nameUpdatedAt > String(existing.name_updated_at)
  const name = nodeIsNewer ? cleanName(info.name) : String(existing.name)
  const nameUpdatedAt = nodeIsNewer ? info.nameUpdatedAt : String(existing.name_updated_at)
  db.prepare(
    'UPDATE machines SET name = ?, name_updated_at = ?, app_version = ?, schema_version = ?, last_seen_at = ? WHERE machine_id = ?',
  ).run(name, nameUpdatedAt, info.appVersion, info.schemaVersion, stamp, info.machineId)
  return { name, nameUpdatedAt }
}

/** Removes a linked machine. Its sessions and usage go too if `deleteData`, else they stay under its id. This machine cannot be removed. */
export function removeMachine(db: Db, machineId: string, deleteData: boolean): void {
  const row = db.prepare('SELECT is_self FROM machines WHERE machine_id = ?').get(machineId)
  if (!row) throw new Error('No such machine.')
  if (Number(row.is_self) === 1) throw new Error('This machine cannot be removed.')
  inTransaction(db, () => {
    if (deleteData) {
      db.prepare('DELETE FROM activity_daily WHERE machine_id = ?').run(machineId)
      db.prepare('DELETE FROM usage_daily WHERE machine_id = ?').run(machineId)
      db.prepare('DELETE FROM sessions WHERE machine_id = ?').run(machineId)
    }
    db.prepare('DELETE FROM machines WHERE machine_id = ?').run(machineId)
  })
}
