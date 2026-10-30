import { createServerFn } from '@tanstack/react-start'

export interface HistoryStatus {
  path: string
  schemaVersion: number
  sessions: number
  sessionsNotOnDisk: number
  usageRows: number
  firstDay: string | null
  lastDay: string | null
  lastScan: {
    startedAt: string
    finishedAt: string | null
    status: string
    sessionsSeen: number
    sessionsAdded: number
    sessionsMissing: number
    message: string | null
  } | null
  error: string | null
}

// The server-only modules are imported inside the handlers so they stay out of the browser bundle.
export const getHistoryStatus = createServerFn({ method: 'GET' }).handler(async (): Promise<HistoryStatus> => {
  const { openHistoryDb, historyDbPath, schemaVersion } = await import('@/lib/history/history-db')
  const dbPath = historyDbPath()
  try {
    const db = openHistoryDb()
    try {
      const n = (sql: string) => Number(db.prepare(sql).get()?.n ?? 0)
      const range = db.prepare('SELECT MIN(day) AS first, MAX(day) AS last FROM usage_daily').get()
      const scan = db.prepare('SELECT * FROM scan_log ORDER BY id DESC LIMIT 1').get()
      return {
        path: dbPath,
        schemaVersion: schemaVersion(db),
        sessions: n('SELECT COUNT(*) AS n FROM sessions'),
        sessionsNotOnDisk: n('SELECT COUNT(*) AS n FROM sessions WHERE on_disk = 0'),
        usageRows: n('SELECT COUNT(*) AS n FROM usage_daily'),
        firstDay: (range?.first as string | null) ?? null,
        lastDay: (range?.last as string | null) ?? null,
        lastScan: scan
          ? {
              startedAt: String(scan.started_at),
              finishedAt: (scan.finished_at as string | null) ?? null,
              status: String(scan.status),
              sessionsSeen: Number(scan.sessions_seen),
              sessionsAdded: Number(scan.sessions_added),
              sessionsMissing: Number(scan.sessions_missing),
              message: (scan.message as string | null) ?? null,
            }
          : null,
        error: null,
      }
    } finally {
      db.close()
    }
  } catch (error) {
    return {
      path: dbPath, schemaVersion: 0, sessions: 0, sessionsNotOnDisk: 0, usageRows: 0, firstDay: null, lastDay: null,
      lastScan: null, error: error instanceof Error ? error.message : String(error),
    }
  }
})

export const checkHistory = createServerFn({ method: 'POST' }).handler(async () => {
  const { compareHistoryWithLive } = await import('@/lib/history/compare')
  return compareHistoryWithLive()
})

export const rescanHistory = createServerFn({ method: 'POST' }).handler(async () => {
  const { runHistoryScan } = await import('@/lib/history/scan')
  return runHistoryScan()
})
