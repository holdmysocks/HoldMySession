import { describe, it, expect } from 'vitest'
import { openHistoryDb } from './history-db'
import { addSubscriptionPeriod, deleteSubscriptionPeriod, listSubscriptionPeriods } from './subscription-store'

describe('subscription periods', () => {
  it('stores them, lists the earliest start first, and deletes', () => {
    const db = openHistoryDb(':memory:')
    const max = addSubscriptionPeriod(db, { tier: 'max-20x', monthlyUSD: 200, startDay: '2026-10-10', note: null })
    const pro = addSubscriptionPeriod(db, { tier: 'pro', monthlyUSD: 20, startDay: '2026-09-01', note: ' first plan ' })
    expect(listSubscriptionPeriods(db).map((p) => p.tier)).toEqual(['pro', 'max-20x'])
    expect(pro.note).toBe('first plan')
    expect(deleteSubscriptionPeriod(db, max.id)).toBe(true)
    expect(deleteSubscriptionPeriod(db, max.id)).toBe(false)
  })

  it('refuses an unknown plan, a bad date and a negative price', () => {
    const db = openHistoryDb(':memory:')
    expect(() => addSubscriptionPeriod(db, { tier: 'gold', monthlyUSD: 1, startDay: '2026-10-10', note: null })).toThrow(/plan/)
    expect(() => addSubscriptionPeriod(db, { tier: 'pro', monthlyUSD: 1, startDay: '2026-13-10', note: null })).toThrow(/date/)
    expect(() => addSubscriptionPeriod(db, { tier: 'pro', monthlyUSD: -1, startDay: '2026-10-10', note: null })).toThrow(/zero or more/)
  })
})
