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
