import { addDays } from '@/lib/pricing/price-timeline'
import type { ModelUsage, StatsCache } from '@/lib/parsers/types'

export const RANGES = ['7d', '30d', '45d', '90d', '180d', '1y', 'all'] as const
export type StatsRange = (typeof RANGES)[number]

const RANGE_DAYS: Record<Exclude<StatsRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '45d': 45,
  '90d': 90,
  '180d': 180,
  '1y': 365,
}

/** The first day of the range, counting today as the last day. Null for all history. */
export function rangeStartDay(range: StatsRange, today: string): string | null {
  return range === 'all' ? null : addDays(today, -(RANGE_DAYS[range] - 1))
}


/**
 * Stats for the days from `startDay` on. Daily figures are cut exactly. The per-model token
 * breakdown only exists for all history, so each model's is scaled by its share of its own daily
 * tokens that fall in the range. The longest session stays as for all history.
 */
export function filterStatsRange(stats: StatsCache, startDay: string | null, endDay: string | null = null): StatsCache {
  if (!startDay && !endDay) return stats
  // The days from `startDay` up to, but not including, `endDay`.
  const inRangeDay = (day: string) => (!startDay || day >= startDay) && (!endDay || day < endDay)
  const dailyActivity = stats.dailyActivity.filter((d) => inRangeDay(d.date))
  const dailyModelTokens = stats.dailyModelTokens.filter((d) => inRangeDay(d.date))

  const inRange: Record<string, number> = {}
  const allTime: Record<string, number> = {}
  for (const day of stats.dailyModelTokens) {
    for (const [model, tokens] of Object.entries(day.tokensByModel)) {
      allTime[model] = (allTime[model] ?? 0) + tokens
      if (inRangeDay(day.date)) inRange[model] = (inRange[model] ?? 0) + tokens
    }
  }
  const modelUsage: ModelUsage = {}
  for (const [model, usage] of Object.entries(stats.modelUsage)) {
    const share = allTime[model] ? (inRange[model] ?? 0) / allTime[model] : 0
    if (share === 0) continue
    modelUsage[model] = {
      ...usage,
      inputTokens: usage.inputTokens * share,
      outputTokens: usage.outputTokens * share,
      cacheReadInputTokens: usage.cacheReadInputTokens * share,
      cacheCreationInputTokens: usage.cacheCreationInputTokens * share,
      thinkingTokens: usage.thinkingTokens === undefined ? undefined : usage.thinkingTokens * share,
    }
  }

  // The hours of the day follow the range when the stats carry them per day. Otherwise they stay as for all history.
  let hourCounts = stats.hourCounts
  if (stats.hourCountsByDay) {
    hourCounts = {}
    for (const [day, hours] of Object.entries(stats.hourCountsByDay)) {
      if (!inRangeDay(day)) continue
      for (const [hour, n] of Object.entries(hours)) hourCounts[hour] = (hourCounts[hour] ?? 0) + n
    }
  }

  return {
    ...stats,
    dailyActivity,
    dailyModelTokens,
    modelUsage,
    hourCounts,
    totalSessions: dailyActivity.reduce((sum, d) => sum + d.sessionCount, 0),
    totalMessages: dailyActivity.reduce((sum, d) => sum + d.messageCount, 0),
  }
}

/** Cost from `startDay` on, from a day-by-day cost. */
export function costFrom(byDay: Record<string, number>, startDay: string | null, endDay: string | null = null): number {
  let total = 0
  for (const [day, usd] of Object.entries(byDay)) if ((!startDay || day >= startDay) && (!endDay || day < endDay)) total += usd
  return total
}

/** The period of the same length that came just before the range, as [start, end), or null for all history. */
export function previousPeriod(range: StatsRange, today: string): { start: string; end: string; label: string } | null {
  const start = rangeStartDay(range, today)
  if (!start) return null
  const days = RANGE_DAYS[range as Exclude<StatsRange, 'all'>]
  const label = range === '1y' ? 'the year before' : `the ${days} days before`
  return { start: addDays(start, -days), end: start, label }
}

/** Change from `before` to `now` as a whole percent, or null when there is nothing before it to compare with. */
export function percentChange(now: number, before: number): number | null {
  if (!(before > 0) || !Number.isFinite(now)) return null
  return Math.round(((now - before) / before) * 100)
}

