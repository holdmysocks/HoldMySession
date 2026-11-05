import { describe, it, expect } from 'vitest'
import { localDay, splitByWeight } from './day-allocation'

describe('splitByWeight', () => {
  it('splits in proportion and keeps the total exactly', () => {
    const parts = splitByWeight(10, new Map([['2026-03-01', 1], ['2026-03-02', 1], ['2026-03-03', 1]]))
    expect([...parts.values()].reduce((a, b) => a + b, 0)).toBe(10)
    expect(parts.get('2026-03-01')).toBe(4) // the leftover goes to the earliest day on a tie
  })

  it('gives the bigger share to the busier day', () => {
    const parts = splitByWeight(1000, new Map([['a', 3], ['b', 1]]))
    expect(parts.get('a')).toBe(750)
    expect(parts.get('b')).toBe(250)
  })

  it('returns nothing for no tokens or no weights', () => {
    expect(splitByWeight(0, new Map([['a', 1]])).size).toBe(0)
    expect(splitByWeight(5, new Map()).size).toBe(0)
  })
})

describe('localDay', () => {
  it('reads the local calendar day, and rejects junk', () => {
    expect(localDay(new Date(2026, 2, 5, 23, 30).toISOString())).toBe('2026-03-05')
    expect(localDay('nope')).toBeNull()
  })
})

describe('active time', async () => {
  const { activeTimeByDay, estimateActiveMs } = await import('./day-allocation')
  it('counts gaps of up to ten minutes and skips longer ones', () => {
    const m = activeTimeByDay(['2026-01-05T09:00:00Z', '2026-01-05T09:05:00Z', '2026-01-05T09:30:00Z', '2026-01-05T09:31:00Z'])
    expect([...m.values()].reduce((a, b) => a + b, 0)).toBe(6 * 60_000)
  })
  it('does not count overlapping or unordered messages twice and ignores bad times', () => {
    const m = activeTimeByDay(['2026-01-05T09:01:00Z', 'nope', '2026-01-05T09:00:00Z', '2026-01-05T09:01:00Z'])
    expect([...m.values()].reduce((a, b) => a + b, 0)).toBe(60_000)
  })
  it('estimates from the message count, never above the time open', () => {
    expect(estimateActiveMs(10_000_000, 4)).toBe(180_000)
    expect(estimateActiveMs(60_000, 100)).toBe(60_000)
  })
})
