import { describe, it, expect } from 'vitest'
import type { AgentInvocation, SessionSummary } from '../parsers/types'
import { buildProjectMap, type MapSessionInput, type ProjectMap } from './project-map'
import {
  applyNodeOffsets,
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

/**
 * A session with `childCount` subagents. Running ones were written just now, expired ones an
 * hour ago, so only the running ones are drawn.
 */
function input(
  sessionId: string,
  childCount: number,
  forkOf?: string,
  expiredCount = 0,
): MapSessionInput {
  const all = agents(childCount + expiredCount, sessionId)
  const now = Date.now()
  const writeTimes = new Map(
    all.map((a, i) => [a.agentId!, i < childCount ? now : now - 60 * 60_000]),
  )
  return {
    summary: summary(sessionId, forkOf),
    agents: all,
    subagentLastActivity: writeTimes,
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

describe('layoutProjectMap: expired subagents', () => {
  // Geometry only. The session node also carries its expired count, which differs by design.
  const geometry = (layout: ReturnType<typeof layoutProjectMap>) =>
    layout.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, width: n.width, height: n.height }))

  it('lays a session with only expired subagents out exactly like a session with none', () => {
    const expiredOnly = layoutProjectMap(mapOf([input('s0', 0, undefined, 3)]))
    const childless = layoutProjectMap(mapOf([input('s0', 0)]))
    expect(geometry(expiredOnly)).toEqual(geometry(childless))
    expect(expiredOnly.height).toBe(childless.height)
    expect(expiredOnly.width).toBe(childless.width)
  })

  it('lays out running subagents the same whether or not expired ones sit beside them', () => {
    const mixed = layoutProjectMap(mapOf([input('s0', 2, undefined, 3)]))
    const running = layoutProjectMap(mapOf([input('s0', 2)]))
    expect(geometry(mixed)).toEqual(geometry(running))
    expect(mixed.height).toBe(running.height)
  })

  it('leaves no gap between top-level blocks when a session has only expired subagents', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 0, undefined, 4), input('s1', 0)]))
    const sessions = layout.nodes.filter((n) => n.kind === 'session')
    expect(sessions[0].y).toBe(0)
    expect(sessions[1].y).toBe(SESSION_HEIGHT + 24)
    expect(layout.height).toBe(SESSION_HEIGHT * 2 + 24)
  })

  it('draws no node or edge for an expired subagent', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 0, undefined, 2)]))
    expect(layout.nodes.map((n) => n.kind)).toEqual(['session'])
    expect(layout.edges).toEqual([])
  })
})

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

  it('stacks subagent cards 60px apart and sizes the block to fit them', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 3)]))
    const children = layout.nodes.filter((n) => n.kind === 'subagent')
    // card 50 + gap 10
    expect(children.map((c) => c.y)).toEqual([0, 60, 120])
    // 3 * 60 - 10 = 170, taller than the session node
    expect(layout.height).toBe(170)
  })

  it('centres the session node vertically in its block', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 3)]))
    const session = layout.nodes.find((n) => n.kind === 'session')!
    // (170 - 92) / 2 = 39
    expect(session.y).toBe(39)
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

describe('applyNodeOffsets', () => {
  const base = layoutProjectMap(mapOf([input('a', 1), input('b', 0, 'a')]))
  const session = base.nodes.find((n) => n.kind === 'session' && n.id.includes('a'))!
  const child = base.nodes.find((n) => n.id.includes('b'))!

  it('returns the same layout when there are no offsets, or only zero ones', () => {
    expect(applyNodeOffsets(base, {})).toBe(base)
    expect(applyNodeOffsets(base, { [session.id]: { dx: 0, dy: 0 } })).toBe(base)
  })

  it('moves only the offset node and leaves the others where they were', () => {
    const moved = applyNodeOffsets(base, { [child.id]: { dx: 40, dy: -15 } })
    const next = moved.nodes.find((n) => n.id === child.id)!
    expect(next.x).toBe(child.x + 40)
    expect(next.y).toBe(child.y - 15)
    expect(moved.nodes.find((n) => n.id === session.id)).toEqual(session)
  })

  it('redraws the edge to end at the moved node', () => {
    const edge = base.edges.find((e) => e.to === child.id)!
    const moved = applyNodeOffsets(base, { [child.id]: { dx: 100, dy: 200 } })
    const next = moved.edges.find((e) => e.to === child.id)!
    expect(next.d).not.toBe(edge.d)
    expect(next.d.endsWith(`${child.x + 100} ${child.y + 200 + child.height / 2}`)).toBe(true)
  })

  it('ignores offsets for nodes that no longer exist', () => {
    expect(applyNodeOffsets(base, { gone: { dx: 50, dy: 50 } })).toBe(base)
  })

  it('grows the reported size to cover a node moved outside the original area', () => {
    const moved = applyNodeOffsets(base, { [child.id]: { dx: 500, dy: 300 } })
    expect(moved.width).toBe(child.x + 500 + child.width)
    expect(moved.height).toBe(child.y + 300 + child.height)
  })
})
