import type { Db } from '@/lib/history/sqlite'
import { inTransaction, getMeta, setMeta } from '@/lib/history/history-db'
import { listPriceEntries } from '@/lib/history/price-store'
import { listSubscriptionPeriods } from '@/lib/history/subscription-store'
import type { Settings } from '@/features/settings/settings.types'
import type { SharedPayload } from './protocol'

/** What a master hands to its nodes: the dated prices, the plans, and the price overrides. */
export function buildShared(db: Db, settings: Settings): SharedPayload {
  return {
    priceEntries: listPriceEntries(db),
    subscriptionPeriods: listSubscriptionPeriods(db).map((p) => ({ ...p })),
    pricingOverrides: settings.pricingOverrides,
  }
}

const OVERRIDES_KEY = 'shared_pricing_overrides'

/** On a node: makes its copies of the master's prices and plans match the master's. */
export function applyShared(db: Db, shared: SharedPayload): void {
  inTransaction(db, () => {
    db.exec('DELETE FROM price_entries')
    const addEntry = db.prepare(
      `INSERT INTO price_entries (id, model_id, kind, start_day, end_day, input_per_mtok, output_per_mtok, cache_read_per_mtok,
         cache_write_per_mtok, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const e of shared.priceEntries) {
      addEntry.run(e.id, e.modelId, e.kind, e.startDay, e.endDay, e.inputPerMTok, e.outputPerMTok, e.cacheReadPerMTok, e.cacheWritePerMTok, e.note, e.createdAt)
    }
    db.exec('DELETE FROM subscription_periods')
    const addPeriod = db.prepare('INSERT INTO subscription_periods (id, tier, monthly_usd, start_day, note, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    for (const p of shared.subscriptionPeriods) addPeriod.run(p.id, p.tier, p.monthlyUSD, p.startDay, p.note, p.createdAt)
    setMeta(db, OVERRIDES_KEY, JSON.stringify(shared.pricingOverrides))
  })
}

/**
 * The settings prices are worked out from. A node that is linked to a master uses the master's price
 * overrides, so every machine prices the same usage the same way. Anything else uses its own.
 */
export function effectiveSettings(db: Db, settings: Settings): Settings {
  if (settings.link.role !== 'node' || !settings.link.masterUrl) return settings
  const stored = getMeta(db, OVERRIDES_KEY)
  if (!stored) return settings
  try {
    return { ...settings, pricingOverrides: JSON.parse(stored) as Settings['pricingOverrides'] }
  } catch {
    return settings
  }
}

/** Whether this install takes its prices and plan from a master, so its own editors are read-only. */
export function isLinkedNode(settings: Settings): boolean {
  return settings.link.role === 'node' && settings.link.masterUrl.trim() !== '' && settings.link.masterToken !== ''
}
