import { describe, it, expect } from 'vitest'
import type { AgentInvocation, SessionSummary } from '../parsers/types'
import {
  buildProjectMap,
  forkParents,
  SUBAGENT_RUNNING_WINDOW_MS,
  sessionStatus,
  tokenTotal,
  type MapSessionInput,
} from './project-map'
import type { PendingQuestion } from './pending-requests'

const NOW = Date.parse('2026-01-01T12:00:00.000Z')

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: 'abcdef12-0000-0000-0000-000000000000',
    projectPath: 'D:\\work\\app',
    projectKey: 'D--work-app',
    projectName: 'app',
    branch: 'feature/map',
    cwd: 'D:\\work\\app',
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
    forkedFrom: null,
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
    subagentWriteTimes: new Map(),
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

function build(sessions: MapSessionInput[], nowMs = NOW) {
  return buildProjectMap('D--work-app', 'D:\\work\\app', 'Test Project', sessions, nowMs)
}

describe('tokenTotal', () => {
  it('returns 0 when usage is missing', () => {
    expect(tokenTotal(undefined)).toBe(0)
  })

  it('sums input, output and both cache counters', () => {
    expect(
      tokenTotal({ inputTokens: 1, outputTokens: 2, cacheReadInputTokens: 3, cacheCreationInputTokens: 4 }),
    ).toBe(10)
  })
})

describe('sessionStatus', () => {
  it('is needs-you when a question is open and the session is active', () => {
    expect(sessionStatus(input({ summary: summary({ isActive: true }), pendingQuestions: [question()] }), NOW)).toBe(
      'needs-you',
    )
  })

  it('ignores an open question when the session is idle, since it was abandoned', () => {
    expect(sessionStatus(input({ pendingQuestions: [question()] }), NOW)).toBe('idle')
  })
})

describe('buildProjectMap: sessions', () => {
  it('returns the project identity and no nodes for no sessions', () => {
    expect(build([])).toEqual({
      projectKey: 'D--work-app',
      projectPath: 'D:\\work\\app',
      projectDisplayName: 'Test Project',
      nodes: [],
      edges: [],
    })
  })

  it('titles a session node with its session name, and keeps the branch and short id as subtitle parts', () => {
    const map = build([input({ summary: summary({ sessionName: 'Fix the router' }) })])
    const [node] = map.nodes
    expect(node.kind).toBe('session')
    expect(node.parentId).toBeNull()
    expect(node.isFork).toBe(false)
    expect(node.title).toBe('Fix the router')
    expect(node.subtitle).toBe('abcdef12 · 12 msgs')
    expect(node.branch).toBe('feature/map')
    expect(node.projectDisplayName).toBe('Test Project')
    expect(node.tokens).toBe(1000)
  })

  it('never uses the branch as the title; untitled sessions get a neutral title', () => {
    const map = build([input({ summary: summary({ sessionName: null, branch: 'HEAD' }) })])
    expect(map.nodes[0].title).toBe('Untitled session')
    expect(map.nodes[0].branch).toBe('HEAD')
  })

  it('leaves the project display name and branch off subagent nodes', () => {
    const map = build([input({ agents: [agent({ agentId: 'x' })] })])
    expect(map.nodes[1].projectDisplayName).toBeNull()
    expect(map.nodes[1].branch).toBeNull()
  })

  it('marks active sessions active and others idle', () => {
    const map = build([
      input({ summary: summary({ sessionId: 's1', isActive: true }) }),
      input({ summary: summary({ sessionId: 's2', isActive: false }) }),
    ])
    expect(map.nodes.map((n) => n.status)).toEqual(['active', 'idle'])
  })

  it('keeps the input order of sessions', () => {
    const map = build([
      input({ summary: summary({ sessionId: 'newest0000' }) }),
      input({ summary: summary({ sessionId: 'older00000' }) }),
    ])
    expect(map.nodes.map((n) => n.sessionId)).toEqual(['newest0000', 'older00000'])
  })

  it('includes every session given, with no cap', () => {
    const many = Array.from({ length: 60 }, (_, i) => input({ summary: summary({ sessionId: `s${i}` }) }))
    expect(build(many).nodes.filter((n) => n.kind === 'session')).toHaveLength(60)
  })
})

