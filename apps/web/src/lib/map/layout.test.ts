import { describe, it, expect } from 'vitest'
import type { AgentInvocation, SessionSummary } from '../parsers/types'
import { buildProjectMap, type MapSessionInput, type ProjectMap } from './project-map'
import {
  applyCustomPositions,
  BLOCK_GAP,
  edgePath,
  layoutProjectMap,
  ROW_GAP,
  SESSION_HEIGHT,
  SESSION_WIDTH,
  SIBLING_GAP,
  SUBAGENT_HEIGHT,
  SUBAGENT_WIDTH,
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

const ROW_STEP = SESSION_HEIGHT + ROW_GAP

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
    expect(mixed.width).toBe(running.width)
  })

  it('leaves no gap between top-level blocks when a session has only expired subagents', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 0, undefined, 4), input('s1', 0)]))
    const sessions = layout.nodes.filter((n) => n.kind === 'session')
    expect(sessions[0].x).toBe(0)
    expect(sessions[1].x).toBe(SESSION_WIDTH + BLOCK_GAP)
    expect(layout.width).toBe(SESSION_WIDTH * 2 + BLOCK_GAP)
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

  it('places a childless session as a single block of session size', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 0)]))
    const [session] = layout.nodes
    expect(session.x).toBe(0)
    expect(session.y).toBe(0)
    expect(session.width).toBe(SESSION_WIDTH)
    expect(session.height).toBe(SESSION_HEIGHT)
    expect(layout.width).toBe(SESSION_WIDTH)
    expect(layout.height).toBe(SESSION_HEIGHT)
  })

  it('puts top-level sessions side by side in one row, in order', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 0), input('s1', 0), input('s2', 0)]))
    const sessions = layout.nodes.filter((n) => n.kind === 'session')
    expect(sessions.map((s) => s.y)).toEqual([0, 0, 0])
    expect(sessions.map((s) => s.x)).toEqual([0, SESSION_WIDTH + BLOCK_GAP, (SESSION_WIDTH + BLOCK_GAP) * 2])
  })

  it('hangs subagent cards in a row below their session, as smaller cards', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 2)]))
    const children = layout.nodes.filter((n) => n.kind === 'subagent')
    expect(children).toHaveLength(2)
    for (const child of children) {
      expect(child.width).toBe(SUBAGENT_WIDTH)
      expect(child.height).toBe(SUBAGENT_HEIGHT)
      expect(child.y).toBe(ROW_STEP)
    }
  })

  it('spaces subagent cards side by side and sizes the block to fit them', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 3)]))
    const children = layout.nodes.filter((n) => n.kind === 'subagent')
    const step = SUBAGENT_WIDTH + SIBLING_GAP
    expect(children.map((c) => c.x - children[0].x)).toEqual([0, step, step * 2])
    // 3 cards and 2 gaps, wider than the session node.
    expect(layout.width).toBe(SUBAGENT_WIDTH * 3 + SIBLING_GAP * 2)
  })

  it('centres the session node over its subagent cards', () => {
    const layout = layoutProjectMap(mapOf([input('s0', 3)]))
    const session = layout.nodes.find((n) => n.kind === 'session')!
    const children = layout.nodes.filter((n) => n.kind === 'subagent')
    const childrenCentre = (children[0].x + children[2].x + SUBAGENT_WIDTH) / 2
    expect(session.x + session.width / 2).toBe(childrenCentre)
    expect(session.y).toBe(0)
  })

  it('places a fork in the row below its parent, centred under it', () => {
    const layout = layoutProjectMap(mapOf([input('parent', 0), input('fork', 0, 'parent')]))
    const parent = layout.nodes.find((n) => n.sessionId === 'parent')!
    const fork = layout.nodes.find((n) => n.sessionId === 'fork')!
    expect(parent.y).toBe(0)
    expect(fork.y).toBe(ROW_STEP)
    expect(fork.width).toBe(SESSION_WIDTH)
    expect(fork.x).toBe(parent.x)
  })

  it('draws a fork edge and a dispatch edge with the right kinds', () => {
    const layout = layoutProjectMap(mapOf([input('parent', 1), input('fork', 1, 'parent')]))
    expect(layout.edges.filter((e) => e.kind === 'fork')).toHaveLength(1)
    expect(layout.edges.filter((e) => e.kind === 'dispatch')).toHaveLength(2)
    for (const edge of layout.edges) {
      expect(edge.d.startsWith('M ')).toBe(true)
    }
  })

  it('nests a fork of a fork one row further down', () => {
    const layout = layoutProjectMap(
      mapOf([input('a', 0), input('b', 0, 'a'), input('c', 0, 'b')]),
    )
    const y = (id: string) => layout.nodes.find((n) => n.sessionId === id)!.y
    expect(y('a')).toBe(0)
    expect(y('b')).toBe(ROW_STEP)
    expect(y('c')).toBe(ROW_STEP * 2)
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
      expect(node.x).toBeGreaterThanOrEqual(0)
      expect(node.x + node.width).toBeLessThanOrEqual(layout.width)
      expect(node.y + node.height).toBeLessThanOrEqual(layout.height)
    }
  })

  it('keeps a fork and its parent non-overlapping even when the parent has many children', () => {
    const layout = layoutProjectMap(
      mapOf([input('p', 5), input('f1', 4, 'p'), input('f2', 0, 'p'), input('ff', 2, 'f1')]),
    )
    expectNoOverlaps(layout.nodes)
    expect(layout.nodes).toHaveLength(4 + 5 + 4 + 2)
  })

  it('reports a canvas height that covers the deepest row', () => {
    const layout = layoutProjectMap(mapOf([input('a', 0), input('b', 0, 'a'), input('c', 0, 'b')]))
    expect(layout.height).toBe(SESSION_HEIGHT * 3 + ROW_GAP * 2)
  })
})

