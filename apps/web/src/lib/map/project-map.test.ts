import { describe, it, expect } from 'vitest'
import type { AgentInvocation, SessionSummary } from '../parsers/types'
import {
  buildProjectMap,
  sessionStatus,
  tokenTotal,
  type MapSessionInput,
} from './project-map'
import type { PendingQuestion } from './pending-requests'

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: 'abcdef12-0000-0000-0000-000000000000',
    projectPath: '/work/app',
    projectName: 'app',
    branch: 'feature/map',
    cwd: '/work/app',
    startedAt: '2026-01-01T10:00:00.000Z',
    lastActiveAt: '2026-01-01T11:00:00.000Z',
    durationMs: 3_600_000,
    messageCount: 12,
    userMessageCount: 6,
    assistantMessageCount: 6,
    isActive: false,
    toolCallCount: 4,
    model: 'claude-example-1',
    version: '2.1.0',
    fileSizeBytes: 2048,
    projectDisplayName: 'Test Project',
    sessionName: null,
    lastStopReason: null,
    ...overrides,
  }
}

function question(): PendingQuestion {
  return {
    toolUseId: 'toolu_1',
    timestamp: '2026-01-01T10:59:00.000Z',
    questions: [{ header: 'Scope', question: 'Which scope?' }],
  }
}

function input(overrides: Partial<MapSessionInput> = {}): MapSessionInput {
  return {
    summary: summary(),
    agents: [],
    pendingQuestions: [],
    lastNotificationAt: null,
    totalTokens: 1000,
    ...overrides,
  }
}

function agent(overrides: Partial<AgentInvocation> = {}): AgentInvocation {
  return {
    subagentType: 'Explore',
    description: 'find the router',
    timestamp: '2026-01-01T10:30:00.000Z',
    toolUseId: 'toolu_agent_1',
    agentId: 'a1b2c3',
    ...overrides,
  }
}

describe('tokenTotal', () => {
  it('returns 0 when usage is missing', () => {
    expect(tokenTotal(undefined)).toBe(0)
  })

  it('sums input, output and both cache counters', () => {
    expect(
      tokenTotal({
        inputTokens: 1,
        outputTokens: 2,
        cacheReadInputTokens: 3,
        cacheCreationInputTokens: 4,
      }),
    ).toBe(10)
  })
})

const NOW = Date.parse('2026-01-01T11:02:00.000Z')

describe('sessionStatus', () => {
  const active = { isActive: true }

  it('is needs-you when a question is open and the session is active', () => {
    expect(sessionStatus(input({ summary: summary(active), pendingQuestions: [question()] }), NOW)).toBe('needs-you')
  })

  it('is needs-you when a notification arrived after the last write and the session is active', () => {
    expect(
      sessionStatus(input({ summary: summary(active), lastNotificationAt: '2026-01-01T11:05:00.000Z' }), NOW),
    ).toBe('needs-you')
  })

  it('ignores an open question when the session is idle, since it was abandoned', () => {
    expect(
      sessionStatus(input({ summary: summary({ lastStopReason: 'tool_use' }), pendingQuestions: [question()] }), NOW),
    ).toBe('idle')
  })

  it('is active, not needs-you, when the notification predates the last write', () => {
    expect(
      sessionStatus(
        input({ summary: summary(active), lastNotificationAt: '2026-01-01T10:00:00.000Z' }),
        NOW,
      ),
    ).toBe('active')
  })

  it('compares timestamps as instants, not strings', () => {
    // Same instant written with different offsets: not newer, so not needing you.
    const s = summary({ ...active, lastActiveAt: '2026-01-01T11:00:00.000Z' })
    expect(
      sessionStatus(input({ summary: s, lastNotificationAt: '2026-01-01T12:00:00+01:00' }), NOW),
    ).toBe('active')
  })

  it('is active with no question and no notification', () => {
    expect(sessionStatus(input({ summary: summary(active) }), NOW)).toBe('active')
  })
})

