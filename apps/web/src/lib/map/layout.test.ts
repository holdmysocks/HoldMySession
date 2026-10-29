import { describe, it, expect } from 'vitest'
import type { AgentInvocation, SessionSummary } from '../parsers/types'
import { buildProjectMap, type MapSessionInput, type ProjectMap } from './project-map'
import {
  layoutProjectMap,
  SESSION_HEIGHT,
  SESSION_WIDTH,
  SUBAGENT_HEIGHT,
  SUBAGENT_X,
  SUBAGENT_WIDTH,
} from './layout'

function summary(sessionId: string): SessionSummary {
  return {
    sessionId,
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
    projectDisplayName: 'Test Project', sessionName: null, lastStopReason: null,
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

function input(sessionId: string, childCount: number): MapSessionInput {
  return {
    summary: summary(sessionId),
    agents: agents(childCount, sessionId),
    pendingQuestions: [],
    lastNotificationAt: null,
    totalTokens: 0,
  }
}

function mapOf(counts: number[]): ProjectMap {
  const sessions = counts.map((count, i) => input(`s${i}`, count))
  return buildProjectMap('/work/app', 'app', sessions)
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
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
    const layout = layoutProjectMap(mapOf([0]))
    expect(layout.nodes).toHaveLength(1)
    const [session] = layout.nodes
    expect(session.x).toBe(0)
    expect(session.y).toBe(0)
    expect(session.width).toBe(SESSION_WIDTH)
    expect(session.height).toBe(SESSION_HEIGHT)
    expect(layout.height).toBe(SESSION_HEIGHT)
  })

  it('uses the session column for session nodes and the subagent column for children', () => {
    const layout = layoutProjectMap(mapOf([2]))
    const children = layout.nodes.filter((n) => n.kind === 'subagent')
    expect(children).toHaveLength(2)
    for (const child of children) {
      expect(child.x).toBe(SUBAGENT_X)
      expect(child.width).toBe(SUBAGENT_WIDTH)
      expect(child.height).toBe(SUBAGENT_HEIGHT)
    }
  })

  it('stacks children 66px apart and sizes the block to fit them', () => {
    const layout = layoutProjectMap(mapOf([3]))
    const children = layout.nodes.filter((n) => n.kind === 'subagent')
    expect(children.map((c) => c.y)).toEqual([0, 66, 132])
    // 3 * 66 - 10 = 188, taller than the session node
    expect(layout.height).toBe(188)
  })

  it('centres the session node vertically in its block', () => {
    const layout = layoutProjectMap(mapOf([3]))
    const session = layout.nodes.find((n) => n.kind === 'session')!
    // (188 - 84) / 2 = 52
    expect(session.y).toBe(52)
  })

  it('keeps blocks separated by a 24px gap', () => {
    const layout = layoutProjectMap(mapOf([0, 1]))
    const sessions = layout.nodes.filter((n) => n.kind === 'session')
    expect(sessions[0].y).toBe(0)
    // first block is 84 tall, then a 24px gap
    expect(sessions[1].y).toBe(SESSION_HEIGHT + 24)
    // second block is 84 tall (one child: max(84, 56) = 84), total 84 + 24 + 84
    expect(layout.height).toBe(SESSION_HEIGHT + 24 + SESSION_HEIGHT)
  })

  it('never overlaps two nodes', () => {
    const layout = layoutProjectMap(mapOf([0, 4, 1, 12, 2]))
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        expect(overlaps(layout.nodes[i], layout.nodes[j])).toBe(false)
      }
    }
  })

  it('places every child inside its parent block', () => {
    const map = mapOf([5, 2, 9])
    const layout = layoutProjectMap(map)
    expect(layout.nodes).toHaveLength(map.nodes.length)

    let blockTop = 0
    for (const session of layout.nodes.filter((n) => n.kind === 'session')) {
      const children = layout.nodes.filter((n) => n.parentId === session.id)
      const block = Math.max(SESSION_HEIGHT, children.length * 66 - 10)
      const blockBottom = blockTop + block

      expect(session.y).toBeGreaterThanOrEqual(blockTop)
      expect(session.y + session.height).toBeLessThanOrEqual(blockBottom)
      for (const child of children) {
        expect(child.y).toBeGreaterThanOrEqual(blockTop)
        expect(child.y + child.height).toBeLessThanOrEqual(blockBottom)
      }
      blockTop = blockBottom + 24
    }
  })

  it('emits one edge per subagent, each a cubic bezier path', () => {
    const map = mapOf([2, 3])
    const layout = layoutProjectMap(map)
    expect(layout.edges).toHaveLength(map.edges.length)
    expect(layout.edges).toHaveLength(5)
    for (const edge of layout.edges) {
      expect(edge.d).toMatch(/^M [\d.-]+ [\d.-]+ C /)
    }
  })

  it('starts each edge at the session right edge and ends at the subagent left edge', () => {
    const layout = layoutProjectMap(mapOf([1]))
    const [edge] = layout.edges
    const session = layout.nodes.find((n) => n.kind === 'session')!
    const child = layout.nodes.find((n) => n.kind === 'subagent')!
    const startX = session.x + session.width
    const startY = session.y + session.height / 2
    const endX = child.x
    const endY = child.y + child.height / 2
    expect(edge.d).toBe(`M ${startX} ${startY} C ${(startX + endX) / 2} ${startY}, ${(startX + endX) / 2} ${endY}, ${endX} ${endY}`)
  })

  it('reports width 560 for a non-empty map', () => {
    expect(layoutProjectMap(mapOf([1])).width).toBe(560)
  })
})