describe('edgePath', () => {
  const card = { x: 0, y: 0, width: 280, height: 92 }

  it('links bottom to top when the other card is below', () => {
    const below = { x: 0, y: 200, width: 280, height: 92 }
    expect(edgePath(card, below)).toBe('M 140 92 C 140 146, 140 146, 140 200')
  })

  it('links top to bottom when the other card is above', () => {
    const above = { x: 0, y: -200, width: 280, height: 92 }
    expect(edgePath(card, above)).toBe('M 140 0 C 140 -54, 140 -54, 140 -108')
  })

  it('links right to left when the other card is to the right', () => {
    const right = { x: 400, y: 0, width: 280, height: 92 }
    expect(edgePath(card, right)).toBe('M 280 46 C 340 46, 340 46, 400 46')
  })

  it('links left to right when the other card is to the left', () => {
    const left = { x: -400, y: 0, width: 280, height: 92 }
    expect(edgePath(card, left)).toBe('M 0 46 C -60 46, -60 46, -120 46')
  })

  it('links bottom to top for a card below, even one far to the side', () => {
    // Below the card, and entirely to its right: the vertical link still wins.
    const belowRight = { x: 330, y: 110, width: 190, height: 50 }
    expect(edgePath(card, belowRight).startsWith('M 140 92')).toBe(true)
    expect(edgePath(card, belowRight).endsWith('425 110')).toBe(true)
    // Below and far to the left.
    const belowLeft = { x: -600, y: 200, width: 190, height: 50 }
    expect(edgePath(card, belowLeft).startsWith('M 140 92')).toBe(true)
  })

  it('links top to bottom for a card above, even one far to the side', () => {
    const aboveRight = { x: 500, y: -200, width: 190, height: 50 }
    expect(edgePath(card, aboveRight).startsWith('M 140 0')).toBe(true)
  })

  it('uses the sides only when the other card is level with this one', () => {
    const levelRight = { x: 400, y: 30, width: 190, height: 50 }
    expect(edgePath(card, levelRight).startsWith('M 280 46')).toBe(true)
    const levelLeft = { x: -400, y: 30, width: 190, height: 50 }
    expect(edgePath(card, levelLeft).startsWith('M 0 46')).toBe(true)
  })

  it('never doubles back to a side the target is not beyond', () => {
    // The target is below, and its left edge is left of the card's right edge.
    const below = { x: 250, y: 162, width: 190, height: 50 }
    expect(edgePath(card, below).startsWith('M 140 92')).toBe(true)
  })

  it('falls back to the dominant direction when the cards overlap', () => {
    const overlapping = { x: 20, y: 40, width: 280, height: 92 }
    expect(edgePath(card, overlapping).startsWith('M 140 92')).toBe(true)
  })
})

