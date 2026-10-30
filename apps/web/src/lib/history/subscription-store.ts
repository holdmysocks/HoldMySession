import { SUBSCRIPTION_TIERS } from '@/features/settings/settings.types'
import { validatePeriod, type SubscriptionPeriod } from '@/lib/pricing/subscription'
import type { Db } from './sqlite'

export interface NewSubscriptionPeriod {
  tier: string
  monthlyUSD: number
  startDay: string
  note: string | null
}

function toPeriod(row: Record<string, unknown>): SubscriptionPeriod {
  return {
    id: Number(row.id),
    tier: String(row.tier),
    monthlyUSD: Number(row.monthly_usd),
    startDay: String(row.start_day),
    note: row.note === null ? null : String(row.note),
    createdAt: String(row.created_at),
  }
}

/** All periods, earliest start first. */
export function listSubscriptionPeriods(db: Db): SubscriptionPeriod[] {
  return db.prepare('SELECT * FROM subscription_periods ORDER BY start_day, id').all().map(toPeriod)
}

export function addSubscriptionPeriod(db: Db, input: NewSubscriptionPeriod, now: Date = new Date()): SubscriptionPeriod {
  validatePeriod(input, SUBSCRIPTION_TIERS.map((t) => t.id))
  const result = db
    .prepare('INSERT INTO subscription_periods (tier, monthly_usd, start_day, note, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(input.tier, input.monthlyUSD, input.startDay, input.note?.trim() || null, now.toISOString())
  return listSubscriptionPeriods(db).find((p) => p.id === Number(result.lastInsertRowid))!
}

export function deleteSubscriptionPeriod(db: Db, id: number): boolean {
  return Number(db.prepare('DELETE FROM subscription_periods WHERE id = ?').run(id).changes) > 0
}
