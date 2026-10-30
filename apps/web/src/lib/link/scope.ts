import type { SessionSummary } from '@/lib/parsers/types'
import type { Db } from '@/lib/history/sqlite'
import { selfMachineId } from './machines'

/** A session from another machine, as the history database knows it: no transcript here, so no detail and no live status. */
export interface RemoteSession extends SessionSummary {
  filePath: ''
  machineId: string
  machineName: string
}

/**
 * Sessions of the machines other than this one, shaped like local sessions so the same lists and
 * totals can use them. Pass `machineId` to take one machine's only. Never active: a master only
 * hears about a session after a scan.
 */
export function remoteSessions(db: Db, machineId?: string): RemoteSession[] {
  const self = selfMachineId(db)
  const rows = db
    .prepare(
      `SELECT s.*, m.name AS machine_name,
         COALESCE((SELECT SUM(u.output_tokens) FROM usage_daily u WHERE u.machine_id = s.machine_id AND u.session_key = s.session_key), 0) AS output_tokens
       FROM sessions s JOIN machines m ON m.machine_id = s.machine_id
       WHERE s.machine_id != ?`,
    )
    .all(self)
    .filter((r) => !machineId || r.machine_id === machineId)

  return rows.map((r): RemoteSession => ({
    sessionId: String(r.session_id),
    projectPath: String(r.project_path),
    projectName: String(r.project_name || r.project_key),
    branch: null,
    cwd: r.cwd === null || r.cwd === '' ? null : String(r.cwd),
    startedAt: String(r.started_at),
    lastActiveAt: String(r.last_active_at),
    durationMs: Number(r.duration_ms),
    messageCount: Number(r.message_count),
    userMessageCount: 0,
    assistantMessageCount: 0,
    isActive: false,
    toolCallCount: Number(r.tool_call_count),
    model: null,
    version: null,
    fileSizeBytes: 0,
    outputTokens: Number(r.output_tokens),
    uniqueOutputTokens: Number(r.output_tokens),
    projectDisplayName: String(r.project_display_name),
    sessionName: r.session_name === null ? null : String(r.session_name),
    lastStopReason: null,
    projectKey: String(r.project_key),
    forkedFrom: null,
    filePath: '',
    machineId: String(r.machine_id),
    machineName: String(r.machine_name),
  }))
}

/** Whether this machine's own live sessions belong in a view of `machineId`: all machines, or this one. */
export function includesSelf(db: Db, machineId?: string): boolean {
  return !machineId || machineId === selfMachineId(db)
}
