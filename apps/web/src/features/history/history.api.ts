import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { AutoScanSchema } from '@/features/settings/settings.types'
import type { PriceEntry } from '@/lib/pricing/price-timeline'
import type { HistoryCost } from '@/lib/history/history-cost'
import type { SubscriptionPeriod, SubscriptionSummary } from '@/lib/pricing/subscription'

export interface HistoryStatus {
  path: string
  schemaVersion: number
  sessions: number
  sessionsNotOnDisk: number
  usageRows: number
  firstDay: string | null
  lastDay: string | null
  /** A scan is running now. A scan row left 'running' by a crash does not count after 15 minutes. */
  scanning: boolean
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
      const scanning =
        scan?.status === 'running' && Date.now() - new Date(String(scan.started_at)).getTime() < 15 * 60_000
      // The last scan that finished, so the panel can still say when it last worked while one is running.
      const done = db.prepare("SELECT * FROM scan_log WHERE status != 'running' ORDER BY id DESC LIMIT 1").get()
      return {
        path: dbPath,
        schemaVersion: schemaVersion(db),
        sessions: n('SELECT COUNT(*) AS n FROM sessions'),
        sessionsNotOnDisk: n('SELECT COUNT(*) AS n FROM sessions WHERE on_disk = 0'),
        usageRows: n('SELECT COUNT(*) AS n FROM usage_daily'),
        firstDay: (range?.first as string | null) ?? null,
        lastDay: (range?.last as string | null) ?? null,
        scanning,
        lastScan: done
          ? {
              startedAt: String(done.started_at),
              finishedAt: (done.finished_at as string | null) ?? null,
              status: String(done.status),
              sessionsSeen: Number(done.sessions_seen),
              sessionsAdded: Number(done.sessions_added),
              sessionsMissing: Number(done.sessions_missing),
              message: (done.message as string | null) ?? null,
            }
          : null,
        error: null,
      }
    } finally {
      db.close()
    }
  } catch (error) {
    return {
      path: dbPath, scanning: false, schemaVersion: 0, sessions: 0, sessionsNotOnDisk: 0, usageRows: 0, firstDay: null, lastDay: null,
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

const newEntrySchema = z.object({
  modelId: z.string().min(1),
  kind: z.enum(['from', 'window']),
  startDay: z.string(),
  endDay: z.string().nullable(),
  inputPerMTok: z.number(),
  outputPerMTok: z.number(),
  cacheReadPerMTok: z.number(),
  cacheWritePerMTok: z.number(),
  note: z.string().max(200).nullable(),
})

export const getPriceEntries = createServerFn({ method: 'GET' }).handler(async (): Promise<PriceEntry[]> => {
  const { openHistoryDb } = await import('@/lib/history/history-db')
  const { listPriceEntries } = await import('@/lib/history/price-store')
  const db = openHistoryDb()
  try {
    return listPriceEntries(db)
  } finally {
    db.close()
  }
})

export const createPriceEntry = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => newEntrySchema.parse(input))
  .handler(async ({ data }): Promise<PriceEntry> => {
    const { openHistoryDb } = await import('@/lib/history/history-db')
    const { addPriceEntry } = await import('@/lib/history/price-store')
    const db = openHistoryDb()
    try {
      return addPriceEntry(db, data)
    } finally {
      db.close()
    }
  })

export const removePriceEntry = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ id: z.number().int() }).parse(input))
  .handler(async ({ data }): Promise<boolean> => {
    const { openHistoryDb } = await import('@/lib/history/history-db')
    const { deletePriceEntry } = await import('@/lib/history/price-store')
    const db = openHistoryDb()
    try {
      return deletePriceEntry(db, data.id)
    } finally {
      db.close()
    }
  })