describe('buildProjectMap: subagents', () => {
  it('adds a subagent child and dispatch edge for each agent', () => {
    const map = build([input({ agents: [agent({ agentId: 'x1' }), agent({ agentId: 'x2', durationMs: 500 })] })])
    const children = map.nodes.filter((n) => n.kind === 'subagent')
    expect(children).toHaveLength(2)
    expect(children.every((c) => c.parentId === map.nodes[0].id)).toBe(true)
    expect(map.edges).toHaveLength(2)
    expect(map.edges.every((e) => e.kind === 'dispatch' && e.from === map.nodes[0].id)).toBe(true)
    expect(map.edges.map((e) => e.to)).toEqual(children.map((c) => c.id))
  })

  it('is running when its transcript was written inside the window, done otherwise', () => {
    const map = build([
      input({
        agents: [agent({ agentId: 'live' }), agent({ agentId: 'old' })],
        subagentWriteTimes: new Map([
          ['live', NOW - 30_000],
          ['old', NOW - SUBAGENT_RUNNING_WINDOW_MS - 1_000],
        ]),
      }),
    ])
    const statuses = map.nodes.filter((n) => n.kind === 'subagent').map((n) => n.status)
    expect(statuses).toEqual(['running', 'done'])
  })

  it('is done when there is no transcript for it', () => {
    const map = build([input({ agents: [agent({ agentId: 'gone', durationMs: undefined })] })])
    expect(map.nodes[1].status).toBe('done')
  })

  it('falls back to summing agent token usage when totalTokens is absent', () => {
    const map = build([
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
    const map = build([
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
    const map = build([input({ agents: [agent({ agentId: 'one' }), agent({ agentId: 'two' })] })])
    const ids = map.nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries pending questions and needsYou onto the session node only', () => {
    const map = build(
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
})

describe('buildProjectMap: forks', () => {
  const parent = input({ summary: summary({ sessionId: 'parent-1' }) })
  const fork = input({
    summary: summary({
      sessionId: 'fork-1',
      forkedFrom: { sessionId: 'parent-1', messageUuid: 'm1' },
    }),
  })

  it('makes a fork a child of the session it was forked from, with a fork edge', () => {
    const map = build([fork, parent])
    const forkNode = map.nodes.find((n) => n.sessionId === 'fork-1')!
    expect(forkNode.parentId).toBe('session:parent-1')
    expect(forkNode.isFork).toBe(true)
    expect(map.edges).toEqual([
      { id: `edge:session:fork-1`, from: 'session:parent-1', to: 'session:fork-1', kind: 'fork' },
    ])
  })

  it('renders a fork whose parent is missing at the top level, unlinked', () => {
    const orphan = input({
      summary: summary({ sessionId: 'orphan', forkedFrom: { sessionId: 'not-here', messageUuid: null } }),
    })
    const map = build([orphan])
    expect(map.nodes[0].parentId).toBeNull()
    expect(map.nodes[0].isFork).toBe(false)
    expect(map.edges).toEqual([])
  })

  it('keeps a session that was split out (no forkedFrom) at the top level', () => {
    const split = input({ summary: summary({ sessionId: 'split' }) })
    const map = build([parent, split])
    expect(map.nodes.every((n) => n.parentId === null)).toBe(true)
  })

  it('supports a fork of a fork', () => {
    const grand = fork
    const greatGrand = input({
      summary: summary({ sessionId: 'fork-2', forkedFrom: { sessionId: 'fork-1', messageUuid: 'm2' } }),
    })
    const map = build([greatGrand, grand, parent])
    expect(map.nodes.find((n) => n.sessionId === 'fork-2')!.parentId).toBe('session:fork-1')
    expect(map.nodes.find((n) => n.sessionId === 'fork-1')!.parentId).toBe('session:parent-1')
  })

  it('hangs subagents off the fork that dispatched them', () => {
    const withAgent = input({
      summary: summary({ sessionId: 'fork-1', forkedFrom: { sessionId: 'parent-1', messageUuid: null } }),
      agents: [agent({ agentId: 'z' })],
    })
    const map = build([parent, withAgent])
    const child = map.nodes.find((n) => n.kind === 'subagent')!
    expect(child.parentId).toBe('session:fork-1')
  })

  it('breaks a cycle so the result is still a tree', () => {
    const a = input({ summary: summary({ sessionId: 'a', forkedFrom: { sessionId: 'b', messageUuid: null } }) })
    const b = input({ summary: summary({ sessionId: 'b', forkedFrom: { sessionId: 'a', messageUuid: null } }) })
    const parents = forkParents([a, b])
    expect(parents.size).toBe(1)
  })

  it('ignores a self-reference', () => {
    const self = input({ summary: summary({ sessionId: 'x', forkedFrom: { sessionId: 'x', messageUuid: null } }) })
    expect(forkParents([self]).size).toBe(0)
  })
})
