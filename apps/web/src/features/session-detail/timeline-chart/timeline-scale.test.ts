import { describe, it, expect } from 'vitest'
import { buildTimeScale, formatCursorTime, formatRange, formatSpan, MIN_TICK_SPACING_PX } from './timeline-scale'

// Local times, so the tests hold in any time zone.
const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime()
const WIDTH = 800

describe('buildTimeScale: which unit fits', () => {
  const cases: Array<[string, number, number, string]> = [
    ['a 2-minute session', at(2026, 3, 3, 10, 0, 7), at(2026, 3, 3, 10, 2, 7), 'second'],
    ['a 40-minute session', at(2026, 3, 3, 10, 0), at(2026, 3, 3, 10, 40), 'minute'],
    ['a 5-hour session', at(2026, 3, 3, 10, 0), at(2026, 3, 3, 15, 0), 'hour'],
    ['a 3-day session', at(2026, 3, 3, 10, 0), at(2026, 3, 6, 10, 0), 'hour'],
    ['a 2-week session', at(2026, 3, 3), at(2026, 3, 17), 'day'],
    ['a 3-month session', at(2026, 1, 5), at(2026, 4, 5), 'week'],
    ['a 2-year span', at(2024, 3, 1), at(2026, 3, 1), 'month'],
    ['a 15-year span', at(2010, 1, 1), at(2025, 1, 1), 'year'],
  ]

  it.each(cases)('uses a unit that suits %s', (_name, start, end, unit) => {
    expect(buildTimeScale(start, end, WIDTH).unit).toBe(unit)
  })

  it('moves to a finer unit as the chart is drawn wider, which is what zooming in does', () => {
    const start = at(2026, 3, 3)
    const end = at(2026, 3, 10)
    expect(buildTimeScale(start, end, 400).unit).toBe('day')
    expect(buildTimeScale(start, end, 6400).unit).toBe('hour')
    expect(buildTimeScale(start, end, 51_200).unit).toBe('minute')
  })

  it.each(cases)('never packs ticks closer than the minimum spacing for %s', (_name, start, end) => {
    const { ticks } = buildTimeScale(start, end, WIDTH)
    const pxPerMs = WIDTH / (end - start)
    for (let i = 1; i < ticks.length; i++) {
      expect((ticks[i].ms - ticks[i - 1].ms) * pxPerMs).toBeGreaterThanOrEqual(MIN_TICK_SPACING_PX - 0.5)
    }
    expect(ticks.length).toBeGreaterThan(0)
  })
})

describe('buildTimeScale: ticks', () => {
  it('keeps every tick inside the range, in order', () => {
    const start = at(2026, 3, 3, 10, 17)
    const end = at(2026, 3, 9, 4, 3)
    const { ticks } = buildTimeScale(start, end, WIDTH)
    for (const tick of ticks) {
      expect(tick.ms).toBeGreaterThanOrEqual(start)
      expect(tick.ms).toBeLessThanOrEqual(end)
    }
    expect(ticks.map((t) => t.ms)).toEqual([...ticks.map((t) => t.ms)].sort((a, b) => a - b))
  })

  it('puts hour ticks on round hours and labels them with the time', () => {
    const { ticks } = buildTimeScale(at(2026, 3, 3, 10, 20), at(2026, 3, 3, 15, 40), WIDTH)
    expect(ticks.map((t) => t.label)).toEqual(['11:00', '12:00', '13:00', '14:00', '15:00'])
  })

  it('puts day ticks at local midnight, labelled with the weekday and date', () => {
    const { ticks } = buildTimeScale(at(2026, 3, 3, 15), at(2026, 3, 17, 9), WIDTH)
    expect(ticks[0].label).toBe('Wed 4')
    for (const tick of ticks) {
      const date = new Date(tick.ms)
      expect([date.getHours(), date.getMinutes()]).toEqual([0, 0])
    }
  })

  it('puts week ticks on Mondays', () => {
    const { ticks } = buildTimeScale(at(2026, 1, 5), at(2026, 4, 5), WIDTH)
    for (const tick of ticks) expect(new Date(tick.ms).getDay()).toBe(1)
  })

  it('puts month ticks on the 1st, and three-month ticks on January, April, July and October', () => {
    const { ticks } = buildTimeScale(at(2024, 3, 1), at(2026, 3, 1), WIDTH)
    for (const tick of ticks) {
      expect(new Date(tick.ms).getDate()).toBe(1)
      expect(new Date(tick.ms).getMonth() % 3).toBe(0)
    }
    expect(ticks.map((t) => t.label).slice(0, 4)).toEqual(['Apr', 'Jul', 'Oct', 'Jan'])
  })

  it('names the new day on the midnight tick of an hourly axis, and marks it major', () => {
    const { ticks } = buildTimeScale(at(2026, 3, 3, 6), at(2026, 3, 4, 18), 1800)
    const midnight = ticks.find((t) => new Date(t.ms).getHours() === 0)!
    expect(midnight.major).toBe(true)
    expect(midnight.label).toBe('Wed 4 Mar')
    expect(ticks.filter((t) => !t.major).every((t) => /^\d\d:\d\d$/.test(t.label))).toBe(true)
  })

  it('does not mark the first tick major just because the range starts on a boundary', () => {
    const start = at(2026, 3, 3)
    const { ticks } = buildTimeScale(start, at(2026, 3, 3, 12), WIDTH)
    expect(ticks[0].ms).toBe(start)
    expect(ticks[0].major).toBe(false)
  })

  it('is empty for an empty range or width, and never builds an unbounded list', () => {
    expect(buildTimeScale(5, 5, WIDTH).ticks).toEqual([])
    expect(buildTimeScale(10, 5, WIDTH).ticks).toEqual([])
    expect(buildTimeScale(0, 100, 0).ticks).toEqual([])
    const huge = buildTimeScale(at(1990, 1, 1), at(2026, 1, 1), 100_000_000)
    expect(huge.ticks.length).toBeLessThanOrEqual(400)
    expect(huge.bands.length).toBeLessThanOrEqual(400)
  })
})

