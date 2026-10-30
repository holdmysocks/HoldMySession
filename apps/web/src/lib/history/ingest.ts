import type { SessionDetail, SessionSummary, TokenUsage } from '@/lib/parsers/types'
import type { Db } from './sqlite'
import { getMeta, inTransaction } from './history-db'
import { localDay, splitByWeight } from './day-allocation'

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
 * Writes sessions and their usage to the database, and marks stored sessions that are not in this
 * scan as no longer on disk. A session's usage rows are replaced as a whole, so scanning twice is
 * the same as scanning once. A session whose parse failed keeps the usage it already had.
 */
export function ingestSessions(db: Db, entries: IngestEntry[], now: Date = new Date()): IngestResult {
  const stamp = now.toISOString()
  const machineId = getMeta(db, 'machine_id') ?? ''
  const result: IngestResult = { added: 0, updated: 0, missing: 0 }

  const exists = db.prepare('SELECT 1 AS found FROM sessions WHERE session_key = ?')
  const upsert = db.prepare(`
    INSERT INTO sessions (session_key, session_id, project_key, project_path, project_display_name, session_name,
      started_at, last_active_at, duration_ms, message_count, tool_call_count, on_disk, first_seen_at, last_seen_at, machine_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT (session_key) DO UPDATE SET
      project_path = excluded.project_path, project_display_name = excluded.project_display_name,
      session_name = COALESCE(excluded.session_name, sessions.session_name),
      started_at = excluded.started_at, last_active_at = excluded.last_active_at, duration_ms = excluded.duration_ms,
      message_count = excluded.message_count, tool_call_count = excluded.tool_call_count,
      on_disk = 1, last_seen_at = excluded.last_seen_at
  `)
  const clearUsage = db.prepare('DELETE FROM usage_daily WHERE session_key = ?')
  const addUsage = db.prepare(`
    INSERT INTO usage_daily (session_key, day, model, input_tokens, output_tokens, thinking_tokens, cache_read_tokens, cache_write_tokens)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  inTransaction(db, () => {
    const seen = new Set<string>()
    for (const { summary, detail } of entries) {
      const key = sessionKey(summary)
      if (seen.has(key)) continue // the same session in two data sources: the first one wins
      seen.add(key)

      if (exists.get(key)) result.updated += 1
      else result.added += 1

      upsert.run(
        key,
        summary.sessionId,
        summary.projectKey,
        summary.projectPath,
        summary.projectDisplayName,
        summary.sessionName,
        summary.startedAt,
        summary.lastActiveAt || summary.startedAt,
        Math.round(summary.durationMs),
        detail ? detail.turns.length : summary.messageCount,
        detail ? Object.values(detail.toolFrequency).reduce((a, b) => a + b, 0) : summary.toolCallCount,
        stamp,
        stamp,
        machineId,
      )

      if (!detail) continue
      clearUsage.run(key)
      for (const [day, models] of usageByDay(summary, detail)) {
        for (const [model, row] of models) {
          addUsage.run(
            key, day, model,
            row.input_tokens, row.output_tokens, row.thinking_tokens, row.cache_read_tokens, row.cache_write_tokens,
          )
        }
      }
    }

    const stored = db.prepare('SELECT session_key FROM sessions WHERE on_disk = 1').all()
    const markGone = db.prepare('UPDATE sessions SET on_disk = 0 WHERE session_key = ?')
    for (const row of stored) {
      const key = String(row.session_key)
      if (!seen.has(key)) {
        markGone.run(key)
        result.missing += 1
      }
    }
  })

  return result
}
