import { createHash } from 'node:crypto'
import type { Db } from '@/lib/history/sqlite'

const SESSION_FIELDS = [
  'session_id', 'project_key', 'project_path', 'project_display_name', 'session_name', 'started_at', 'last_active_at',
  'duration_ms', 'message_count', 'tool_call_count', 'on_disk', 'first_seen_at', 'cwd', 'project_name',
] as const

/**
 * A fingerprint of one stored session and all its usage rows. It changes exactly when something a
 * master would need to know changes, so a node can send only those sessions. `last_seen_at` is left
 * out on purpose: every scan touches it.
 */
export function sessionFingerprint(db: Db, machineId: string, sessionKey: string): string | null {
  const row = db.prepare('SELECT * FROM sessions WHERE machine_id = ? AND session_key = ?').get(machineId, sessionKey)
  if (!row) return null
  const usage = db
    .prepare(
      `SELECT day, model, input_tokens, output_tokens, thinking_tokens, cache_read_tokens, cache_write_tokens
       FROM usage_daily WHERE machine_id = ? AND session_key = ? ORDER BY day, model`,
    )
    .all(machineId, sessionKey)
    .map((u) => [u.day, u.model, u.input_tokens, u.output_tokens, u.thinking_tokens, u.cache_read_tokens, u.cache_write_tokens])
  const fields = SESSION_FIELDS.map((f) => row[f] ?? null)
  return createHash('sha256').update(JSON.stringify([fields, usage])).digest('hex')
}

/** Refreshes `sync_hash` for sessions of this machine. Pass keys to do some, or none to do all. */
export function refreshFingerprints(db: Db, machineId: string, keys?: string[]): void {
  const all = keys ?? db.prepare('SELECT session_key FROM sessions WHERE machine_id = ?').all(machineId).map((r) => String(r.session_key))
  const set = db.prepare('UPDATE sessions SET sync_hash = ? WHERE machine_id = ? AND session_key = ?')
  for (const key of all) set.run(sessionFingerprint(db, machineId, key), machineId, key)
}
