import { describe, it, expect } from 'vitest'
import type { AgentInvocation, SessionSummary } from '../parsers/types'
import { buildProjectMap, type MapSessionInput, type ProjectMap } from './project-map'
import {
  layoutProjectMap,
  SESSION_HEIGHT,
  SESSION_WIDTH,
  SUBAGENT_HEIGHT,
  SUBAGENT_WIDTH,
  SUBAGENT_X,
} from './layout'

function summary(sessionId: string, forkOf?: string): SessionSummary {
  return {
    sessionId,
    projectPath: '/work/app',
    projectKey: '-work-app',
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
    projectDisplayName: 'Test Project',
    sessionName: null,
    lastStopReason: null,
    forkedFrom: forkOf ? { sessionId: forkOf, messageUuid: null } : null,
  }
}

function agents(count: number, sessionId: string): AgentInvocation[] {
  return Array.from({ length: count }, (_, i) => ({
    subagentType: 'Explore',
    description: `task ${i}`,
    timestamp: '2026-01-01T10:30:00.000Z',
    toolUseId: `${sessionId}-tool-${i}`,
    agentId: `${sessionId}-agent-${i}`,
    durationMs: 1000,
  }))
}

function input(sessionId: string, childCount: number, forkOf?: string): MapSessionInput {
  return {
    summary: summary(sessionId, forkOf),
    agents: agents(childCount, sessionId),
    subagentWriteTimes: new Map(),
    pendingQuestions: [],
    lastNotificationAt: null,
    totalTokens: 0,
  }
}

function mapOf(sessions: MapSessionInput[]): ProjectMap {
  return buildProjectMap('-work-app', '/work/app', 'app', sessions)
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

function expectNoOverlaps(nodes: Array<{ x: number; y: number; width: number; height: number }>) {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      expect(overlaps(nodes[i], nodes[j])).toBe(false)
    }
  }
}

describe('layoutProjectMap', () => {
  it('returns zero size for an empty map', () => {
    const layout = layoutProjectMap(mapOf([]))
    expect(layout.nodes).toEqual([])
    expect(layout.edges).toEqual([])
    expect(layout.width).toBe(0)
    expect(layout.height).toBe(0)
  })

  it('places a childless session as a single block of session height', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 0)]))
    const [session] = layout.nodes
    expect(session.x).toBe(0)
    expect(session.y).toBe(0)
    expect(session.width).toBe(SESSION_WIDTH)
    expect(session.height).toBe(SESSION_HEIGHT)
    expect(layout.height).toBe(SESSION_HEIGHT)
  })

  it('puts subagent cards in the child column as smaller cards', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 2)]))
    const children = layout.nodes.filter((n) => n.kind === 'subagent')
    expect(children).toHaveLength(2)
    for (const child of children) {
      expect(child.x).toBe(SUBAGENT_X)
      expect(child.width).toBe(SUBAGENT_WIDTH)
      expect(child.height).toBe(SUBAGENT_HEIGHT)
    }
  })

  it('stacks subagent cards 54px apart and sizes the block to fit them', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 3)]))
    const children = layout.nodes.filter((n) => n.kind === 'subagent')
    // card 44 + gap 10
    expect(children.map((c) => c.y)).toEqual([0, 54, 108])
    // 3 * 54 - 10 = 152, taller than the session node
    expect(layout.height).toBe(152)
  })

  it('centres the session node vertically in its block', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 3)]))
    const session = layout.nodes.find((n) => n.kind === 'session')!
    // (152 - 84) / 2 = 34
    expect(session.y).toBe(34)
  })

  it('keeps top-level blocks separated by a 24px gap', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 0), input('s1', 0)]))
    const sessions = layout.nodes.filter((n) => n.kind === 'session')
    expect(sessions[0].y).toBe(0)
    expect(sessions[1].y).toBe(SESSION_HEIGHT + 24)
    expect(layout.height).toBe(SESSION_HEIGHT * 2 + 24)
  })

  it('places a fork in the column after its parent, centred on its own block', () => {
    const layout = layoutProjectMap(mapOf([input('parent', 0), input('fork', 0, 'parent')]))
    const parent = layout.nodes.find((n) => n.sessionId === 'parent')!
    const fork = layout.nodes.find((n) => n.sessionId === 'fork')!
    expect(parent.x).toBe(0)
    expect(fork.x).toBe(SUBAGENT_X)
    expect(fork.width).toBe(SESSION_WIDTH)
    expect(fork.y).toBe(0)
  })

  it('draws a fork edge and a dispatch edge with the right kinds', () => {
    const layout = layoutProjectMap(mapOf([input('parent', 1), input('fork', 1, 'parent')]))
    expect(layout.edges.filter((e) => e.kind === 'fork')).toHaveLength(1)
    expect(layout.edges.filter((e) => e.kind === 'dispatch')).toHaveLength(2)
    for (const edge of layout.edges) {
      expect(edge.d.startsWith('M ')).toBe(true)
    }
  })

  it('nests a fork of a fork one column further right', () => {
    const layout = layoutProjectMap(
      mapOf([input('a', 0), input('b', 0, 'a'), input('c', 0, 'b')]),
    )
    const x = (id: string) => layout.nodes.find((n) => n.sessionId === id)!.x
    expect(x('a')).toBe(0)
    expect(x('b')).toBe(SUBAGENT_X)
    expect(x('c')).toBe(SUBAGENT_X + SESSION_WIDTH + 60)
  })

  it('places a fork before its parent sibling blocks, without overlap, with subagents in between', () => {
    const layout = layoutProjectMap(
      mapOf([
        input('parent', 2),
        input('fork', 3, 'parent'),
        input('grand', 1, 'fork'),
        input('other', 2),
      ]),
    )
    expectNoOverlaps(layout.nodes)
    for (const node of layout.nodes) {
      expect(node.y).toBeGreaterThanOrEqual(0)
      expect(node.y + node.height).toBeLessThanOrEqual(layout.height)
      expect(node.x + node.width).toBeLessThanOrEqual(layout.width)
    }
  })

  it('keeps a fork and its parent non-overlapping even when the parent has many children', () => {
    const layout = layoutProjectMap(
      mapOf([input('p', 5), input('f1', 4, 'p'), input('f2', 0, 'p'), input('ff', 2, 'f1')]),
    )
    expectNoOverlaps(layout.nodes)
    expect(layout.nodes).toHaveLength(4 + 5 + 4 + 2)
  })

  it('reports a canvas width that covers the deepest column', () => {
    const layout = layoutProjectMap(mapOf([input('a', 0), input('b', 0, 'a'), input('c', 0, 'b')]))
    expect(layout.width).toBe(SUBAGENT_X + SESSION_WIDTH + 60 + SESSION_WIDTH)
  })
})