/** Estimated cost with each day priced as it was that day. Null if the history cannot be used yet. */
export const getHistoryCost = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => z.object({ projectPath: z.string().optional() }).parse(input))
  .handler(async ({ data }): Promise<HistoryCost | null> => {
    const { openHistoryDb } = await import('@/lib/history/history-db')
    const { historyCost } = await import('@/lib/history/history-cost')
    const { getSettings } = await import('@/features/settings/settings.api')
    const { getMergedPricing } = await import('@/features/cost-estimation/cost-calculator')
    const db = openHistoryDb()
    try {
      return historyCost(db, getMergedPricing(await getSettings()), { projectPath: data.projectPath })
    } finally {
      db.close()
    }
  })

export interface SubscriptionData {
  periods: SubscriptionPeriod[]
  summary: SubscriptionSummary
}

export const getSubscription = createServerFn({ method: 'GET' }).handler(async (): Promise<SubscriptionData> => {
  const { openHistoryDb } = await import('@/lib/history/history-db')
  const { historyCost } = await import('@/lib/history/history-cost')
  const { listSubscriptionPeriods } = await import('@/lib/history/subscription-store')
  const { summarizeSubscription } = await import('@/lib/pricing/subscription')
  const { localDay } = await import('@/lib/history/day-allocation')
  const { getSettings } = await import('@/features/settings/settings.api')
  const { getMergedPricing } = await import('@/features/cost-estimation/cost-calculator')
  const db = openHistoryDb()
  try {
    const periods = listSubscriptionPeriods(db)
    const cost = historyCost(db, getMergedPricing(await getSettings()))
    const today = localDay(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)
    return { periods, summary: summarizeSubscription(periods, cost?.byDay ?? {}, today) }
  } finally {
    db.close()
  }
})

const newPeriodSchema = z.object({
  tier: z.string().min(1),
  monthlyUSD: z.number(),
  startDay: z.string(),
  note: z.string().max(200).nullable(),
})

export const createSubscriptionPeriod = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => newPeriodSchema.parse(input))
  .handler(async ({ data }): Promise<SubscriptionPeriod> => {
    const { openHistoryDb } = await import('@/lib/history/history-db')
    const { addSubscriptionPeriod } = await import('@/lib/history/subscription-store')
    const db = openHistoryDb()
    try {
      return addSubscriptionPeriod(db, data)
    } finally {
      db.close()
    }
  })

export const removeSubscriptionPeriod = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ id: z.number().int() }).parse(input))
  .handler(async ({ data }): Promise<boolean> => {
    const { openHistoryDb } = await import('@/lib/history/history-db')
    const { deleteSubscriptionPeriod } = await import('@/lib/history/subscription-store')
    const db = openHistoryDb()
    try {
      return deleteSubscriptionPeriod(db, data.id)
    } finally {
      db.close()
    }
  })

/** Turns the automatic scan on or off and sets how often it runs. Takes effect at the scheduler's next look. */
export const setAutoScan = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => AutoScanSchema.parse(input))
  .handler(async ({ data }) => {
    const { readSettingsFile, writeSettingsFile } = await import('@/lib/settings-file')
    return writeSettingsFile({ ...readSettingsFile(), autoScan: data }).autoScan
  })

export interface BackupSummary {
  name: string
  sizeBytes: number
  createdAt: string
}

export const getBackups = createServerFn({ method: 'GET' }).handler(async (): Promise<BackupSummary[]> => {
  const { listBackups } = await import('@/lib/history/backup')
  return listBackups()
})

export const backUpNow = createServerFn({ method: 'POST' }).handler(async (): Promise<BackupSummary> => {
  const { openHistoryDb } = await import('@/lib/history/history-db')
  const { createBackup } = await import('@/lib/history/backup')
  const db = openHistoryDb()
  try {
    return createBackup(db, 'manual')
  } finally {
    db.close()
  }
})

export const removeBackup = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) => z.object({ name: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }): Promise<boolean> => {
    const { deleteBackup } = await import('@/lib/history/backup')
    return deleteBackup(data.name)
  })
