import { describe, it, expect } from 'vitest'
import { addDays, costOfUsage, isDay, priceOnDay, priceSegments, type PriceEntry, type Prices } from './price-timeline'

const p = (n: number): Prices => ({ inputPerMTok: n, outputPerMTok: n * 5, cacheReadPerMTok: n / 10, cacheWritePerMTok: n * 1.25 })
let id = 0
const entry = (kind: 'from' | 'window', startDay: string, endDay: string | null, n: number): PriceEntry => ({
  id: ++id, modelId: 'm', kind, startDay, endDay, note: null, createdAt: '', ...p(n),
})
const d = (n: number) => `2026-03-${String(n).padStart(2, '0')}`
const input = (entries: PriceEntry[], day: number) => priceOnDay(entries, p(1), d(day)).prices.inputPerMTok

describe('priceOnDay', () => {
  it('uses the base price before any entry', () => {
    expect(input([entry('from', d(12), null, 2)], 5)).toBe(1)
  })

  it('applies a price from its day onward', () => {
    const e = [entry('from', d(12), null, 2)]
    expect(input(e, 11)).toBe(1)
    expect(input(e, 12)).toBe(2)
    expect(input(e, 30)).toBe(2)
  })

  it('lets a later backdated entry overwrite an earlier one: $1, then $2 from day 12, then $3 from day 6', () => {
    const e = [entry('from', d(12), null, 2), entry('from', d(6), null, 3)]
    expect([1, 5, 6, 11, 12, 20].map((day) => input(e, day))).toEqual([1, 1, 3, 3, 3, 3])
  })

  it('changes only the days inside a window', () => {
    const e = [entry('window', d(3), d(8), 0.5)]
    expect([2, 3, 8, 9].map((day) => input(e, day))).toEqual([1, 0.5, 0.5, 1])
  })

  it('lets a window cut into a later price and leave the rest alone', () => {
    const e = [entry('from', d(5), null, 2), entry('window', d(8), d(10), 0.5)]
    expect([4, 5, 7, 8, 10, 11].map((day) => input(e, day))).toEqual([1, 2, 2, 0.5, 0.5, 2])
  })

  it('lets an earlier-made window lose to a later from-entry that covers it', () => {
    const e = [entry('window', d(3), d(8), 0.5), entry('from', d(1), null, 9)]
    expect([3, 5, 8, 9].map((day) => input(e, day))).toEqual([9, 9, 9, 9])
  })
})

describe('priceSegments', () => {
  it('is one open run with no entries', () => {
    expect(priceSegments([], p(1))).toEqual([{ fromDay: '0000-01-01', toDay: null, prices: p(1), entryId: null }])
  })

  it('lists runs of one price with their days', () => {
    const segs = priceSegments([entry('from', d(12), null, 2), entry('from', d(6), null, 3)], p(1))
    expect(segs.map((s) => [s.fromDay, s.toDay, s.prices.inputPerMTok])).toEqual([
      ['0000-01-01', d(5), 1],
      [d(6), null, 3],
    ])
  })

  it('shows a window as a run that ends and returns to the price around it', () => {
    const segs = priceSegments([entry('window', d(3), d(8), 0.5)], p(1))
    expect(segs.map((s) => [s.fromDay, s.toDay, s.prices.inputPerMTok])).toEqual([
      ['0000-01-01', d(2), 1],
      [d(3), d(8), 0.5],
      [d(9), null, 1],
    ])
  })
})

describe('helpers', () => {
  it('adds days across a month end, and checks dates', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(isDay('2026-02-30')).toBe(false)
    expect(isDay('2026-3-1')).toBe(false)
    expect(isDay('2026-03-01')).toBe(true)
  })

  it('costs a row at the prices given', () => {
    const cost = costOfUsage(
      { day: d(1), model: 'm', inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 },
      p(2),
    )
    expect(cost).toBeCloseTo(2 + 10 + 0.2 + 2.5, 9)
  })
})
