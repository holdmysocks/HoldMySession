import type { StatsCache } from '@/lib/parsers/types'
import { projectGroupKey } from '@/lib/projects/unlinked'
import type { Db } from './sqlite'
import { localDay, splitDuration, splitCount } from './day-allocation'

export interface HistoryStatsOptions {
  /** A project's path, or UNLINKED_PROJECT_KEY, to count only that project's sessions. */
  projectPath?: string
  /** Count only this machine's sessions. Omit for all machines. */
  machineId?: string
}

/**
 * Stats in the shape of the overall stats, built from the history database instead of the session
 * files. Sessions that are no longer on disk are included, which is the point of keeping them.
 * Null when there is nothing to show, or when sessions were stored before the project columns
 * existed and have not been rescanned yet, so the caller can fall back to the live files.
 */
export type SessionRow = Record<string, unknown>

/**
 * The stored sessions an options object selects. Null when some were stored before the project
 * columns existed (they need a rescan), and an empty list when none match.
 */
export function selectSessions(db: Db, options: HistoryStatsOptions = {}): SessionRow[] | null {
  const sessions = db
    .prepare(
      `SELECT machine_id, session_key, session_id, project_path, project_display_name, project_name, cwd,
              started_at, last_active_at, duration_ms, message_count, tool_call_count
       FROM sessions`,
    )
    .all()
    .filter((row) => !options.machineId || row.machine_id === options.machineId)

  if (sessions.some((row) => row.cwd === null)) return null

  return sessions.filter(
    (row) =>
      !options.projectPath ||
      String(row.project_path) === options.projectPath ||
      projectGroupKey({
        cwd: String(row.cwd),
        projectName: String(row.project_name ?? ''),
        projectDisplayName: String(row.project_display_name),
        projectPath: String(row.project_path),
      }) === options.projectPath,
  )
}

export function statsFromHistory(db: Db, options: HistoryStatsOptions = {}): StatsCache | null {
  const chosen = selectSessions(db, options)
  if (!chosen || chosen.length === 0) return null

  const keys = new Set(chosen.map((row) => `${row.machine_id}\u0000${row.session_key}`))

  const activity = new Map<string, { messageCount: number; sessionCount: number; toolCallCount: number; durationMs: number }>()
  const hourCounts: Record<string, number> = {}
  const hourCountsByDay: Record<string, Record<string, number>> = {}
  let totalMessages = 0
  let firstSessionDate: string | null = null
  let longest = { sessionId: '', duration: 0, messageCount: 0, timestamp: '' }

  // Messages and tool calls per day, exact for sessions the scanner has read since activity_daily was added.
  const exact = new Map<string, Array<{ day: string; messages: number; tool_calls: number }>>()
  for (const r of db.prepare('SELECT machine_id, session_key, day, messages, tool_calls FROM activity_daily').all()) {
    const k = `${r.machine_id}\u0000${r.session_key}`
    if (!keys.has(k)) continue
    const list = exact.get(k) ?? []
    list.push({ day: String(r.day), messages: Number(r.messages), tool_calls: Number(r.tool_calls) })
    exact.set(k, list)
  }
  const bucket = (d: string) => {
    const a = activity.get(d) ?? { messageCount: 0, sessionCount: 0, toolCallCount: 0, durationMs: 0 }
    activity.set(d, a)
    return a
  }

  for (const row of chosen) {
    const lastActive = String(row.last_active_at || row.started_at)
    const startedIso = String(row.started_at)
    // A session counts on the day it started. Its messages and tool calls count on the days they happened.
    bucket(localDay(startedIso) ?? localDay(lastActive) ?? startedIso.split('T')[0]).sessionCount += 1
    const rows = exact.get(`${row.machine_id}\u0000${row.session_key}`)
    if (rows) {
      for (const r of rows) {
        const a = bucket(r.day)
        a.messageCount += r.messages
        a.toolCallCount += r.tool_calls
      }
    } else {
      // The transcript is gone, so only the totals are known. They are spread over the days the session ran.
      for (const [d, n] of splitCount(startedIso, lastActive, Number(row.message_count))) bucket(d).messageCount += n
      for (const [d, n] of splitCount(startedIso, lastActive, Number(row.tool_call_count))) bucket(d).toolCallCount += n
    }
    // The time a session was open is spread over the days it spanned, by how much of each day it covers.
    for (const [d, ms] of splitDuration(startedIso, lastActive, Number(row.duration_ms))) bucket(d).durationMs += ms
    totalMessages += Number(row.message_count)

    const started = new Date(String(row.started_at))
    if (!Number.isNaN(started.getTime())) {
      const hour = String(started.getHours())
      hourCounts[hour] = (hourCounts[hour] ?? 0) + 1
      const startDay = localDay(startedIso)
      if (startDay) {
        const hours = (hourCountsByDay[startDay] ??= {})
        hours[hour] = (hours[hour] ?? 0) + 1
      }
    }
    if (Number(row.duration_ms) > longest.duration) {
      longest = {
        sessionId: String(row.session_id),
        duration: Number(row.duration_ms),
        messageCount: Number(row.message_count),
        timestamp: lastActive,
      }
    }
    const startedAt = String(row.started_at)
    if (!firstSessionDate || startedAt < firstSessionDate) firstSessionDate = startedAt
  }

  const modelUsage: StatsCache['modelUsage'] = {}
  const dayTokens = new Map<string, Record<string, number>>()
  const usage = db
    .prepare(
      `SELECT machine_id, session_key, day, model, input_tokens, output_tokens, thinking_tokens, cache_read_tokens, cache_write_tokens
       FROM usage_daily`,
    )
    .all()
  for (const row of usage) {
    if (!keys.has(`${row.machine_id}\u0000${row.session_key}`)) continue
    const model = String(row.model)
    const total = modelUsage[model] ?? {
      inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, thinkingTokens: 0,
    }
    total.inputTokens += Number(row.input_tokens)
    total.outputTokens += Number(row.output_tokens)
    total.cacheReadInputTokens += Number(row.cache_read_tokens)
    total.cacheCreationInputTokens += Number(row.cache_write_tokens)
    total.thinkingTokens = (total.thinkingTokens ?? 0) + Number(row.thinking_tokens)
    modelUsage[model] = total

    const day = String(row.day)
    const perModel = dayTokens.get(day) ?? {}
    perModel[model] = (perModel[model] ?? 0) + Number(row.input_tokens) + Number(row.output_tokens)
    dayTokens.set(day, perModel)
  }
  // A day with sessions but no tokens still gets an entry, as the file-based stats do.
  for (const day of activity.keys()) if (!dayTokens.has(day)) dayTokens.set(day, {})

  const byDate = <T extends { date: string }>(a: T, b: T) => (a.date < b.date ? -1 : 1)
  return {
    version: 1,
    lastComputedDate: new Date().toISOString(),
    dailyActivity: [...activity].map(([date, v]) => ({ date, ...v })).sort(byDate),
    dailyModelTokens: [...dayTokens].map(([date, tokensByModel]) => ({ date, tokensByModel })).sort(byDate),
    modelUsage,
    totalSessions: chosen.length,
    totalMessages,
    longestSession: { ...longest, timestamp: longest.timestamp || new Date().toISOString() },
    firstSessionDate: firstSessionDate ?? new Date().toISOString(),
    hourCounts,
    hourCountsByDay,
  }
}
