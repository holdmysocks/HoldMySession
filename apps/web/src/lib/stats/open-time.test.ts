import { describe, it, expect } from 'vitest'
import type { StatsCache } from '@/lib/parsers/types'
import { addOpenTime } from './open-time'

const stats = {
  dailyActivity: [{ date: '2026-10-30', messageCount: 5, sessionCount: 1, toolCallCount: 2 }],
  dailyModelTokens: [], modelUsage: {}, totalSessions: 1, totalMessages: 5, hourCounts: {},
} as unknown as StatsCache

describe('addOpenTime', () => {
  it('spreads a session over its days, adds days that had only open time, and keeps the counts', () => {
    const out = addOpenTime(stats, [{ startedAt: '2026-10-30T12:00:00', lastActiveAt: '2026-10-31T12:00:00', durationMs: 10_000_000 }])
    expect(out.dailyActivity.map((d) => d.date)).toEqual(['2026-10-30', '2026-10-31'])
    expect(out.dailyActivity[0]).toMatchObject({ messageCount: 5, sessionCount: 1, durationMs: 5_000_000 })
    expect(out.dailyActivity[1]).toMatchObject({ messageCount: 0, sessionCount: 0, durationMs: 5_000_000 })
  })

  it('gives every day a time, even with no sessions to count', () => {
    expect(addOpenTime(stats, []).dailyActivity[0].durationMs).toBe(0)
  })
})
