import type { StatsCache } from '@/lib/parsers/types'
import { openHistoryDb } from './history-db'
import { runHistoryScan } from './scan'
import { statsFromHistory, type HistoryStatsOptions } from './history-stats'
import type { Db } from './sqlite'

function count(db: Db, sql: string): number {
  return Number(db.prepare(sql).get()?.n ?? 0)
}

/**
 * Stats from the history database. An empty database is filled first, and so are sessions stored
 * before the project columns existed. Otherwise this answers from what is stored: keeping it fresh
 * is the automatic scan's job (auto-scan.ts), or the Rescan button's. Null when the database cannot be used,
 * so the caller falls back to the session files.
 */
export async function loadHistoryStats(options: HistoryStatsOptions = {}): Promise<StatsCache | null> {
  try {
    const db = openHistoryDb()
    try {
      const sessions = count(db, 'SELECT COUNT(*) AS n FROM sessions')
      const needsRescan = count(db, 'SELECT COUNT(*) AS n FROM sessions WHERE cwd IS NULL') > 0
      if (sessions === 0 || needsRescan) {
        await runHistoryScan(db)
      }
      return statsFromHistory(db, options)
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}
