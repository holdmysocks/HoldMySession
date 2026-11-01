import { describe, it, expect } from 'vitest'
import { forecastMonth } from './forecast'

const days = (from: number, to: number, usd: number) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`2026-11-${String(from + i).padStart(2, '0')}`, usd]))

describe('forecastMonth', () => {
  it('projects the month from the average of the finished days', () => {
    // 10 days done at $10, today (the 11th) has cost $4 so far. November has 30 days.
    const f = forecastMonth({ ...days(1, 10, 10), '2026-11-11': 4 }, '2026-11-11', 100)
    expect(f).toMatchObject({ month: '2026-11', daysInMonth: 30, daysDone: 10, soFarUSD: 104, projectedUSD: 300, planUSD: 100 })
  })

  it('gives no projection in the first days of a month, but still the total so far', () => {
    const f = forecastMonth({ '2026-11-01': 12, '2026-11-02': 8 }, '2026-11-03', null)
    expect(f.projectedUSD).toBeNull()
    expect(f.soFarUSD).toBe(20)
    expect(f.planUSD).toBeNull()
  })

  it('leaves out other months and treats a plan of nothing as no plan', () => {
    const f = forecastMonth({ '2026-10-31': 500, ...days(1, 4, 5) }, '2026-11-05', 0)
    expect(f.soFarUSD).toBe(20)
    expect(f.planUSD).toBeNull()
    expect(f.projectedUSD).toBe(150)
  })
})
