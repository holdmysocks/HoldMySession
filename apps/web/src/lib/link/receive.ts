import type { Db } from '@/lib/history/sqlite'
import { LATEST_SCHEMA_VERSION, inTransaction } from '@/lib/history/history-db'
import { selfMachineId, upsertRemoteMachine } from './machines'
import { PushSchema, type PushPayload } from './protocol'

export class PushRefused extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/**
 * The master's side of a push. Validates the payload, then stores each session and its usage under
 * the node's machine id, replacing what it held for those sessions. Nothing from a node can touch
 * another machine's rows, and a node cannot claim the master's own id.
 */
export function acceptPush(db: Db, input: unknown, now: Date = new Date()): { accepted: number; name: string; nameUpdatedAt: string } {
  const parsed = PushSchema.safeParse(input)
  if (!parsed.success) throw new PushRefused('The data sent was not in the expected form.', 400)
  const payload: PushPayload = parsed.data
  const { machine } = payload

  if (machine.machineId === selfMachineId(db)) {
    throw new PushRefused('That machine has the same id as the master. Was the master\'s database copied to it?', 409)
  }
  if (machine.schemaVersion !== LATEST_SCHEMA_VERSION) {
    throw new PushRefused(
      `The master and this machine run different versions of the app (database ${LATEST_SCHEMA_VERSION} against ${machine.schemaVersion}). Update both to the same version.`,
      409,
    )
  }

  return inTransaction(db, () => {
    const named = upsertRemoteMachine(db, machine, now)
    const stamp = now.toISOString()
    const upsert = db.prepare(`
      INSERT INTO sessions (machine_id, session_key, session_id, project_key, project_path, project_display_name, session_name,
        started_at, last_active_at, duration_ms, message_count, tool_call_count, on_disk, first_seen_at, last_seen_at, cwd, project_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (machine_id, session_key) DO UPDATE SET
        session_id = excluded.session_id, project_key = excluded.project_key, project_path = excluded.project_path,
        project_display_name = excluded.project_display_name, session_name = COALESCE(excluded.session_name, sessions.session_name),
        started_at = excluded.started_at, last_active_at = excluded.last_active_at, duration_ms = excluded.duration_ms,
        message_count = excluded.message_count, tool_call_count = excluded.tool_call_count, on_disk = excluded.on_disk,
        last_seen_at = excluded.last_seen_at, cwd = excluded.cwd, project_name = excluded.project_name
    `)
    const clear = db.prepare('DELETE FROM usage_daily WHERE machine_id = ? AND session_key = ?')
    const addUsage = db.prepare(`
      INSERT INTO usage_daily (machine_id, session_key, day, model, input_tokens, output_tokens, thinking_tokens, cache_read_tokens, cache_write_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const s of payload.sessions) {
      upsert.run(
        machine.machineId, s.session_key, s.session_id, s.project_key, s.project_path, s.project_display_name, s.session_name,
        s.started_at, s.last_active_at, s.duration_ms, s.message_count, s.tool_call_count, s.on_disk, s.first_seen_at, stamp,
        s.cwd ?? '', s.project_name ?? '',
      )
      clear.run(machine.machineId, s.session_key)
      for (const u of s.usage) {
        addUsage.run(machine.machineId, s.session_key, u.day, u.model, u.input_tokens, u.output_tokens, u.thinking_tokens, u.cache_read_tokens, u.cache_write_tokens)
      }
    }
    return { accepted: payload.sessions.length, ...named }
  })
}
