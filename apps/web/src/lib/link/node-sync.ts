import type { Db } from '@/lib/history/sqlite'
import { LATEST_SCHEMA_VERSION, getMeta, setMeta } from '@/lib/history/history-db'
import type { Settings } from '@/features/settings/settings.types'
import { isLinkedNode, applyShared } from './shared'
import { selfMachineId } from './machines'
import type { PushResponse, SessionPayload } from './protocol'

/** How many sessions go in one request. */
const BATCH = 100
const TIMEOUT_MS = 30_000

export interface SyncOutcome {
  ok: boolean
  skipped: boolean
  sent: number
  message: string | null
}

/** The master's address without a trailing slash, or null if it is not an http or https address. */
export function normalizeMasterUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin + url.pathname.replace(/\/+$/, '')
  } catch {
    return null
  }
}

interface Pending {
  key: string
  hash: string
  payload: SessionPayload
}

function pendingBatch(db: Db, machineId: string): Pending[] {
  const rows = db
    .prepare(
      `SELECT * FROM sessions WHERE machine_id = ? AND sync_hash IS NOT NULL AND (synced_hash IS NULL OR synced_hash != sync_hash)
       ORDER BY session_key LIMIT ?`,
    )
    .all(machineId, BATCH)
  const usageStmt = db.prepare(
    `SELECT day, model, input_tokens, output_tokens, thinking_tokens, cache_read_tokens, cache_write_tokens
     FROM usage_daily WHERE machine_id = ? AND session_key = ? ORDER BY day, model`,
  )
  return rows.map((r) => ({
    key: String(r.session_key),
    hash: String(r.sync_hash),
    payload: {
      session_key: String(r.session_key), session_id: String(r.session_id), project_key: String(r.project_key),
      project_path: String(r.project_path), project_display_name: String(r.project_display_name),
      session_name: r.session_name === null ? null : String(r.session_name),
      started_at: String(r.started_at), last_active_at: String(r.last_active_at), duration_ms: Number(r.duration_ms),
      message_count: Number(r.message_count), tool_call_count: Number(r.tool_call_count), on_disk: Number(r.on_disk),
      first_seen_at: String(r.first_seen_at), cwd: r.cwd === null ? null : String(r.cwd),
      project_name: r.project_name === null ? null : String(r.project_name),
      usage: usageStmt.all(machineId, String(r.session_key)).map((u) => ({
        day: String(u.day), model: String(u.model), input_tokens: Number(u.input_tokens), output_tokens: Number(u.output_tokens),
        thinking_tokens: Number(u.thinking_tokens), cache_read_tokens: Number(u.cache_read_tokens), cache_write_tokens: Number(u.cache_write_tokens),
      })),
    },
  }))
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

/**
 * Sends what changed since the last successful push to the master, then takes the master's prices,
 * plans and this machine's name from the reply. A request is always made, even with nothing new, so
 * the master knows this machine is alive. The position only moves forward after the master says it
 * has a batch, so a failed push is simply tried again next time.
 */
export async function pushToMaster(
  db: Db,
  settings: Settings,
  appVersion: string | null,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<SyncOutcome> {
  if (!isLinkedNode(settings)) return { ok: true, skipped: true, sent: 0, message: null }
  const base = normalizeMasterUrl(settings.link.masterUrl)
  if (!base) return record(db, { ok: false, skipped: false, sent: 0, message: 'The master address is not a valid http or https address.' })

  const machineId = selfMachineId(db)
  const self = db.prepare('SELECT name, name_updated_at FROM machines WHERE machine_id = ?').get(machineId)!
  let sent = 0
  try {
    for (let round = 0; round < 200; round++) {
      const batch = pendingBatch(db, machineId)
      const response = await fetchImpl(`${base}/api/link/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.link.masterToken}` },
        body: JSON.stringify({
          machine: {
            machineId, name: String(self.name), nameUpdatedAt: String(self.name_updated_at), appVersion, schemaVersion: LATEST_SCHEMA_VERSION,
          },
          sessions: batch.map((b) => b.payload),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      if (!response.ok) {
        let message = `The master answered ${response.status}.`
        try {
          const body = (await response.json()) as { message?: string }
          if (body.message) message = body.message
        } catch {
          // Keep the status message.
        }
        return record(db, { ok: false, skipped: false, sent, message })
      }
      const reply = (await response.json()) as PushResponse
      const mark = db.prepare('UPDATE sessions SET synced_hash = ? WHERE machine_id = ? AND session_key = ? AND sync_hash = ?')
      for (const b of batch) mark.run(b.hash, machineId, b.key, b.hash)
      sent += batch.length

      applyShared(db, reply.shared)
      if (reply.nameUpdatedAt > String(self.name_updated_at)) {
        db.prepare('UPDATE machines SET name = ?, name_updated_at = ? WHERE machine_id = ?').run(reply.name, reply.nameUpdatedAt, machineId)
      }
      setMeta(db, 'link_master_name', reply.masterName)
      if (batch.length < BATCH) break
    }
  } catch (error) {
    const reason = error instanceof Error ? (error.name === 'TimeoutError' ? 'The master did not answer in time.' : error.message) : String(error)
    return record(db, { ok: false, skipped: false, sent, message: `Could not reach the master: ${reason}` })
  }
  return record(db, { ok: true, skipped: false, sent, message: null })
}

function record(db: Db, outcome: SyncOutcome): SyncOutcome {
  setMeta(db, 'link_last_attempt_at', new Date().toISOString())
  setMeta(db, 'link_last_error', outcome.message && !outcome.ok ? outcome.message : '')
  if (outcome.ok) setMeta(db, 'link_last_push_at', new Date().toISOString())
  return outcome
}

/** Marks every session as not yet sent, so the next push sends all of them again. */
export function resendEverything(db: Db): void {
  db.prepare('UPDATE sessions SET synced_hash = NULL WHERE machine_id = ?').run(selfMachineId(db))
}

export function linkStatus(db: Db): { lastPushAt: string | null; lastAttemptAt: string | null; lastError: string | null; masterName: string | null } {
  return {
    lastPushAt: getMeta(db, 'link_last_push_at') || null,
    lastAttemptAt: getMeta(db, 'link_last_attempt_at') || null,
    lastError: getMeta(db, 'link_last_error') || null,
    masterName: getMeta(db, 'link_master_name') || null,
  }
}

