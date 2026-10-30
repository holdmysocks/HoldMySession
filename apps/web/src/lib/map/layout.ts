import type { MapEdge, MapNode, ProjectMap } from './project-map'

/**
 * Pure tree layout for the project map. Each depth is a column: top-level sessions in the
 * first column, their forks and subagents in the second, forks of forks in the third, and
 * so on. A parent is centred on the block of its children, and every block is stacked
 * without overlap. Coordinates are in SVG user units, so the canvas can use a viewBox.
 */

export const SESSION_WIDTH = 280
export const SESSION_HEIGHT = 92
export const SUBAGENT_WIDTH = 190
export const SUBAGENT_HEIGHT = 50
export const SUBAGENT_GAP = 10
/** Gap between the right edge of one column and the left edge of the next. */
const COLUMN_GAP = 60
/** Gap between sibling blocks under the same parent. */
const SIBLING_GAP = 10
/** Gap between top-level session blocks. */
const BLOCK_GAP = 24

/** x of the first child column: a session column plus the gap. Subagent cards start here. */
export const SUBAGENT_X = SESSION_WIDTH + COLUMN_GAP

export interface PositionedNode extends MapNode {
  x: number
  y: number
  width: number
  height: number
}

export interface PositionedEdge extends MapEdge {
  /** SVG path data for a cubic bezier from the parent's right edge to the child's left edge. */
  d: string
}

/**
 * How far the user dragged a node from its automatic position in the editor, by node ID. Offsets
 * rather than absolute positions, so a node keeps its place relative to the layout when sessions
 * are added or removed.
 */
export type NodeOffsets = Record<string, { dx: number; dy: number }>

export interface ProjectLayout {
  nodes: PositionedNode[]
  edges: PositionedEdge[]
  width: number
  height: number
}

function nodeWidth(node: MapNode): number {
  return node.kind === 'session' ? SESSION_WIDTH : SUBAGENT_WIDTH
}

function nodeHeight(node: MapNode): number {
  return node.kind === 'session' ? SESSION_HEIGHT : SUBAGENT_HEIGHT
}

/** Forks before subagent cards under the same parent. Otherwise input order is kept. */
function siblingRank(node: MapNode): number {
  return node.kind === 'session' ? 0 : 1
}

function dispatchPath(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
}

export function layoutProjectMap(map: ProjectMap): ProjectLayout {
  const byId = new Map<string, MapNode>()
  const childrenOf = new Map<string, MapNode[]>()
  const roots: MapNode[] = []

  for (const node of map.nodes) {
    byId.set(node.id, node)
  }
  for (const node of map.nodes) {
    if (node.parentId === null || !byId.has(node.parentId)) {
      roots.push(node)
      continue
    }
    const siblings = childrenOf.get(node.parentId) ?? []
    siblings.push(node)
    childrenOf.set(node.parentId, siblings)
  }
  for (const siblings of childrenOf.values()) {
    siblings.sort((a, b) => siblingRank(a) - siblingRank(b))
  }

  // Column x positions: each column is as wide as its widest node.
  const columnWidth: number[] = []
  const depthOf = new Map<string, number>()
  const queue: Array<{ node: MapNode; depth: number }> = roots.map((node) => ({ node, depth: 0 }))
  while (queue.length > 0) {
    const { node, depth } = queue.shift()!
    if (depthOf.has(node.id)) continue
    depthOf.set(node.id, depth)
    columnWidth[depth] = Math.max(columnWidth[depth] ?? 0, nodeWidth(node))
    for (const child of childrenOf.get(node.id) ?? []) {
      queue.push({ node: child, depth: depth + 1 })
    }
  }
  const columnX: number[] = []
  let x = 0
  for (let depth = 0; depth < columnWidth.length; depth++) {
    columnX[depth] = x
    x += columnWidth[depth] + COLUMN_GAP
  }

  const positions = new Map<string, PositionedNode>()
  const nodes: PositionedNode[] = []

  // Returns the height of the block this subtree occupies, starting at `top`.
  function place(node: MapNode, top: number): number {
    const children = childrenOf.get(node.id) ?? []
    let cursor = top
    children.forEach((child, index) => {
      cursor += place(child, cursor) + (index < children.length - 1 ? SIBLING_GAP : 0)
    })
    const childrenHeight = cursor - top
    const block = Math.max(nodeHeight(node), childrenHeight)
    const depth = depthOf.get(node.id) ?? 0
    const positioned: PositionedNode = {
      ...node,
      x: columnX[depth],
      y: top + (block - nodeHeight(node)) / 2,
      width: nodeWidth(node),
      height: nodeHeight(node),
    }
    positions.set(node.id, positioned)
    nodes.push(positioned)
    return block
  }

  let blockTop = 0
  roots.forEach((root, index) => {
    blockTop += place(root, blockTop) + (index < roots.length - 1 ? BLOCK_GAP : 0)
  })

  // Placement finishes children first. Return nodes in model order, so keyboard focus
  // follows the order of sessions and then subagents.
  const modelOrder = new Map(map.nodes.map((node, index) => [node.id, index]))
  nodes.sort((a, b) => (modelOrder.get(a.id) ?? 0) - (modelOrder.get(b.id) ?? 0))

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

  const lastColumn = columnWidth.length - 1
  return {
    nodes,
    edges,
    width: roots.length === 0 ? 0 : columnX[lastColumn] + columnWidth[lastColumn],
    height: blockTop,
  }
}

/**
 * The layout with each node moved by its offset and the edges redrawn to follow. Returns the same
 * layout when nothing is moved. Offsets for nodes that no longer exist are ignored.
 */
export function applyNodeOffsets(layout: ProjectLayout, offsets: NodeOffsets): ProjectLayout {
  const offsetOf = (id: string) => (Object.hasOwn(offsets, id) ? offsets[id] : undefined)
  if (!layout.nodes.some((node) => {
    const offset = offsetOf(node.id)
    return offset !== undefined && (offset.dx !== 0 || offset.dy !== 0)
  })) {
    return layout
  }

  const nodes = layout.nodes.map((node) => {
    const offset = offsetOf(node.id)
    return offset ? { ...node, x: node.x + offset.dx, y: node.y + offset.dy } : node
  })
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const edges = layout.edges.map((edge) => {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (!from || !to) return edge
    return {
      ...edge,
      d: dispatchPath(from.x + from.width, from.y + from.height / 2, to.x, to.y + to.height / 2),
    }
  })
  return {
    nodes,
    edges,
    width: nodes.reduce((max, node) => Math.max(max, node.x + node.width), 0),
    height: nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0),
  }
}
