import { describe, it, expect } from 'vitest'
import { daysInMonth, periodOnDay, savingsText, summarizeSubscription, type SubscriptionPeriod } from './subscription'

let id = 0
const period = (tier: string, monthlyUSD: number, startDay: string): SubscriptionPeriod => ({
  id: ++id, tier, monthlyUSD, startDay, note: null, createdAt: '',
})
const usd = (n: number) => `$${n.toFixed(2)}`

describe('periodOnDay', () => {
  const periods = [period('pro', 20, '2026-09-01'), period('max-20x', 200, '2026-10-10')]
  it('is the plan that has started most recently', () => {
    expect(periodOnDay(periods, '2026-08-31')).toBeNull()
    expect(periodOnDay(periods, '2026-10-09')!.tier).toBe('pro')
    expect(periodOnDay(periods, '2026-10-10')!.tier).toBe('max-20x')
  })
  it('lets the later-made period win when two start the same day', () => {
    const two = [period('pro', 20, '2026-10-10'), period('max-5x', 100, '2026-10-10')]
    expect(periodOnDay(two, '2026-10-12')!.tier).toBe('max-5x')
  })
})

describe('summarizeSubscription', () => {
  it('knows the days in a month', () => {
    expect([daysInMonth('2026-02-10'), daysInMonth('2026-10-10'), daysInMonth('2028-02-01')]).toEqual([28, 31, 29])
  })

  it('pays a part month in part: Pro until Oct 9 then Ultra from Oct 10', () => {
    const periods = [period('pro', 20, '2026-10-01'), period('max-20x', 200, '2026-10-10')]
    const s = summarizeSubscription(periods, {}, '2026-10-31')
    const oct = s.months[0]
    expect(oct.days).toBe(31)
    expect(oct.paidUSD).toBeCloseTo((20 / 31) * 9 + (200 / 31) * 22, 9)
  })

  it('counts API cost only on days a plan covers, and works out the saving', () => {
    const periods = [period('pro', 31, '2026-10-30')]
    const api = { '2026-10-29': 1000, '2026-10-30': 3, '2026-10-31': 4 }
    const s = summarizeSubscription(periods, api, '2026-10-31')
    expect(s.firstDay).toBe('2026-10-30')
    expect(s.apiUSD).toBe(7) // the 29th is before the plan
    expect(s.paidUSD).toBeCloseTo(2, 9) // two days of $1
    expect(s.savedUSD).toBeCloseTo(5, 9)
  })

  it('has nothing to compare with no periods, or a plan that has not started', () => {
    expect(summarizeSubscription([], { a: 1 }, '2026-10-31').months).toEqual([])
    expect(summarizeSubscription([period('pro', 20, '2027-01-01')], {}, '2026-10-31').months).toEqual([])
  })

  it('treats pay-as-you-go as paying the API cost, so it saves nothing', () => {
    const s = summarizeSubscription([period('api', 0, '2026-10-30')], { '2026-10-30': 5 }, '2026-10-30')
    expect(s.paidUSD).toBe(5)
    expect(s.savedUSD).toBe(0)
  })
})

describe('savingsText', () => {
  const base = { firstDay: '2026-10-01', months: [{ month: '2026-10', days: 1, apiUSD: 0, paidUSD: 0 }], apiUSD: 0, paidUSD: 0, savedUSD: 0 }
  it('says saving, costing more, or the same', () => {
    expect(savingsText({ ...base, paidUSD: 20, apiUSD: 120, savedUSD: 100 }, usd)).toBe('Paid ~$20.00, saving ~$100.00')
    expect(savingsText({ ...base, paidUSD: 200, apiUSD: 150, savedUSD: -50 }, usd)).toBe('Paid ~$200.00, ~$50.00 more than API prices')
    expect(savingsText({ ...base, paidUSD: 5 }, usd)).toBe('Paid ~$5.00, same as API prices')
    expect(savingsText({ ...base, firstDay: null, months: [] }, usd)).toBeNull()
  })
})
