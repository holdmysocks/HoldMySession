import { splitDuration } from '@/lib/history/day-allocation'
import type { StatsCache } from '@/lib/parsers/types'

/**
 * Adds the time sessions were open to each day of file-based stats, which carry none. Each session's
 * time is spread over the days it spanned. A day with only open time gets an entry with no counts.
 * Used when the history database is not there to say it exactly.
 */
export function addOpenTime(
  stats: StatsCache,
  sessions: Array<{ startedAt: string; lastActiveAt: string; durationMs: number }>,
): StatsCache {
  const byDay = new Map<string, number>()
  for (const s of sessions) {
    for (const [day, ms] of splitDuration(s.startedAt, s.lastActiveAt || s.startedAt, s.durationMs)) {
      byDay.set(day, (byDay.get(day) ?? 0) + ms)
    }
  }
  const days = new Map(stats.dailyActivity.map((d) => [d.date, { ...d, durationMs: 0 }]))
  for (const [day, ms] of byDay) {
    const entry = days.get(day) ?? { date: day, messageCount: 0, sessionCount: 0, toolCallCount: 0, durationMs: 0 }
    entry.durationMs = ms
    days.set(day, entry)
  }
  return { ...stats, dailyActivity: [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1)) }
}
