import { describe, it, expect, vi } from 'vitest'
import type { SessionSummaryWithPath } from '@/lib/scanner/session-scanner'

const { computeStatsFromSummaries } = vi.hoisted(() => ({
  computeStatsFromSummaries: vi.fn(async (sessions: unknown[]) => ({ sessions: sessions.length, dailyActivity: [] })),
}))
vi.mock('@/lib/parsers/stats-parser', () => ({ computeStatsFromSummaries }))

import { computeProjectStats } from './project-stats'
import { UNLINKED_PROJECT_KEY } from './unlinked'

function session(overrides: Partial<SessionSummaryWithPath>): SessionSummaryWithPath {
  return {
    sessionId: 's',
    projectPath: '/work/app',
    projectName: 'app',
    projectDisplayName: 'App',
    cwd: '/work/app',
    filePath: '/x.jsonl',
    ...overrides,
  } as SessionSummaryWithPath
}

describe('computeProjectStats', () => {
  const sessions = [
    session({ sessionId: 'a' }),
    session({ sessionId: 'b' }),
    session({ sessionId: 'c', projectPath: '/other', projectName: 'other', cwd: '/other' }),
    session({ sessionId: 'd', projectPath: '/x/scratch', projectName: 'scratch', cwd: '/x/scratch' }),
    session({ sessionId: 'e', projectPath: 'dir', projectName: 'dir', cwd: null }),
  ]

  it('computes stats from only the sessions of the project', async () => {
    const result = await computeProjectStats(sessions, '/work/app')
    expect(result).toEqual({ sessions: 2, dailyActivity: [] })
    expect(computeStatsFromSummaries).toHaveBeenLastCalledWith([sessions[0], sessions[1]])
  })

  it('selects every unlinked session for the unlinked key', async () => {
    expect(await computeProjectStats(sessions, UNLINKED_PROJECT_KEY)).toEqual({ sessions: 2, dailyActivity: [] })
    expect(computeStatsFromSummaries).toHaveBeenLastCalledWith([sessions[3], sessions[4]])
  })

  it('is null, and reads nothing, when no session belongs to the project', async () => {
    computeStatsFromSummaries.mockClear()
    expect(await computeProjectStats(sessions, '/missing')).toBeNull()
    expect(computeStatsFromSummaries).not.toHaveBeenCalled()
  })
})
