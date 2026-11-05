import type { SessionDetail, SessionSummary, TokenUsage } from '@/lib/parsers/types'
import type { Db } from './sqlite'
import { getMeta, inTransaction } from './history-db'
import { activeTimeByDay, localDay, splitByWeight } from './day-allocation'
import { refreshFingerprints } from '@/lib/link/sync-hash'

export interface IngestEntry {
  summary: SessionSummary
  /** The full parse, with each request counted once across all sessions. Null if the parse failed. */
  detail: SessionDetail | null
}

export interface IngestResult {
  added: number
  updated: number
  missing: number
}

export function sessionKey(summary: Pick<SessionSummary, 'projectKey' | 'sessionId'>): string {
  return `${summary.projectKey}:${summary.sessionId}`
}

const FIELDS = [
  ['input_tokens', 'inputTokens'],
  ['output_tokens', 'outputTokens'],
  ['thinking_tokens', 'thinkingTokens'],
  ['cache_read_tokens', 'cacheReadInputTokens'],
  ['cache_write_tokens', 'cacheCreationInputTokens'],
] as const

type DayRow = Record<(typeof FIELDS)[number][0], number>

/**
 * A session's tokens by day and model. Each model's total is spread over the days it replied, in
 * proportion to how many replies it gave on each day. A model with no dated reply (a subagent's)
 * goes on the day the session was last active. The totals are kept exactly.
 */
export function usageByDay(summary: SessionSummary, detail: SessionDetail): Map<string, Map<string, DayRow>> {
  const fallbackDay = localDay(summary.lastActiveAt || summary.startedAt)
  const repliesByModel = new Map<string, Map<string, number>>()
  for (const turn of detail.turns) {
    if (turn.type !== 'assistant' || !turn.model) continue
    const day = localDay(turn.timestamp)
    if (!day) continue
    const days = repliesByModel.get(turn.model) ?? new Map<string, number>()
    days.set(day, (days.get(day) ?? 0) + 1)
    repliesByModel.set(turn.model, days)
  }

  const out = new Map<string, Map<string, DayRow>>() // day -> model -> row
  const put = (day: string, model: string, column: keyof DayRow, value: number) => {
    if (value <= 0) return
    const models = out.get(day) ?? new Map<string, DayRow>()
    const row =
      models.get(model) ??
      ({ input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 } as DayRow)
    row[column] += value
    models.set(model, row)
    out.set(day, models)
  }

  for (const [model, usage] of Object.entries(detail.tokensByModel) as [string, TokenUsage][]) {
    const weights = repliesByModel.get(model) ?? (fallbackDay ? new Map([[fallbackDay, 1]]) : new Map<string, number>())
    for (const [column, field] of FIELDS) {
      const total = usage[field] ?? 0
      for (const [day, part] of splitByWeight(total, weights)) put(day, model, column, part)
    }
  }
  return out
}

/**
 * A session's messages and tool calls by local day, from the time of each message. The counts are the
 * session's own totals, so they add up exactly. When no message carries a usable time, everything goes
 * on the day the session was last active.
 */
export function activityByDay(
  summary: SessionSummary,
  detail: SessionDetail,
  totals: { messages: number; toolCalls: number },
): Map<string, { messages: number; tool_calls: number }> {
  const fallbackDay = localDay(summary.lastActiveAt || summary.startedAt)
  const messageWeights = new Map<string, number>()
  const toolWeights = new Map<string, number>()
  for (const turn of detail.turns) {
    const day = localDay(turn.timestamp)
    if (!day) continue
    messageWeights.set(day, (messageWeights.get(day) ?? 0) + 1)
    if (turn.toolCalls.length > 0) toolWeights.set(day, (toolWeights.get(day) ?? 0) + turn.toolCalls.length)
  }
  const out = new Map<string, { messages: number; tool_calls: number }>()
  const put = (day: string, key: 'messages' | 'tool_calls', n: number) => {
    const row = out.get(day) ?? { messages: 0, tool_calls: 0 }
    row[key] += n
    out.set(day, row)
  }
  const spread = (total: number, weights: Map<string, number>, key: 'messages' | 'tool_calls') => {
    if (total <= 0) return
    const use = weights.size > 0 ? weights : fallbackDay ? new Map([[fallbackDay, 1]]) : new Map<string, number>()
    for (const [day, n] of splitByWeight(total, use)) put(day, key, n)
  }
  spread(totals.messages, messageWeights, 'messages')
  spread(totals.toolCalls, toolWeights.size > 0 ? toolWeights : messageWeights, 'tool_calls')
  return out
}

