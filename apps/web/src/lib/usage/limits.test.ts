import { describe, expect, it } from 'vitest'
import { FIVE_HOUR_MS, SEVEN_DAY_MS, freshest, liveWindow, mergeSnapshots, paceOf, parseRateLimits, snapshotFromStored, timeLeft } from './limits'

const NOW = Date.parse('2026-11-02T12:00:00Z')
const sec = (ms: number) => Math.round(ms / 1000)

describe('parseRateLimits', () => {
  it('reads both windows from a status line input', () => {
    const snap = parseRateLimits({ rate_limits: { five_hour: { used_percentage: 62.5, resets_at: 1800000000 }, seven_day: { used_percentage: 18, resets_at: 1800500000 } } }, new Date(NOW))
    expect(snap).toEqual({ updatedAt: new Date(NOW).toISOString(), fiveHour: { usedPercentage: 62.5, resetsAt: 1800000000 }, sevenDay: { usedPercentage: 18, resetsAt: 1800500000 } })
  })
  it('keeps a window that arrives without the other', () => {
    const snap = parseRateLimits({ rate_limits: { five_hour: { used_percentage: 5, resets_at: 1800000000 } } })
    expect(snap?.fiveHour?.usedPercentage).toBe(5)
    expect(snap?.sevenDay).toBeNull()
  })
  it('clamps the percentage to 0 to 100', () => {
    const snap = parseRateLimits({ rate_limits: { five_hour: { used_percentage: 140, resets_at: 1800000000 }, seven_day: { used_percentage: -3, resets_at: 1800000000 } } })
    expect(snap?.fiveHour?.usedPercentage).toBe(100)
    expect(snap?.sevenDay?.usedPercentage).toBe(0)
  })
  it.each([null, undefined, 'x', 5, [], {}, { rate_limits: null }, { rate_limits: {} }, { rate_limits: { five_hour: { used_percentage: 'a', resets_at: 1 } } }, { rate_limits: { five_hour: { used_percentage: 5 } } }])(
    'is null for input with no usable window: %j',
    (input) => expect(parseRateLimits(input)).toBeNull(),
  )
  it('ignores the gateway spend limit', () => {
    expect(parseRateLimits({ rate_limits: { spend_limit: { used_percentage: 60, resets_at: 1800000000 } } })).toBeNull()
  })
})

describe('liveWindow and mergeSnapshots', () => {
  const future = { usedPercentage: 40, resetsAt: sec(NOW + 3_600_000) }
  const past = { usedPercentage: 90, resetsAt: sec(NOW - 1000) }
  it('drops a window once it has reset', () => {
    expect(liveWindow(past, NOW)).toBeNull()
    expect(liveWindow(future, NOW)).toBe(future)
    expect(liveWindow(null, NOW)).toBeNull()
  })
  it('keeps the old window the new report leaves out, if it has not reset', () => {
    const previous = { updatedAt: 'a', fiveHour: future, sevenDay: future }
    const next = { updatedAt: new Date(NOW).toISOString(), fiveHour: { usedPercentage: 50, resetsAt: future.resetsAt }, sevenDay: null }
    const merged = mergeSnapshots(previous, next, NOW)
    expect(merged.fiveHour?.usedPercentage).toBe(50)
    expect(merged.sevenDay).toBe(future)
  })
  it('does not keep a window that has reset', () => {
    const merged = mergeSnapshots({ updatedAt: 'a', fiveHour: past, sevenDay: past }, { updatedAt: 'b', fiveHour: null, sevenDay: future }, NOW)
    expect(merged.fiveHour).toBeNull()
    expect(merged.sevenDay).toBe(future)
  })
  it('works with no previous snapshot', () => {
    expect(mergeSnapshots(null, { updatedAt: 'b', fiveHour: future, sevenDay: null }, NOW).fiveHour).toBe(future)
  })
})

describe('snapshotFromStored and freshest', () => {
  it('round-trips and rejects junk', () => {
    const snap = { updatedAt: '2026-11-02T12:00:00.000Z', fiveHour: { usedPercentage: 10, resetsAt: 5 }, sevenDay: null }
    expect(snapshotFromStored(JSON.parse(JSON.stringify(snap)))).toEqual(snap)
    for (const bad of [null, 3, {}, { updatedAt: 'nope' }, { updatedAt: 5 }]) expect(snapshotFromStored(bad)).toBeNull()
  })
  it('picks the last reported', () => {
    const a = { updatedAt: '2026-11-02T10:00:00Z', fiveHour: null, sevenDay: null }
    const b = { updatedAt: '2026-11-02T11:00:00Z', fiveHour: null, sevenDay: null }
    expect(freshest(a, b)).toBe(b)
    expect(freshest(b, a)).toBe(b)
    expect(freshest(null, a)).toBe(a)
    expect(freshest(a, null)).toBe(a)
    expect(freshest(null, null)).toBeNull()
  })
})

describe('paceOf', () => {
  const at = (elapsed: number, used: number, windowMs = FIVE_HOUR_MS) => {
    const start = NOW - elapsed * windowMs
    return paceOf({ usedPercentage: used, resetsAt: sec(start + windowMs) }, windowMs, NOW)
  }
  it('says nothing early in the window', () => {
    expect(at(0.02, 10).projectedPercentage).toBeNull()
  })
  it('says nothing with nothing used', () => {
    expect(at(0.5, 0).projectedPercentage).toBeNull()
  })
  it('projects the share at the reset and finds no limit when it stays under', () => {
    const p = at(0.5, 30)
    expect(p.projectedPercentage).toBeCloseTo(60, 0)
    expect(p.hitsLimitAt).toBeNull()
  })
  it('finds when the limit is hit at the current rate', () => {
    const p = at(0.5, 80)
    expect(p.projectedPercentage).toBeCloseTo(160, 0)
    // 80% in 2.5h: 20% more takes 37.5 minutes.
    expect(p.hitsLimitAt! - NOW).toBeCloseTo(37.5 * 60_000, -3)
  })
  it('works for the week', () => {
    const p = at(0.4, 70, SEVEN_DAY_MS)
    expect(p.projectedPercentage).toBeCloseTo(175, 0)
    expect(p.hitsLimitAt).not.toBeNull()
  })
  it('clamps elapsed to the window', () => {
    expect(paceOf({ usedPercentage: 10, resetsAt: sec(NOW - 5000) }, FIVE_HOUR_MS, NOW).elapsed).toBe(1)
  })
})

describe('timeLeft', () => {
  it.each([
    [NOW + 30 * 60_000, '30m'],
    [NOW + 130 * 60_000, '2h 10m'],
    [NOW + 3 * 24 * 3_600_000 + 5 * 3_600_000, '3d 5h'],
    [NOW - 1000, '0m'],
  ])('formats %s', (reset, text) => expect(timeLeft(sec(reset), NOW)).toBe(text))
})
