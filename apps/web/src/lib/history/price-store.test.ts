import { describe, it, expect } from 'vitest'
import { openHistoryDb } from './history-db'
import { addPriceEntry, deletePriceEntry, listPriceEntries, type NewPriceEntry } from './price-store'
import { historyCost } from './history-cost'
import type { ModelPricing } from '@/features/settings/settings.types'

const base: ModelPricing = {
  modelId: 'claude-opus-5-5', displayName: 'Opus', inputPerMTok: 1, outputPerMTok: 5, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25,
}
const table = { 'claude-opus-5-5': base }
const input = (extra: Partial<NewPriceEntry> = {}): NewPriceEntry => ({
  modelId: 'claude-opus-5-5', kind: 'from', startDay: '2026-03-12', endDay: null,
  inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.2, cacheWritePerMTok: 2.5, note: null, ...extra,
})

function withUsage(db: ReturnType<typeof openHistoryDb>, days: string[]) {
  db.prepare(
    `INSERT INTO sessions (machine_id, session_key, session_id, project_key, project_path, project_display_name, started_at,
       last_active_at, first_seen_at, last_seen_at, cwd, project_name) VALUES ('m', 'k', 's', 'p', '/p', 'P', 'a', 'b', 'x', 'y', '/p', 'p')`,
  ).run()
  for (const day of days) {
    db.prepare(`INSERT INTO usage_daily VALUES ('m', 'k', ?, 'claude-opus-5-5', 1000000, 0, 0, 0, 0)`).run(day)
  }
}

describe('price entries', () => {
  it('stores, lists in the order made, and deletes', () => {
    const db = openHistoryDb(':memory:')
    const a = addPriceEntry(db, input())
    const b = addPriceEntry(db, input({ kind: 'window', startDay: '2026-03-03', endDay: '2026-03-08', note: ' sale ' }))
    expect(listPriceEntries(db).map((e) => e.id)).toEqual([a.id, b.id])
    expect(b).toMatchObject({ kind: 'window', endDay: '2026-03-08', note: 'sale' })
    expect(deletePriceEntry(db, a.id)).toBe(true)
    expect(deletePriceEntry(db, a.id)).toBe(false)
    expect(listPriceEntries(db)).toHaveLength(1)
  })

  it('refuses bad dates, a window with no end, a backwards window and negative prices', () => {
    const db = openHistoryDb(':memory:')
    expect(() => addPriceEntry(db, input({ startDay: '2026-02-30' }))).toThrow(/start date/)
    expect(() => addPriceEntry(db, input({ kind: 'window', endDay: null }))).toThrow(/end date/)
    expect(() => addPriceEntry(db, input({ kind: 'window', endDay: '2026-03-01' }))).toThrow(/before it starts/)
    expect(() => addPriceEntry(db, input({ endDay: '2026-04-01' }))).toThrow(/no end date/)
    expect(() => addPriceEntry(db, input({ inputPerMTok: -1 }))).toThrow(/zero or more/)
  })
})

describe('historyCost', () => {
  it('prices each day at the price in force that day, and follows a backdated change', () => {
    const db = openHistoryDb(':memory:')
    withUsage(db, ['2026-03-01', '2026-03-05', '2026-03-12', '2026-03-20']) // 1M input tokens each day
    expect(historyCost(db, table)!.totalUSD).toBeCloseTo(4, 9) // $1 each

    addPriceEntry(db, input({ startDay: '2026-03-12', inputPerMTok: 2 }))
    expect(historyCost(db, table)!.totalUSD).toBeCloseTo(1 + 1 + 2 + 2, 9) // only from the 12th

    addPriceEntry(db, input({ startDay: '2026-03-05', inputPerMTok: 3 })) // backdated: overwrites the $2
    expect(historyCost(db, table)!.totalUSD).toBeCloseTo(1 + 3 + 3 + 3, 9)

    addPriceEntry(db, input({ kind: 'window', startDay: '2026-03-01', endDay: '2026-03-05', inputPerMTok: 0.5 }))
    const cost = historyCost(db, table)!
    expect(cost.totalUSD).toBeCloseTo(0.5 + 0.5 + 3 + 3, 9)
    expect(cost.byMonth['2026-03']).toBeCloseTo(7, 9)
  })

  it('returns to the earlier prices when an entry is deleted', () => {
    const db = openHistoryDb(':memory:')
    withUsage(db, ['2026-03-20'])
    const e = addPriceEntry(db, input({ inputPerMTok: 9 }))
    expect(historyCost(db, table)!.totalUSD).toBeCloseTo(9, 9)
    deletePriceEntry(db, e.id)
    expect(historyCost(db, table)!.totalUSD).toBeCloseTo(1, 9)
  })
})