describe('buildProjectMap', () => {
  it('returns an empty map for no sessions', () => {
    const map = buildProjectMap('/work/app', 'app', [])
    expect(map).toEqual({ projectPath: '/work/app', projectDisplayName: 'app', nodes: [], edges: [] })
  })

  it('titles a session node with its session name and carries the project display name', () => {
    const map = buildProjectMap('/work/app', 'app', [
      input({ summary: summary({ sessionName: 'Fix the router', projectDisplayName: 'My App' }) }),
    ])
    expect(map.nodes).toHaveLength(1)
    const [node] = map.nodes
    expect(node.kind).toBe('session')
    expect(node.parentId).toBeNull()
    expect(node.title).toBe('Fix the router')
    expect(node.subtitle).toBe('abcdef12 · 12 msgs')
    expect(node.projectDisplayName).toBe('My App')
    expect(node.tokens).toBe(1000)
    expect(node.toolCalls).toBe(4)
  })

  it('falls back to the branch, then the first 8 characters of the id, when there is no name', () => {
    const withBranch = buildProjectMap('/work/app', 'app', [input()])
    expect(withBranch.nodes[0].title).toBe('feature/map')

    const noBranch = buildProjectMap('/work/app', 'app', [
      input({ summary: summary({ branch: null }) }),
    ])
    expect(noBranch.nodes[0].title).toBe('abcdef12')
  })

  it('leaves the project display name off subagent nodes', () => {
    const map = buildProjectMap('/work/app', 'app', [input({ agents: [agent({ agentId: 'x' })] })])
    expect(map.nodes[1].projectDisplayName).toBeNull()
  })

  it('marks active sessions active and others idle', () => {
    const map = buildProjectMap('/work/app', 'app', [
      input({ summary: summary({ sessionId: 's1', isActive: true }) }),
      input({ summary: summary({ sessionId: 's2', isActive: false }) }),
    ])
    expect(map.nodes.filter((n) => n.kind === 'session').map((n) => n.status)).toEqual([
      'active',
      'idle',
    ])
  })

  it('adds a subagent child and dispatch edge for each agent', () => {
    const map = buildProjectMap('/work/app', 'app', [
      input({ agents: [agent({ agentId: 'x1' }), agent({ agentId: 'x2', durationMs: 500 })] }),
    ])
    const children = map.nodes.filter((n) => n.kind === 'subagent')
    expect(children).toHaveLength(2)
    expect(children.every((c) => c.parentId === map.nodes[0].id)).toBe(true)
    expect(map.edges).toHaveLength(2)
    expect(map.edges.every((e) => e.kind === 'dispatch' && e.from === map.nodes[0].id)).toBe(true)
    expect(map.edges.map((e) => e.to)).toEqual(children.map((c) => c.id))
  })

  it('marks a subagent done when it has a duration, unknown otherwise', () => {
    const map = buildProjectMap('/work/app', 'app', [
      input({
        agents: [
          agent({ agentId: 'done', durationMs: 800 }),
          agent({ agentId: 'orphan', durationMs: undefined }),
        ],
      }),
    ])
    const statuses = map.nodes.filter((n) => n.kind === 'subagent').map((n) => n.status)
    expect(statuses).toEqual(['done', 'unknown'])
  })

  it('falls back to summing agent token usage when totalTokens is absent', () => {
    const map = buildProjectMap('/work/app', 'app', [
      input({
        agents: [
          agent({
            agentId: 'tok',
            tokens: { inputTokens: 5, outputTokens: 7, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
          }),
        ],
      }),
    ])
    expect(map.nodes.find((n) => n.kind === 'subagent')?.tokens).toBe(12)
  })

  it('prefers agent totalTokens over the token breakdown', () => {
    const map = buildProjectMap('/work/app', 'app', [
      input({
        agents: [
          agent({
            agentId: 'tot',
            totalTokens: 99,
            tokens: { inputTokens: 5, outputTokens: 7, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
          }),
        ],
      }),
    ])
    expect(map.nodes.find((n) => n.kind === 'subagent')?.tokens).toBe(99)
  })

  it('uses the agent id to keep child node ids unique', () => {
    const map = buildProjectMap('/work/app', 'app', [
      input({ agents: [agent({ agentId: 'one' }), agent({ agentId: 'two' })] }),
    ])
    const ids = map.nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries pending questions and needsYou onto the session node only', () => {
    const map = buildProjectMap(
      '/work/app',
      'app',
      [
        input({
          summary: summary({ isActive: true }),
          pendingQuestions: [question()],
          agents: [agent({ agentId: 'c' })],
        }),
      ],
      NOW,
    )
    const [session, child] = map.nodes
    expect(session.needsYou).toBe(true)
    expect(session.pendingQuestions).toHaveLength(1)
    expect(child.needsYou).toBe(false)
    expect(child.pendingQuestions).toEqual([])
  })

  it('keeps the input order of sessions', () => {
    const map = buildProjectMap('/work/app', 'app', [
      input({ summary: summary({ sessionId: 'newest0000' }) }),
      input({ summary: summary({ sessionId: 'older00000' }) }),
    ])
    expect(map.nodes.map((n) => n.sessionId)).toEqual(['newest0000', 'older00000'])
  })
})
