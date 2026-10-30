import { describe, it, expect } from 'vitest'
import type { SessionSummary } from '@/lib/parsers/types'
import { aggregateProjectAnalytics } from './project-analytics.api'

describe('project-analytics', () => {
  const createMockSession = (
    overrides: Partial<SessionSummary> = {},
  ): SessionSummary => ({
    sessionId: `session-${Math.random()}`,
    projectPath: '/path/to/project',
    projectKey: 'app',
    forkedFrom: null,
    projectName: 'test-project',
    branch: 'main',
    cwd: '/path/to/project',
    startedAt: '2026-01-01T10:00:00Z',
    lastActiveAt: '2026-01-01T11:00:00Z',
    durationMs: 3600000,
    messageCount: 10,
    userMessageCount: 5,
    assistantMessageCount: 5,
    isActive: false,
    toolCallCount: 0,
    model: 'claude-opus-4-6',
    version: '1.0.0',
    fileSizeBytes: 1024,
    projectDisplayName: 'Test Project', sessionName: null, lastStopReason: null,
    ...overrides,
  })

  describe('aggregateProjectAnalytics', () => {
    it('should group sessions by projectPath correctly', () => {
      const sessions = [
        createMockSession({ projectPath: '/project-a', projectName: 'project-a' }),
        createMockSession({ projectPath: '/project-b', projectName: 'project-b' }),
        createMockSession({ projectPath: '/project-a', projectName: 'project-a' }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(2)
      const projectA = result.projects.find((p) => p.projectPath === '/project-a')
      const projectB = result.projects.find((p) => p.projectPath === '/project-b')

      expect(projectA?.totalSessions).toBe(2)
      expect(projectB?.totalSessions).toBe(1)
    })

    it('should count active sessions correctly', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          isActive: true,
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          isActive: true,
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          isActive: false,
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].activeSessions).toBe(2)
      expect(result.projects[0].totalSessions).toBe(3)
    })

    it('should sum messages correctly', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          messageCount: 10,
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          messageCount: 20,
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          messageCount: 30,
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].totalMessages).toBe(60)
    })

    it('should sum duration correctly', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          durationMs: 1000,
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          durationMs: 2000,
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          durationMs: 3000,
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].totalDurationMs).toBe(6000)
    })

    it('should sum output tokens correctly', () => {
      const sessions = [
        createMockSession({ projectPath: '/project-a', projectName: 'project-a', outputTokens: 1500 }),
        createMockSession({ projectPath: '/project-a', projectName: 'project-a', outputTokens: 2500 }),
        createMockSession({ projectPath: '/project-a', projectName: 'project-a', outputTokens: undefined }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].outputTokens).toBe(4000)
    })

    it('should find first session timestamp correctly', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          startedAt: '2026-01-03T00:00:00Z',
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          startedAt: '2026-01-01T00:00:00Z', // Earliest
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          startedAt: '2026-01-02T00:00:00Z',
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].firstSessionAt).toBe('2026-01-01T00:00:00Z')
    })

    it('should find last session timestamp correctly', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          lastActiveAt: '2026-01-01T00:00:00Z',
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          lastActiveAt: '2026-01-03T00:00:00Z', // Latest
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          lastActiveAt: '2026-01-02T00:00:00Z',
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].lastSessionAt).toBe('2026-01-03T00:00:00Z')
    })

    it('should sort projects by most recent activity first', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          lastActiveAt: '2026-01-01T00:00:00Z',
        }),
        createMockSession({
          projectPath: '/project-b',
          projectName: 'project-b',
          lastActiveAt: '2026-01-03T00:00:00Z', // Most recent
        }),
        createMockSession({
          projectPath: '/project-c',
          projectName: 'project-c',
          lastActiveAt: '2026-01-02T00:00:00Z',
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(3)
      expect(result.projects[0].projectPath).toBe('/project-b')
      expect(result.projects[1].projectPath).toBe('/project-c')
      expect(result.projects[2].projectPath).toBe('/project-a')
    })

    it('should use projectName from first session in group', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'ProjectA',
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'ProjectA', // Same name
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0].projectName).toBe('ProjectA')
    })

    it('should handle no sessions', () => {
      const result = aggregateProjectAnalytics([])

      expect(result.projects).toHaveLength(0)
    })

    it('should handle single project with single session', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          messageCount: 10,
          durationMs: 1000,
          isActive: true,
          startedAt: '2026-01-01T00:00:00Z',
          lastActiveAt: '2026-01-01T01:00:00Z',
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(1)
      expect(result.projects[0]).toEqual({
        projectPath: '/project-a',
        isUnlinked: false,
        projectName: 'project-a',
        displayName: 'Test Project',
        totalSessions: 1,
        activeSessions: 1,
        totalMessages: 10,
        outputTokens: 0,
        totalDurationMs: 1000,
        firstSessionAt: '2026-01-01T00:00:00Z',
        lastSessionAt: '2026-01-01T01:00:00Z',
      })
    })

    it('should aggregate multiple projects correctly', () => {
      const sessions = [
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          messageCount: 10,
          durationMs: 1000,
          isActive: true,
          startedAt: '2026-01-01T00:00:00Z',
          lastActiveAt: '2026-01-02T00:00:00Z',
        }),
        createMockSession({
          projectPath: '/project-a',
          projectName: 'project-a',
          messageCount: 20,
          durationMs: 2000,
          isActive: false,
          startedAt: '2026-01-02T00:00:00Z',
          lastActiveAt: '2026-01-03T00:00:00Z',
        }),
        createMockSession({
          projectPath: '/project-b',
          projectName: 'project-b',
          messageCount: 5,
          durationMs: 500,
          isActive: true,
          startedAt: '2026-01-04T00:00:00Z',
          lastActiveAt: '2026-01-05T00:00:00Z',
        }),
      ]

      const result = aggregateProjectAnalytics(sessions)

      expect(result.projects).toHaveLength(2)

      // project-b should be first (most recent)
      expect(result.projects[0]).toEqual({
        projectPath: '/project-b',
        isUnlinked: false,
        projectName: 'project-b',
        displayName: 'Test Project',
        totalSessions: 1,
        activeSessions: 1,
        totalMessages: 5,
        outputTokens: 0,
        totalDurationMs: 500,
        firstSessionAt: '2026-01-04T00:00:00Z',
        lastSessionAt: '2026-01-05T00:00:00Z',
      })

      // project-a should be second
      expect(result.projects[1]).toEqual({
        projectPath: '/project-a',
        isUnlinked: false,
        projectName: 'project-a',
        displayName: 'Test Project',
        totalSessions: 2,
        activeSessions: 1,
        totalMessages: 30,
        outputTokens: 0,
        totalDurationMs: 3000,
        firstSessionAt: '2026-01-01T00:00:00Z',
        lastSessionAt: '2026-01-03T00:00:00Z',
      })
    })
  })
})

