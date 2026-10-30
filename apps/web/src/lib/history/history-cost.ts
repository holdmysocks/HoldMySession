import type { ModelPricing } from '@/features/settings/settings.types'
import { normalizeModelId } from '@/features/settings/settings.types'
import { costOfUsage, priceOnDay, type PriceEntry } from '@/lib/pricing/price-timeline'
import type { Db } from './sqlite'
import { selectSessions, type HistoryStatsOptions } from './history-stats'
import { listPriceEntries } from './price-store'

/** The model priced when a model has no row in the table, as the per-session cost does. */
const FALLBACK_MODEL_ID = 'claude-sonnet-4'

export interface HistoryCost {
  totalUSD: number
  byModel: Record<string, number>
  /** yyyy-MM to USD */
  byMonth: Record<string, number>
}

/**
 * Estimated cost of the stored usage, with every day priced at the price that applied on that day.
 * `baseTable` is the built-in table with the user's overrides. Null when sessions need a rescan.
 */
export function historyCost(
  db: Db,
  baseTable: Record<string, ModelPricing>,
  options: HistoryStatsOptions = {},
  entries: PriceEntry[] = listPriceEntries(db),
): HistoryCost | null {
  const sessions = selectSessions(db, options)
  if (!sessions || sessions.length === 0) return null
  const keys = new Set(sessions.map((s) => `${s.machine_id}\u0000${s.session_key}`))

  const byModelId = new Map<string, PriceEntry[]>()
  for (const entry of entries) byModelId.set(entry.modelId, [...(byModelId.get(entry.modelId) ?? []), entry])

  const result: HistoryCost = { totalUSD: 0, byModel: {}, byMonth: {} }
  const rows = db
    .prepare(
      `SELECT machine_id, session_key, day, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
       FROM usage_daily`,
    )
    .all()
  for (const row of rows) {
    if (!keys.has(`${row.machine_id}\u0000${row.session_key}`)) continue
    const normalized = normalizeModelId(String(row.model))
    const modelId = baseTable[normalized] ? normalized : FALLBACK_MODEL_ID
    const base = baseTable[modelId]
    if (!base) continue
    const day = String(row.day)
    const { prices } = priceOnDay(byModelId.get(modelId) ?? [], base, day)
    const cost = costOfUsage(
      {
        day, model: modelId,
        inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens),
        cacheReadTokens: Number(row.cache_read_tokens), cacheWriteTokens: Number(row.cache_write_tokens),
      },
      prices,
    )
    result.totalUSD += cost
    result.byModel[modelId] = (result.byModel[modelId] ?? 0) + cost
    const month = day.slice(0, 7)
    result.byMonth[month] = (result.byMonth[month] ?? 0) + cost
  }
  return result
}
