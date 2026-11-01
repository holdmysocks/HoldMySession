import { describe, it, expect } from 'vitest'
import type { StatsCache } from '@/lib/parsers/types'
import { costFrom, filterStatsRange, rangeStartDay } from './stats-range'

const stats = {
  dailyActivity: [
    { date: '2026-10-01', messageCount: 10, sessionCount: 1, toolCallCount: 2 },
    { date: '2026-10-30', messageCount: 20, sessionCount: 2, toolCallCount: 4 },
  ],
  dailyModelTokens: [
    { date: '2026-10-01', tokensByModel: { a: 100 } },
    { date: '2026-10-30', tokensByModel: { a: 300, b: 50 } },
  ],
  modelUsage: {
    a: { inputTokens: 400, outputTokens: 40, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
    b: { inputTokens: 50, outputTokens: 5, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
  },
  totalSessions: 3,
  totalMessages: 30,
  longestSession: { sessionId: 'x', duration: 1, messageCount: 1, timestamp: '' },
  firstSessionDate: '2026-10-01',
  hourCounts: {},
} as unknown as StatsCache

describe('stats range', () => {
  it('counts today as the last day of the range', () => {
    expect(rangeStartDay('7d', '2026-10-31')).toBe('2026-10-25')
    expect(rangeStartDay('all', '2026-10-31')).toBeNull()
  })

  it('cuts the daily figures and scales the model usage by the share in range', () => {
    const out = filterStatsRange(stats, '2026-10-25')
    expect(out.dailyActivity).toHaveLength(1)
    expect(out.totalSessions).toBe(2)
    expect(out.totalMessages).toBe(20)
    expect(out.modelUsage.a.inputTokens).toBeCloseTo(300)
    expect(out.modelUsage.b.inputTokens).toBeCloseTo(50)
  })

  it('leaves all history as it is', () => {
    expect(filterStatsRange(stats, null)).toBe(stats)
  })

  it('adds the cost from a day on', () => {
    expect(costFrom({ '2026-10-01': 5, '2026-10-30': 7 }, '2026-10-25')).toBe(7)
    expect(costFrom({ '2026-10-01': 5, '2026-10-30': 7 }, null)).toBe(12)
  })
})

import { previousPeriod, percentChange } from './stats-range'

describe('comparing with the period before', () => {
  it('finds the period of the same length just before the range', () => {
    expect(previousPeriod('7d', '2026-10-31')).toEqual({ start: '2026-10-18', end: '2026-10-25', label: 'the 7 days before' })
    expect(previousPeriod('1y', '2026-10-31')?.label).toBe('the year before')
    expect(previousPeriod('all', '2026-10-31')).toBeNull()
  })

  it('cuts a window with an end, and the hours of the day follow it', () => {
    const withHours = { ...stats, hourCountsByDay: { '2026-10-01': { '9': 2 }, '2026-10-30': { '14': 3, '9': 1 } }, hourCounts: { '9': 3, '14': 3 } } as unknown as StatsCache
    expect(filterStatsRange(withHours, '2026-10-25').hourCounts).toEqual({ '14': 3, '9': 1 })
    const before = filterStatsRange(withHours, '2026-10-01', '2026-10-25')
    expect(before.dailyActivity).toHaveLength(1)
    expect(before.hourCounts).toEqual({ '9': 2 })
    expect(costFrom({ '2026-10-01': 5, '2026-10-30': 7 }, '2026-10-01', '2026-10-25')).toBe(5)
  })

  it('gives a percent change, and nothing when there is nothing to compare with', () => {
    expect(percentChange(120, 100)).toBe(20)
    expect(percentChange(50, 100)).toBe(-50)
    expect(percentChange(10, 0)).toBeNull()
  })
})
