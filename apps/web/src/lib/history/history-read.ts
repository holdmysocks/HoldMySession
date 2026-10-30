import type { StatsCache } from '@/lib/parsers/types'
import { openHistoryDb } from './history-db'
import { runHistoryScan } from './scan'
import { statsFromHistory, type HistoryStatsOptions } from './history-stats'
import type { Db } from './sqlite'

/** How old the last scan can be before reading stats starts a new one in the background. */
const STALE_AFTER_MS = 5 * 60_000

function count(db: Db, sql: string): number {
  return Number(db.prepare(sql).get()?.n ?? 0)
}

/**
 * Stats from the history database. An empty database is filled first. If the last scan is old, a
 * fresh one starts in the background and this call answers from what is stored. Sessions stored
 * before the project columns existed are rescanned first. Null when the database cannot be used,
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
      } else {
        const last = db.prepare("SELECT finished_at FROM scan_log WHERE status = 'ok' ORDER BY id DESC LIMIT 1").get()
        const age = last?.finished_at ? Date.now() - new Date(String(last.finished_at)).getTime() : Infinity
        if (age > STALE_AFTER_MS) void runHistoryScan().catch(() => undefined)
      }
      return statsFromHistory(db, options)
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}