describe('unlinked sessions in project analytics', () => {
  const session = (overrides: Partial<SessionSummary>): SessionSummary => ({
    sessionId: `s-${Math.random()}`,
    projectPath: '/work/app',
    projectKey: 'app',
    forkedFrom: null,
    projectName: 'app',
    branch: null,
    cwd: '/work/app',
    startedAt: '2026-01-01T10:00:00Z',
    lastActiveAt: '2026-01-01T11:00:00Z',
    durationMs: 1000,
    messageCount: 2,
    userMessageCount: 1,
    assistantMessageCount: 1,
    isActive: false,
    toolCallCount: 0,
    model: null,
    version: null,
    fileSizeBytes: 1,
    projectDisplayName: 'App',
    sessionName: null,
    lastStopReason: null,
    ...overrides,
  })

  it('groups scratch folders and sessions with no working directory into one entry, with their count', () => {
    const result = aggregateProjectAnalytics([
      session({}),
      session({ projectPath: '/a/scratch', projectName: 'scratch', cwd: '/a/scratch' }),
      session({ projectPath: '/b/scratch', projectName: 'scratch', cwd: '/b/scratch' }),
      session({ projectPath: 'dir-name', projectName: 'dir-name', cwd: null }),
    ])
    expect(result.projects).toHaveLength(2)
    const unlinked = result.projects.find((p) => p.isUnlinked)!
    expect(unlinked.projectName).toBe('Unlinked Sessions')
    expect(unlinked.projectPath).toBe('__unlinked__')
    expect(unlinked.totalSessions).toBe(3)
    expect(unlinked.totalMessages).toBe(6)
    expect(result.projects.find((p) => !p.isUnlinked)?.totalSessions).toBe(1)
  })

  it('adds no unlinked entry when every session is in a project', () => {
    const result = aggregateProjectAnalytics([session({})])
    expect(result.projects.some((p) => p.isUnlinked)).toBe(false)
  })
})

describe('project display names', () => {
  const session = (overrides: Partial<SessionSummary>): SessionSummary => ({
    sessionId: `s-${Math.random()}`, projectPath: '/work/app', projectKey: 'app', forkedFrom: null, projectName: 'app-folder',
    branch: null, cwd: '/work/app', startedAt: '2026-01-01T10:00:00Z', lastActiveAt: '2026-01-01T11:00:00Z', durationMs: 1,
    messageCount: 1, userMessageCount: 1, assistantMessageCount: 0, isActive: false, toolCallCount: 0, model: null,
    version: null, fileSizeBytes: 1, projectDisplayName: 'My App', sessionName: null, lastStopReason: null, ...overrides,
  })

  it('shows the display name, and keeps the folder name for the Sessions list filter', () => {
    const [project] = aggregateProjectAnalytics([session({})]).projects
    expect(project.displayName).toBe('My App')
    expect(project.projectName).toBe('app-folder')
  })

  it('falls back to the folder name when there is no display name', () => {
    const [project] = aggregateProjectAnalytics([session({ projectDisplayName: '' })]).projects
    expect(project.displayName).toBe('app-folder')
  })

  it('groups scratch-prefixed folders with the unlinked sessions', () => {
    const { projects } = aggregateProjectAnalytics([
      session({}),
      session({ projectPath: '/a/scratch-1a2b', projectName: 'scratch-1a2b', cwd: '/a/scratch-1a2b' }),
      session({ projectPath: '/b/scratch-9z', projectName: 'scratch-9z', cwd: '/b/scratch-9z' }),
    ])
    expect(projects).toHaveLength(2)
    expect(projects.find((p) => p.isUnlinked)?.totalSessions).toBe(2)
  })
})