describe('buildTimeScale: bands', () => {
  it('names the day above hourly ticks, and covers the whole range without gaps', () => {
    const start = at(2026, 3, 3, 10)
    const end = at(2026, 3, 5, 18)
    const { bands } = buildTimeScale(start, end, WIDTH)
    expect(bands.map((b) => b.label)).toEqual(['Tuesday 3 March', 'Wednesday 4 March', 'Thursday 5 March'])
    expect(bands[0].startMs).toBe(start)
    expect(bands[bands.length - 1].endMs).toBe(end)
    for (let i = 1; i < bands.length; i++) expect(bands[i].startMs).toBe(bands[i - 1].endMs)
    expect(bands[0].shortLabel).toBe('Tue 3 Mar')
  })

  it('names the month above day ticks, and the year above month ticks', () => {
    expect(buildTimeScale(at(2026, 3, 20), at(2026, 4, 10), WIDTH).bands.map((b) => b.label)).toEqual(['March 2026', 'April 2026'])
    expect(buildTimeScale(at(2024, 3, 1), at(2026, 3, 1), WIDTH).bands.map((b) => b.label)).toEqual(['2024', '2025', '2026'])
  })

  it('shows a single day band for a session inside one day', () => {
    expect(buildTimeScale(at(2026, 3, 3, 10), at(2026, 3, 3, 12), WIDTH).bands).toHaveLength(1)
  })

  it('has no band row when the ticks are already years', () => {
    expect(buildTimeScale(at(2010, 1, 1), at(2025, 1, 1), WIDTH).bands).toEqual([])
  })
})

describe('formatting', () => {
  it('gives the full time for the hover readout', () => {
    expect(formatCursorTime(at(2026, 3, 3, 14, 5, 9))).toBe('Tue 3 Mar 2026 14:05:09')
  })

  it('writes a range with the year only when it is not the current one', () => {
    const now = at(2026, 6, 1)
    expect(formatRange(at(2026, 3, 3, 10, 2), at(2026, 3, 5, 18, 20), now)).toBe('3 Mar 10:02 → 5 Mar 18:20')
    expect(formatRange(at(2025, 12, 30, 10, 2), at(2026, 1, 2, 8, 0), now)).toBe('30 Dec 2025 10:02 → 2 Jan 08:00')
  })
})

describe('formatSpan', () => {
  it('uses the unit that reads best', () => {
    expect(formatSpan(45_000)).toBe('45s')
    expect(formatSpan(5 * 60_000 + 7_000)).toBe('5m 7s')
    expect(formatSpan(3 * 3_600_000 + 20 * 60_000)).toBe('3h 20m')
    expect(formatSpan(78 * 3_600_000 + 51 * 60_000)).toBe('3d 6h')
    expect(formatSpan(49 * 24 * 3_600_000 + 4 * 3_600_000)).toBe('49d')
  })
})
