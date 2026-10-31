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
 * tokens that fall in the range. Hours of the day and the longest session stay as for all history.
 */
export function filterStatsRange(stats: StatsCache, startDay: string | null): StatsCache {
  if (!startDay) return stats
  const dailyActivity = stats.dailyActivity.filter((d) => d.date >= startDay)
  const dailyModelTokens = stats.dailyModelTokens.filter((d) => d.date >= startDay)

  const inRange: Record<string, number> = {}
  const allTime: Record<string, number> = {}
  for (const day of stats.dailyModelTokens) {
    for (const [model, tokens] of Object.entries(day.tokensByModel)) {
      allTime[model] = (allTime[model] ?? 0) + tokens
      if (day.date >= startDay) inRange[model] = (inRange[model] ?? 0) + tokens
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

  return {
    ...stats,
    dailyActivity,
    dailyModelTokens,
    modelUsage,
    totalSessions: dailyActivity.reduce((sum, d) => sum + d.sessionCount, 0),
    totalMessages: dailyActivity.reduce((sum, d) => sum + d.messageCount, 0),
  }
}

/** Cost from `startDay` on, from a day-by-day cost. */
export function costFrom(byDay: Record<string, number>, startDay: string | null): number {
  let total = 0
  for (const [day, usd] of Object.entries(byDay)) if (!startDay || day >= startDay) total += usd
  return total
}

