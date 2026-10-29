import { describe, it, expect, vi } from 'vitest'
import type { SessionSummary } from '@/lib/parsers/types'
import {
  groupMapProjects,
  resolveSessionDetail,
  selectMapSessions,
  type CachedSessionDetail,
  type SessionDetailInput,
} from './project-map.api'

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: `session-${Math.random().toString(36).slice(2)}`,
    projectPath: '/work/app',
    projectName: 'app',
    branch: 'main',
    cwd: '/work/app',
    startedAt: '2026-01-01T10:00:00.000Z',
    lastActiveAt: '2026-01-01T11:00:00.000Z',
    durationMs: 3_600_000,
    messageCount: 10,
    userMessageCount: 5,
    assistantMessageCount: 5,
    isActive: false,
    toolCallCount: 0,
    model: 'claude-example-1',
    version: '2.1.0',
    fileSizeBytes: 1024,
    isInteractive: true,
    ...overrides,
  }
}

const EMPTY_DETAIL: SessionDetailInput = { agents: [], totalTokens: 0, pendingQuestions: [] }

describe('groupMapProjects', () => {
  it('returns an empty list when there are no sessions', () => {
    expect(groupMapProjects([])).toEqual([])
  })

  it('counts interactive sessions and active ones per project', () => {
    const projects = groupMapProjects([
      session({ projectPath: '/a', projectName: 'a', isActive: true }),
      session({ projectPath: '/a', projectName: 'a', isActive: false }),
      session({ projectPath: '/b', projectName: 'b', isActive: false }),
    ])
    const a = projects.find((p) => p.projectPath === '/a')
    expect(a).toMatchObject({ projectName: 'a', sessionCount: 2, activeCount: 1 })
    expect(projects.find((p) => p.projectPath === '/b')).toMatchObject({ sessionCount: 1, activeCount: 0 })
  })

  it('leaves out non-interactive sessions', () => {
    const projects = groupMapProjects([
      session({ projectPath: '/headless', isInteractive: false }),
    ])
    expect(projects).toEqual([])
  })

  it('takes the latest lastActiveAt across a project\'s sessions', () => {
    const projects = groupMapProjects([
      session({ projectPath: '/a', lastActiveAt: '2026-01-01T09:00:00.000Z' }),
      session({ projectPath: '/a', lastActiveAt: '2026-01-03T09:00:00.000Z' }),
      session({ projectPath: '/a', lastActiveAt: '2026-01-02T09:00:00.000Z' }),
    ])
    expect(projects[0].lastActiveAt).toBe('2026-01-03T09:00:00.000Z')
  })

  it('sorts projects by most recent activity first', () => {
    const projects = groupMapProjects([
      session({ projectPath: '/old', lastActiveAt: '2026-01-01T00:00:00.000Z' }),
      session({ projectPath: '/new', lastActiveAt: '2026-02-01T00:00:00.000Z' }),
      session({ projectPath: '/mid', lastActiveAt: '2026-01-15T00:00:00.000Z' }),
    ])
    expect(projects.map((p) => p.projectPath)).toEqual(['/new', '/mid', '/old'])
  })
})

describe('selectMapSessions', () => {
  it('keeps only interactive sessions of the requested project', () => {
    const sessions = [
      session({ sessionId: 'mine', projectPath: '/a' }),
      session({ sessionId: 'other', projectPath: '/b' }),
      session({ sessionId: 'headless', projectPath: '/a', isInteractive: false }),
    ]
    expect(selectMapSessions(sessions, '/a').map((s) => s.sessionId)).toEqual(['mine'])
  })

  it('caps the result at 25 newest sessions by default', () => {
    const sessions = Array.from({ length: 40 }, (_, i) =>
      session({ sessionId: `s${i}`, projectPath: '/a' }),
    )
    const selected = selectMapSessions(sessions, '/a')
    expect(selected).toHaveLength(25)
    expect(selected[0].sessionId).toBe('s0')
    expect(selected[24].sessionId).toBe('s24')
  })
})

describe('resolveSessionDetail', () => {
  function freshCache() {
    return new Map<string, CachedSessionDetail>()
  }

  it('parses on the first call and stores the result', async () => {
    const cache = freshCache()
    const load = vi.fn(async () => ({ ...EMPTY_DETAIL, totalTokens: 7 }))

    const result = await resolveSessionDetail(cache, { filePath: '/x.jsonl', isActive: false }, 100, load)

    expect(load).toHaveBeenCalledTimes(1)
    expect(result.totalTokens).toBe(7)
    expect(cache.get('/x.jsonl')).toMatchObject({ mtimeMs: 100, totalTokens: 7 })
  })

  it('reuses the cached detail for an idle session with an unchanged mtime', async () => {
    const cache = freshCache()
    const load = vi.fn(async () => ({ ...EMPTY_DETAIL, totalTokens: 7 }))
    const session = { filePath: '/x.jsonl', isActive: false }

    await resolveSessionDetail(cache, session, 100, load)
    const second = await resolveSessionDetail(cache, session, 100, load)

    expect(load).toHaveBeenCalledTimes(1)
    expect(second.totalTokens).toBe(7)
  })

  it('re-parses an idle session when its mtime changed', async () => {
    const cache = freshCache()
    const load = vi.fn(async () => EMPTY_DETAIL)
    const session = { filePath: '/x.jsonl', isActive: false }

    await resolveSessionDetail(cache, session, 100, load)
    await resolveSessionDetail(cache, session, 200, load)

    expect(load).toHaveBeenCalledTimes(2)
    expect(cache.get('/x.jsonl')?.mtimeMs).toBe(200)
  })

  it('always re-parses an active session, even with an unchanged mtime', async () => {
    const cache = freshCache()
    const load = vi.fn(async () => EMPTY_DETAIL)
    const session = { filePath: '/x.jsonl', isActive: true }

    await resolveSessionDetail(cache, session, 100, load)
    await resolveSessionDetail(cache, session, 100, load)

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('re-parses when a session was cached while active and is now idle with a newer mtime', async () => {
    const cache = freshCache()
    const load = vi.fn(async () => EMPTY_DETAIL)

    await resolveSessionDetail(cache, { filePath: '/x.jsonl', isActive: true }, 100, load)
    await resolveSessionDetail(cache, { filePath: '/x.jsonl', isActive: false }, 150, load)

    expect(load).toHaveBeenCalledTimes(2)
  })
})
