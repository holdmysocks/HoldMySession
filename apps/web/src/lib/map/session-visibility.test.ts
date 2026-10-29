import { describe, it, expect } from 'vitest'
import { filterHiddenSessions, filterVisibleSessions, hasProject } from './session-visibility'
import { buildProjectMap, type MapSessionInput } from './project-map'
import type { AgentInvocation, SessionSummary } from '../parsers/types'

const NOW = Date.parse('2026-01-01T12:00:00.000Z')

function session(sessionId: string, cwd: string | null): { sessionId: string; cwd: string | null } {
  return { sessionId, cwd }
}

describe('hasProject', () => {
  it('is false when there is no cwd', () => {
    expect(hasProject(session('a', null))).toBe(false)
  })

  it('is false for an empty cwd', () => {
    expect(hasProject(session('a', ''))).toBe(false)
  })

  it('is false for a whitespace-only cwd', () => {
    expect(hasProject(session('a', '   '))).toBe(false)
    expect(hasProject(session('a', '\t \n'))).toBe(false)
  })

  it('is true for a valid cwd', () => {
    expect(hasProject(session('a', '/work/app'))).toBe(true)
    expect(hasProject(session('a', 'D:\\work\\app'))).toBe(true)
  })

  it('keeps a cwd with surrounding spaces, since the path itself is not blank', () => {
    expect(hasProject(session('a', ' /work/app '))).toBe(true)
  })
})

describe('filterVisibleSessions and filterHiddenSessions', () => {
  const sessions = [
    session('valid', '/work/app'),
    session('none', null),
    session('empty', ''),
    session('blank', '  '),
    session('other', '/work/other'),
  ]

  it('keeps only sessions with a project, in their original order', () => {
    expect(filterVisibleSessions(sessions).map((s) => s.sessionId)).toEqual(['valid', 'other'])
  })

  it('returns the sessions with no project, so the count can be shown', () => {
    expect(filterHiddenSessions(sessions).map((s) => s.sessionId)).toEqual(['none', 'empty', 'blank'])
  })

  it('splits every session into exactly one of the two lists', () => {
    expect(filterVisibleSessions(sessions).length + filterHiddenSessions(sessions).length).toBe(sessions.length)
  })
})

describe('visibility with expired subagents', () => {
  const summary = (sessionId: string, cwd: string | null): SessionSummary => ({
    sessionId,
    projectPath: '/work/app',
    projectKey: '-work-app',
    projectName: 'app',
    branch: null,
    cwd,
    startedAt: '2026-01-01T10:00:00.000Z',
    lastActiveAt: '2026-01-01T11:00:00.000Z',
    durationMs: 0,
    messageCount: 1,
    userMessageCount: 0,
    assistantMessageCount: 1,
    isActive: false,
    toolCallCount: 0,
    model: null,
    version: null,
    fileSizeBytes: 0,
    projectDisplayName: 'app',
    sessionName: null,
    lastStopReason: null,
    forkedFrom: null,
  })

  const agent: AgentInvocation = {
    subagentType: 'Explore',
    description: 'old task',
    timestamp: '2026-01-01T10:30:00.000Z',
    toolUseId: 'toolu_1',
    agentId: 'old',
  }

  it('still shows a session with a project when its only subagents have expired', () => {
    const inputs: MapSessionInput[] = filterVisibleSessions([summary('s1', '/work/app')]).map((s) => ({
      summary: s,
      agents: [agent],
      subagentWriteTimes: new Map([['old', NOW - 60 * 60_000]]),
      pendingQuestions: [],
      lastNotificationAt: null,
      totalTokens: 0,
    }))
    const map = buildProjectMap('-work-app', '/work/app', 'app', inputs, NOW)
    expect(map.nodes.map((n) => n.id)).toEqual(['session:s1'])
    expect(map.nodes[0].expiredSubagentCount).toBe(1)
  })
})
