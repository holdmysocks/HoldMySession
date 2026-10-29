import type { MapEdge, MapNode, ProjectMap } from './project-map'

/**
 * Pure grid layout for the project map. Each session owns a vertical block; its
 * subagents stack inside that block in a second column, and dispatch edges join
 * the two. Coordinates are in SVG user units, so the canvas can use a viewBox.
 */

export const SESSION_WIDTH = 260
export const SESSION_HEIGHT = 84
export const SUBAGENT_X = 320
export const SUBAGENT_WIDTH = 240
export const SUBAGENT_HEIGHT = 56
export const SUBAGENT_GAP = 10
const SUBAGENT_PITCH = SUBAGENT_HEIGHT + SUBAGENT_GAP
const BLOCK_GAP = 24
const CANVAS_WIDTH = SUBAGENT_X + SUBAGENT_WIDTH

export interface PositionedNode extends MapNode {
  x: number
  y: number
  width: number
  height: number
}

export interface PositionedEdge extends MapEdge {
  /** SVG path data for a cubic bezier from the session's right edge to the subagent's left edge. */
  d: string
}

export interface ProjectLayout {
  nodes: PositionedNode[]
  edges: PositionedEdge[]
  width: number
  height: number
}

function blockHeight(childCount: number): number {
  if (childCount === 0) return SESSION_HEIGHT
  return Math.max(SESSION_HEIGHT, childCount * SUBAGENT_PITCH - SUBAGENT_GAP)
}

function dispatchPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
}

export function layoutProjectMap(map: ProjectMap): ProjectLayout {
  const childrenByParent = new Map<string, MapNode[]>()
  const sessionNodes: MapNode[] = []

  for (const node of map.nodes) {
    if (node.parentId === null) {
      sessionNodes.push(node)
    } else {
      const siblings = childrenByParent.get(node.parentId) ?? []
      siblings.push(node)
      childrenByParent.set(node.parentId, siblings)
    }
  }

  const nodes: PositionedNode[] = []
  const positions = new Map<string, PositionedNode>()
  let blockTop = 0

  sessionNodes.forEach((session, index) => {
    const children = childrenByParent.get(session.id) ?? []
    const block = blockHeight(children.length)
    const sessionY = blockTop + (block - SESSION_HEIGHT) / 2

    const sessionPos: PositionedNode = {
      ...session,
      x: 0,
      y: sessionY,
      width: SESSION_WIDTH,
      height: SESSION_HEIGHT,
    }
    nodes.push(sessionPos)
    positions.set(session.id, sessionPos)

    children.forEach((child, childIndex) => {
      const childPos: PositionedNode = {
        ...child,
        x: SUBAGENT_X,
        y: blockTop + childIndex * SUBAGENT_PITCH,
        width: SUBAGENT_WIDTH,
        height: SUBAGENT_HEIGHT,
      }
      nodes.push(childPos)
      positions.set(child.id, childPos)
    })

    blockTop += block + (index < sessionNodes.length - 1 ? BLOCK_GAP : 0)
  })

  const edges: PositionedEdge[] = []
  for (const edge of map.edges) {
    const from = positions.get(edge.from)
    const to = positions.get(edge.to)
    if (!from || !to) continue
    edges.push({
      ...edge,
      d: dispatchPath(
        from.x + from.width,
        from.y + from.height / 2,
        to.x,
        to.y + to.height / 2,
      ),
    })
  }

  return {
    nodes,
    edges,
    width: sessionNodes.length === 0 ? 0 : CANVAS_WIDTH,
    height: blockTop,
  }
}
