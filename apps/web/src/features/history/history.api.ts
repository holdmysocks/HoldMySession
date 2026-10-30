import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
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
