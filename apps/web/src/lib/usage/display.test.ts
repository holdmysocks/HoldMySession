import { describe, expect, it } from 'vitest'
import type { UsageOverview } from './overview'
import { chipOf, metersOf, paceText, resetText } from './display'
import { FIVE_HOUR_MS, SEVEN_DAY_MS, paceOf } from './limits'

const NOW = Date.parse('2026-11-02T21:10:00Z')
const sec = (ms: number) => Math.round(ms / 1000)
const statusLine = { settingsPath: '', readable: true, error: null, installed: true, stale: false, otherStatusLine: false, command: '', installedApp: false }

function overview(patch: Partial<UsageOverview> & { five?: number | null; week?: number | null }): UsageOverview {
  const five = patch.five === undefined ? null : patch.five
  const week = patch.week === undefined ? null : patch.week
  const fiveWindow = five === null ? null : { usedPercentage: five, resetsAt: sec(NOW + 2.5 * 3_600_000) }
  const weekWindow = week === null ? null : { usedPercentage: week, resetsAt: sec(NOW + 3 * 24 * 3_600_000) }
  return {
    now: NOW,
    fiveHourShown: true,
    real: {
      fiveHour: fiveWindow && { ...fiveWindow, pace: paceOf(fiveWindow, FIVE_HOUR_MS, NOW) },
      sevenDay: weekWindow && { ...weekWindow, pace: paceOf(weekWindow, SEVEN_DAY_MS, NOW) },
      updatedAt: five !== null || week !== null ? new Date(NOW).toISOString() : null,
    },
    estimate: { block: null, week: { tokens: 0, usd: 0, events: 0, percentage: null, burn: [] } },
    statusLine,
    ...patch,
  } as UsageOverview
}

describe('metersOf', () => {
  it('draws both live windows, 5-hour first', () => {
    const m = metersOf(overview({ five: 78, week: 41 }))
    expect(m.map((x) => [x.key, x.percentage, x.severity, x.estimate])).toEqual([['five', 78, 'warn', false], ['week', 41, 'ok', false]])
  })
  it('colours by 75 and 90', () => {
    expect(metersOf(overview({ five: 74, week: 90 })).map((x) => x.severity)).toEqual(['ok', 'danger'])
    expect(metersOf(overview({ five: 75 }))[0].severity).toBe('warn')
  })
  it('never draws a 5-hour meter for a plan that has none', () => {
    const o = overview({ week: 30, fiveHourShown: false, estimate: { block: { start: NOW - 3_600_000, end: NOW + 3_600_000, tokens: 5, usd: 1, events: 2, percentage: 60, burn: [] }, week: { tokens: 5, usd: 1, events: 2, percentage: 30, burn: [] } } })
    expect(metersOf(o).map((x) => x.key)).toEqual(['week'])
  })
  it('says there is no window running between windows, and keeps the week', () => {
    const m = metersOf(overview({ week: 41 }))
    expect(m.map((x) => [x.key, x.idle])).toEqual([['five', true], ['week', false]])
    expect(resetText(m[0], NOW)).toBe('None running')
  })
  it('falls back to estimates, marked as such', () => {
    const o = overview({ estimate: { block: { start: NOW - 3_600_000, end: NOW + 4 * 3_600_000, tokens: 5, usd: 1, events: 2, percentage: 58, burn: [] }, week: { tokens: 9, usd: 2, events: 3, percentage: null, burn: [] } } })
    const m = metersOf(o)
    expect(m.map((x) => [x.key, x.estimate, x.percentage])).toEqual([['five', true, 58], ['week', true, null]])
  })
  it('draws no weekly meter with nothing known about the week', () => {
    expect(metersOf(overview({ fiveHourShown: false })).length).toBe(0)
  })
})

describe('chipOf', () => {
  it('shows the live 5-hour window when there is one', () => {
    const c = chipOf(overview({ five: 78, week: 41 }), NOW)
    expect(c).toMatchObject({ kind: 'meter', text: '78%', sub: '2h 30m', severity: 'warn', ring: 78, estimate: false })
    expect(c.label).toContain('5-hour window 78 percent used')
  })
  it('shows the week alone when there is no 5-hour window', () => {
    expect(chipOf(overview({ week: 41 }), NOW)).toMatchObject({ kind: 'meter', text: '41%', sub: 'week' })
    expect(chipOf(overview({ week: 41, fiveHourShown: false }), NOW)).toMatchObject({ text: '41%', sub: 'week' })
  })
  it('prefers a live number over an estimate', () => {
    const o = overview({ week: 41, estimate: { block: { start: NOW, end: NOW + 1, tokens: 1, usd: 0, events: 1, percentage: 90, burn: [] }, week: { tokens: 1, usd: 0, events: 1, percentage: null, burn: [] } } })
    expect(chipOf(o, NOW)).toMatchObject({ text: '41%', estimate: false })
  })
  it('marks an estimate', () => {
    const o = overview({ estimate: { block: { start: NOW, end: NOW + 4 * 3_600_000, tokens: 1, usd: 0, events: 1, percentage: 58, burn: [] }, week: { tokens: 1, usd: 0, events: 1, percentage: null, burn: [] } } })
    expect(chipOf(o, NOW)).toMatchObject({ text: '~58%', sub: 'est.', estimate: true })
  })
  it('asks to set up when there is nothing and the status line is off, and waits when it is on', () => {
    expect(chipOf(overview({ fiveHourShown: false, statusLine: { ...statusLine, installed: false } }), NOW).kind).toBe('setup')
    expect(chipOf(overview({ fiveHourShown: false }), NOW).kind).toBe('waiting')
  })
  it('keeps the ring within 100 for an estimate over the limit', () => {
    const o = overview({ estimate: { block: { start: NOW, end: NOW + 3_600_000, tokens: 1, usd: 0, events: 1, percentage: 140, burn: [] }, week: { tokens: 1, usd: 0, events: 1, percentage: null, burn: [] } } })
    expect(chipOf(o, NOW)).toMatchObject({ ring: 100, severity: 'danger' })
  })
})

describe('paceText', () => {
  it('says when the limit is reached', () => {
    const five = metersOf(overview({ five: 78 }))[0]
    expect(paceText(five)).toMatch(/^Limit reached around /)
  })
  it('says where the window ends up when it stays under', () => {
    const wk = metersOf(overview({ week: 41 }))[1]
    expect(paceText(wk)).toMatch(/^On pace to finish near \d+%$/)
  })
  it('says nothing for an estimate or an idle window', () => {
    expect(paceText(metersOf(overview({}))[0])).toBeNull()
  })
})
