import { scanAllSessionsWithPaths } from '@/lib/scanner/session-scanner'
import { parseDetailsDeduplicated } from '@/lib/parsers/stats-parser'
import type { Db } from './sqlite'
import { openHistoryDb } from './history-db'
import { ingestSessions } from './ingest'

export interface ScanOutcome {
  ok: boolean
  sessionsSeen: number
  added: number
  updated: number
  missing: number
  message: string | null
}

let running: Promise<ScanOutcome> | null = null

/**
 * Reads every session from the Claude folder and records it in the history database. One scan runs
 * at a time: a call made while one is running gets that scan's result. An empty scan (the Claude
 * folder is gone or unreadable) records nothing and marks nothing missing, so a wiped folder never
 * empties the history.
 */
export function runHistoryScan(db?: Db): Promise<ScanOutcome> {
  if (running) return running
  running = scanOnce(db).finally(() => {
    running = null
  })
  return running
}

async function scanOnce(existing?: Db): Promise<ScanOutcome> {
  const startedAt = new Date().toISOString()
  const db = existing ?? openHistoryDb()
  const log = db.prepare('INSERT INTO scan_log (started_at, status) VALUES (?, ?)').run(startedAt, 'running')
  const logId = Number(log.lastInsertRowid)

  let outcome: ScanOutcome
  try {
    const summaries = await scanAllSessionsWithPaths()
    if (summaries.length === 0) {
      outcome = { ok: true, sessionsSeen: 0, added: 0, updated: 0, missing: 0, message: 'No sessions found. History was left as it is.' }
    } else {
      const details = await parseDetailsDeduplicated(summaries)
      const entries = summaries.map((summary) => ({ summary, detail: details.get(summary.filePath) ?? null }))
      const failed = entries.filter((e) => e.detail === null).length
      const result = ingestSessions(db, entries)
      outcome = {
        ok: true,
        sessionsSeen: summaries.length,
        ...result,
        message: failed > 0 ? `${failed} session${failed === 1 ? '' : 's'} could not be read in full.` : null,
      }
    }
  } catch (error) {
    outcome = {
      ok: false, sessionsSeen: 0, added: 0, updated: 0, missing: 0,
      message: error instanceof Error ? error.message : String(error),
    }
  }

  db.prepare(
    `UPDATE scan_log SET finished_at = ?, status = ?, sessions_seen = ?, sessions_added = ?, sessions_updated = ?,
       sessions_missing = ?, error_count = ?, message = ? WHERE id = ?`,
  ).run(
    new Date().toISOString(), outcome.ok ? 'ok' : 'error', outcome.sessionsSeen, outcome.added, outcome.updated,
    outcome.missing, outcome.ok ? 0 : 1, outcome.message, logId,
  )
  if (!existing) db.close()
  return outcome
}
