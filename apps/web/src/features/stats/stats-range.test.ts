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
