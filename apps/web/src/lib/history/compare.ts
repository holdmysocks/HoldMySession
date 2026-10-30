import type { StatsCache } from '@/lib/parsers/types'
import { scanAllSessionsWithPaths } from '@/lib/scanner/session-scanner'
import { computeStatsFromSummaries } from '@/lib/parsers/stats-parser'
import type { Db } from './sqlite'
import { openHistoryDb } from './history-db'
import { runHistoryScan } from './scan'
import { statsFromHistory } from './history-stats'

export interface ComparisonRow {
  label: string
  live: number
  history: number
  same: boolean
}

function sum(stats: StatsCache, pick: (u: StatsCache['modelUsage'][string]) => number): number {
  return Object.values(stats.modelUsage).reduce((total, u) => total + pick(u), 0)
}

/** Totals from the live session files next to the same totals from the history database. */
export function compareStats(live: StatsCache, history: StatsCache): ComparisonRow[] {
  const rows: Array<[string, number, number]> = [
    ['Sessions', live.totalSessions, history.totalSessions],
    ['Messages', live.totalMessages, history.totalMessages],
    ['Input tokens', sum(live, (u) => u.inputTokens), sum(history, (u) => u.inputTokens)],
    ['Output tokens', sum(live, (u) => u.outputTokens), sum(history, (u) => u.outputTokens)],
    ['Reasoning tokens', sum(live, (u) => u.thinkingTokens ?? 0), sum(history, (u) => u.thinkingTokens ?? 0)],
    ['Cache read tokens', sum(live, (u) => u.cacheReadInputTokens), sum(history, (u) => u.cacheReadInputTokens)],
    ['Cache write tokens', sum(live, (u) => u.cacheCreationInputTokens), sum(history, (u) => u.cacheCreationInputTokens)],
  ]
  const models = new Set([...Object.keys(live.modelUsage), ...Object.keys(history.modelUsage)])
  for (const model of [...models].sort()) {
    const a = live.modelUsage[model]
    const b = history.modelUsage[model]
    rows.push([
      `${model} (input + output)`,
      a ? a.inputTokens + a.outputTokens : 0,
      b ? b.inputTokens + b.outputTokens : 0,
    ])
  }
  return rows.map(([label, l, h]) => ({ label, live: l, history: h, same: l === h }))
}

/** Rescans, then compares the database with a fresh read of the session files. */
export async function compareHistoryWithLive(db?: Db): Promise<ComparisonRow[] | null> {
  const own = db ?? openHistoryDb()
  try {
    await runHistoryScan(own)
    const history = statsFromHistory(own)
    const live = await computeStatsFromSummaries(await scanAllSessionsWithPaths())
    if (!history || !live) return null
    return compareStats(live, history)
  } finally {
    if (!db) own.close()
  }
}