/**
 * Writes sessions and their usage to the database, and marks stored sessions that are not in this
 * scan as no longer on disk. A session's usage rows are replaced as a whole, so scanning twice is
 * the same as scanning once. A session whose parse failed keeps the usage it already had.
 */
export function ingestSessions(db: Db, entries: Iterable<IngestEntry>, now: Date = new Date()): IngestResult {
  const stamp = now.toISOString()
  const machineId = getMeta(db, 'machine_id') ?? ''
  const result: IngestResult = { added: 0, updated: 0, missing: 0 }

  const exists = db.prepare('SELECT 1 AS found FROM sessions WHERE machine_id = ? AND session_key = ?')
  const upsert = db.prepare(`
    INSERT INTO sessions (machine_id, session_key, session_id, project_key, project_path, project_display_name, session_name,
      started_at, last_active_at, duration_ms, message_count, tool_call_count, on_disk, first_seen_at, last_seen_at, cwd, project_name, active_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    ON CONFLICT (machine_id, session_key) DO UPDATE SET
      project_path = excluded.project_path, project_display_name = excluded.project_display_name,
      session_name = COALESCE(excluded.session_name, sessions.session_name),
      started_at = excluded.started_at, last_active_at = excluded.last_active_at, duration_ms = excluded.duration_ms,
      message_count = excluded.message_count, tool_call_count = excluded.tool_call_count,
      on_disk = 1, last_seen_at = excluded.last_seen_at, cwd = excluded.cwd, project_name = excluded.project_name,
      active_ms = COALESCE(excluded.active_ms, sessions.active_ms)
  `)
  const clearUsage = db.prepare('DELETE FROM usage_daily WHERE machine_id = ? AND session_key = ?')
  const addUsage = db.prepare(`
    INSERT INTO usage_daily (machine_id, session_key, day, model, input_tokens, output_tokens, thinking_tokens, cache_read_tokens, cache_write_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const clearActivity = db.prepare('DELETE FROM activity_daily WHERE machine_id = ? AND session_key = ?')
  const addActivity = db.prepare('INSERT INTO activity_daily (machine_id, session_key, day, messages, tool_calls, active_ms) VALUES (?, ?, ?, ?, ?, ?)')

  inTransaction(db, () => {
    const seen = new Set<string>()
    for (const { summary, detail } of entries) {
      const key = sessionKey(summary)
      if (seen.has(key)) continue // the same session in two data sources: the first one wins
      seen.add(key)

      if (exists.get(machineId, key)) result.updated += 1
      else result.added += 1

      const messages = detail ? detail.turns.length : summary.messageCount
      const toolCalls = detail ? Object.values(detail.toolFrequency).reduce((a, b) => a + b, 0) : summary.toolCallCount
      const activeByDay = detail ? activeTimeByDay(detail.turns.map((t) => t.timestamp)) : null
      const activeTotal = activeByDay ? [...activeByDay.values()].reduce((a, b) => a + b, 0) : null
      upsert.run(
        machineId,
        key,
        summary.sessionId,
        summary.projectKey,
        summary.projectPath,
        summary.projectDisplayName,
        summary.sessionName,
        summary.startedAt,
        summary.lastActiveAt || summary.startedAt,
        Math.round(summary.durationMs),
        messages,
        toolCalls,
        stamp,
        stamp,
        summary.cwd ?? '',
        summary.projectName,
        activeTotal,
      )

      if (!detail) continue
      clearActivity.run(machineId, key)
      const rows = activityByDay(summary, detail, { messages, toolCalls })
      for (const day of activeByDay!.keys()) if (!rows.has(day)) rows.set(day, { messages: 0, tool_calls: 0 })
      for (const [day, row] of rows) {
        addActivity.run(machineId, key, day, row.messages, row.tool_calls, Math.round(activeByDay!.get(day) ?? 0))
      }
      clearUsage.run(machineId, key)
      for (const [day, models] of usageByDay(summary, detail)) {
        for (const [model, row] of models) {
          addUsage.run(
            machineId, key, day, model,
            row.input_tokens, row.output_tokens, row.thinking_tokens, row.cache_read_tokens, row.cache_write_tokens,
          )
        }
      }
    }

    const stored = db.prepare('SELECT session_key FROM sessions WHERE on_disk = 1 AND machine_id = ?').all(machineId)
    const markGone = db.prepare('UPDATE sessions SET on_disk = 0 WHERE machine_id = ? AND session_key = ?')
    for (const row of stored) {
      const key = String(row.session_key)
      if (!seen.has(key)) {
        markGone.run(machineId, key)
        result.missing += 1
      }
    }
    // A master is told about a session when its fingerprint changes.
    refreshFingerprints(db, machineId)
  })

  return result
}