describe('applyCustomPositions', () => {
  // Two top-level sessions, the first with two subagents.
  const base = layoutProjectMap(mapOf([input('a', 2), input('b', 0)]))
  const nodeOf = (layout: typeof base, id: string) => layout.nodes.find((n) => n.id === id)!
  const sessionA = base.nodes.find((n) => n.sessionId === 'a')!
  const sessionB = base.nodes.find((n) => n.sessionId === 'b')!
  const agents = base.nodes.filter((n) => n.kind === 'subagent')
  const saveAll = (extra: Record<string, { x: number; y: number }> = {}) => ({
    ...Object.fromEntries(base.nodes.map((n) => [n.id, { x: n.x, y: n.y }])),
    ...extra,
  })

  it('returns the same layout when nothing is saved, or only unknown nodes', () => {
    expect(applyCustomPositions(base, {})).toBe(base)
    expect(applyCustomPositions(base, { gone: { x: 5, y: 5 } })).toBe(base)
  })

  it('puts a saved node exactly where it was saved and leaves the others', () => {
    const moved = applyCustomPositions(base, saveAll({ [sessionB.id]: { x: 900, y: 300 } }))
    expect(nodeOf(moved, sessionB.id)).toMatchObject({ x: 900, y: 300 })
    expect(nodeOf(moved, sessionA.id)).toMatchObject({ x: sessionA.x, y: sessionA.y })
  })

  it('redraws an edge to follow the moved card, attached to the facing sides', () => {
    const edgeBefore = base.edges.find((e) => e.to === agents[0].id)!
    const moved = applyCustomPositions(base, saveAll({ [agents[0].id]: { x: 2000, y: 0 } }))
    const edgeAfter = moved.edges.find((e) => e.to === agents[0].id)!
    expect(edgeAfter.d).not.toBe(edgeBefore.d)
    // Far to the right of its parent and level with it: right side to left side.
    expect(edgeAfter.d.startsWith(`M ${sessionA.x + SESSION_WIDTH} ${sessionA.y + SESSION_HEIGHT / 2}`)).toBe(true)
    // Moved below the parent, still far to the right: bottom to top.
    const below = applyCustomPositions(base, saveAll({ [agents[0].id]: { x: 2000, y: 400 } }))
    const edgeBelow = below.edges.find((e) => e.to === agents[0].id)!
    expect(edgeBelow.d.startsWith(`M ${sessionA.x + SESSION_WIDTH / 2} ${sessionA.y + SESSION_HEIGHT}`)).toBe(true)
  })

  it('puts a new top-level session to the right of everything saved, level with the saved top row', () => {
    const saved = { [sessionA.id]: { x: 100, y: 40 }, [agents[0].id]: { x: 600, y: 500 } }
    const result = applyCustomPositions(base, saved)
    const right = 600 + SUBAGENT_WIDTH
    expect(nodeOf(result, sessionB.id).x).toBe(right + BLOCK_GAP)
    expect(nodeOf(result, sessionB.id).y).toBe(40)
  })

  it('moves a new top-level session together with its new subagents', () => {
    const withChild = layoutProjectMap(mapOf([input('a', 0), input('b', 2)]))
    const a = withChild.nodes.find((n) => n.sessionId === 'a')!
    const b = withChild.nodes.find((n) => n.sessionId === 'b')!
    const bAgents = withChild.nodes.filter((n) => n.kind === 'subagent')
    const result = applyCustomPositions(withChild, { [a.id]: { x: 10, y: 20 } })
    const dx = nodeOf(result, b.id).x - b.x
    const dy = nodeOf(result, b.id).y - b.y
    expect(nodeOf(result, b.id).x).toBeGreaterThanOrEqual(10 + SESSION_WIDTH + BLOCK_GAP)
    for (const agent of bAgents) {
      expect(nodeOf(result, agent.id)).toMatchObject({ x: agent.x + dx, y: agent.y + dy })
    }
  })

  it('lays several new top-level sessions out left to right without overlap', () => {
    const three = layoutProjectMap(mapOf([input('a', 0), input('b', 2), input('c', 1)]))
    const a = three.nodes.find((n) => n.sessionId === 'a')!
    const result = applyCustomPositions(three, { [a.id]: { x: 0, y: 0 } })
    expectNoOverlaps(result.nodes)
  })

  it('lands a new subagent of a saved session at its normal position, even if that overlaps', () => {
    // Everything is saved except the second subagent. The saved session now sits right on top of
    // where that subagent normally goes, and the subagent is not moved out of the way.
    const { [agents[1].id]: _unsaved, ...saved } = saveAll({
      [sessionA.id]: { x: agents[1].x, y: agents[1].y },
    })
    const result = applyCustomPositions(base, saved)
    expect(nodeOf(result, agents[1].id)).toMatchObject({ x: agents[1].x, y: agents[1].y })
    expect(overlaps(nodeOf(result, sessionA.id), nodeOf(result, agents[1].id))).toBe(true)
  })

  it('ignores a saved entry that is not a position', () => {
    expect(applyCustomPositions(base, { [sessionA.id]: undefined as never })).toBe(base)
    expect(applyCustomPositions(base, { [sessionA.id]: null as never })).toBe(base)
  })

  it('ignores a saved position that is not a finite number', () => {
    const result = applyCustomPositions(base, { [sessionA.id]: { x: Number.NaN, y: 0 } })
    expect(result).toBe(base)
  })
})

describe('edgePath next to another card', () => {
  /** Points along the cubic bezier in an `M x y C x1 y1, x2 y2, x3 y3` path. */
  function samplePath(d: string): Array<{ x: number; y: number }> {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
    return Array.from({ length: 41 }, (_, i) => {
      const t = i / 40
      const u = 1 - t
      return {
        x: u ** 3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3,
        y: u ** 3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3,
      }
    })
  }

  it('hangs from the top of a subagent below and to the right without crossing the card between them', () => {
    // A session, a sub-session under it, and a subagent card placed below and to the right of the
    // session, with the sub-session's card sitting just to the left of that subagent.
    const session = { x: 0, y: 0, width: 280, height: 92 }
    const subSession = { x: 48, y: 161, width: 280, height: 92 }
    const subagent = { x: 334, y: 172, width: 190, height: 50 }
    const d = edgePath(session, subagent)
    expect(d.startsWith('M 140 92')).toBe(true)
    expect(d.endsWith('429 172')).toBe(true)
    for (const point of samplePath(d)) {
      const inside =
        point.x > subSession.x && point.x < subSession.x + subSession.width &&
        point.y > subSession.y && point.y < subSession.y + subSession.height
      expect(inside).toBe(false)
    }
  })
})
