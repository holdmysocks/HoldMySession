import { describe, it, expect } from 'vitest'
import {
  filterArchivedSessions,
  filterHiddenSessions,
  filterVisibleSessions,
  hasProject,
  isVisible,
} from './session-visibility'
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

describe('archived sessions', () => {
  const sessions = [
    { sessionId: 'valid', cwd: '/work/app', isArchived: false },
    { sessionId: 'unflagged', cwd: '/work/app' },
    { sessionId: 'archived', cwd: '/work/app', isArchived: true },
    { sessionId: 'archived-no-project', cwd: null, isArchived: true },
    { sessionId: 'no-project', cwd: null, isArchived: false },
  ]

  it('hides an archived session, and treats a session without the flag as not archived', () => {
    expect(filterVisibleSessions(sessions).map((s) => s.sessionId)).toEqual(['valid', 'unflagged'])
    expect(isVisible({ cwd: '/work/app', isArchived: true })).toBe(false)
  })

  it('counts archived sessions separately from sessions with no project', () => {
    expect(filterArchivedSessions(sessions).map((s) => s.sessionId)).toEqual(['archived', 'archived-no-project'])
    expect(filterHiddenSessions(sessions).map((s) => s.sessionId)).toEqual(['no-project'])
  })

  it('puts every session into exactly one of the three groups', () => {
    const total =
      filterVisibleSessions(sessions).length +
      filterHiddenSessions(sessions).length +
      filterArchivedSessions(sessions).length
    expect(total).toBe(sessions.length)
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
      subagentLastActivity: new Map([['old', NOW - 60 * 60_000]]),
      pendingQuestions: [],
      lastNotificationAt: null,
      totalTokens: 0,
    }))
    const map = buildProjectMap('-work-app', '/work/app', 'app', inputs, NOW)
    expect(map.nodes.map((n) => n.id)).toEqual(['session:s1'])
    expect(map.nodes[0].expiredSubagentCount).toBe(1)
  })
})

describe('superseded transcripts', () => {
  // One desktop session with three transcripts, an archived one with two, and a plain session.
  const sessions = [
    { sessionId: 'ui-current', cwd: '/work/app', isArchived: false, isSuperseded: false },
    { sessionId: 'ui-old-1', cwd: '/work/app', isArchived: false, isSuperseded: true },
    { sessionId: 'ui-old-2', cwd: '/work/app', isArchived: false, isSuperseded: true },
    { sessionId: 'gone-current', cwd: '/work/app', isArchived: true, isSuperseded: false },
    { sessionId: 'gone-old', cwd: '/work/app', isArchived: true, isSuperseded: true },
    { sessionId: 'plain', cwd: '/work/app' },
    { sessionId: 'no-project-old', cwd: null, isSuperseded: true },
  ]

  it('shows only the current transcript of a session, and never an older one', () => {
    expect(filterVisibleSessions(sessions).map((s) => s.sessionId)).toEqual(['ui-current', 'plain'])
    expect(isVisible({ cwd: '/work/app', isSuperseded: true })).toBe(false)
  })

  it('hides the older transcripts of an archived session too, which is why they used to show', () => {
    expect(filterVisibleSessions(sessions).map((s) => s.sessionId)).not.toContain('gone-old')
  })

  it('counts an archived session once, however many transcripts it has', () => {
    expect(filterArchivedSessions(sessions).map((s) => s.sessionId)).toEqual(['gone-current'])
  })

  it('does not count an older transcript as a session with no project', () => {
    expect(filterHiddenSessions(sessions)).toEqual([])
  })

  it('leaves out of every count only the older transcripts, and puts the rest in exactly one group', () => {
    const superseded = sessions.filter((s) => s.isSuperseded).length
    const counted =
      filterVisibleSessions(sessions).length + filterHiddenSessions(sessions).length + filterArchivedSessions(sessions).length
    expect(counted).toBe(sessions.length - superseded)
  })
})
