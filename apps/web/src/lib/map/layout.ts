import type { MapEdge, MapNode, ProjectMap } from './project-map'

/**
 * Pure tree layout for the project map. Each depth is a row: top-level sessions side by side in
 * the first row, their forks and subagents below them in the second, forks of forks in the third,
 * and so on, so the branches grow downward. A parent is centred over the block of its children,
 * and every block sits beside its neighbours without overlap. Coordinates are in SVG user units,
 * so the canvas can scale them.
 *
 * `applyCustomPositions` then lays the user's saved positions over this automatic layout.
 */

export const SESSION_WIDTH = 280
export const SESSION_HEIGHT = 92
export const SUBAGENT_WIDTH = 190
export const SUBAGENT_HEIGHT = 50
/** Gap between the bottom of one row and the top of the next. Room for the link lines. */
export const ROW_GAP = 70
/** Gap between sibling blocks under the same parent. */
export const SIBLING_GAP = 16
/** Gap between top-level session blocks. */
export const BLOCK_GAP = 40

export interface PositionedNode extends MapNode {
  x: number
  y: number
  width: number
  height: number
}

export interface PositionedEdge extends MapEdge {
  /** SVG path data for a cubic bezier between the middles of the two cards' closest sides. */
  d: string
}

export interface ProjectLayout {
  nodes: PositionedNode[]
  edges: PositionedEdge[]
  width: number
  height: number
}

/** Where the user put each node, by node ID, as its top-left corner. */
export type NodePositions = Record<string, { x: number; y: number }>

interface Rect {
  x: number
  y: number
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

type Side = 'top' | 'bottom' | 'left' | 'right'

function sideMiddle(rect: Rect, side: Side): { x: number; y: number } {
  switch (side) {
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y }
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 }
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
  }
}

/**
 * The line between two cards: from the middle of one side of `from` to the middle of the facing
 * side of `to`.
 * - A card that lies below links bottom to top, and a card above links top to bottom, however far
 *   it sits to the side. A branch reads as hanging from its parent.
 * - Otherwise, a card that lies to the right links right to left, and one to the left links left
 *   to right.
 * - When the cards overlap, the direction of the target's centre decides.
 * A side is only used when the other card is really beyond it, so a line never doubles back
 * across a card.
 */
export function edgePath(from: Rect, to: Rect): string {
  let a: Side
  let b: Side
  if (to.y >= from.y + from.height) {
    ;[a, b] = ['bottom', 'top']
  } else if (to.y + to.height <= from.y) {
    ;[a, b] = ['top', 'bottom']
  } else if (to.x >= from.x + from.width) {
    ;[a, b] = ['right', 'left']
  } else if (to.x + to.width <= from.x) {
    ;[a, b] = ['left', 'right']
  } else {
    const dx = to.x + to.width / 2 - (from.x + from.width / 2)
    const dy = to.y + to.height / 2 - (from.y + from.height / 2)
    if (Math.abs(dy) >= Math.abs(dx)) [a, b] = dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
    else [a, b] = dx >= 0 ? ['right', 'left'] : ['left', 'right']
  }

  const p = sideMiddle(from, a)
  const q = sideMiddle(to, b)
  if (a === 'top' || a === 'bottom') {
    const midY = (p.y + q.y) / 2
    return `M ${p.x} ${p.y} C ${p.x} ${midY}, ${q.x} ${midY}, ${q.x} ${q.y}`
  }
  const midX = (p.x + q.x) / 2
  return `M ${p.x} ${p.y} C ${midX} ${p.y}, ${midX} ${q.y}, ${q.x} ${q.y}`
}

function buildEdges(edgeList: ReadonlyArray<MapEdge>, nodes: ReadonlyArray<PositionedNode>): PositionedEdge[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const edges: PositionedEdge[] = []
  for (const edge of edgeList) {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (from && to) edges.push({ ...edge, d: edgePath(from, to) })
  }
  return edges
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

  // Row y positions: each row is as tall as its tallest node.
  const rowHeight: number[] = []
  const depthOf = new Map<string, number>()
  const queue: Array<{ node: MapNode; depth: number }> = roots.map((node) => ({ node, depth: 0 }))
  while (queue.length > 0) {
    const { node, depth } = queue.shift()!
    if (depthOf.has(node.id)) continue
    depthOf.set(node.id, depth)
    rowHeight[depth] = Math.max(rowHeight[depth] ?? 0, nodeHeight(node))
    for (const child of childrenOf.get(node.id) ?? []) {
      queue.push({ node: child, depth: depth + 1 })
    }
  }
  const rowY: number[] = []
  let y = 0
  for (let depth = 0; depth < rowHeight.length; depth++) {
    rowY[depth] = y
    y += rowHeight[depth] + ROW_GAP
  }

  // Width of the block a subtree occupies: its widest of the node itself and its children side by side.
  const blockWidth = new Map<string, number>()
  function measure(node: MapNode): number {
    const children = childrenOf.get(node.id) ?? []
    const childrenWidth =
      children.reduce((sum, child) => sum + measure(child), 0) + Math.max(0, children.length - 1) * SIBLING_GAP
    const width = Math.max(nodeWidth(node), childrenWidth)
    blockWidth.set(node.id, width)
    return width
  }

  const positioned: PositionedNode[] = []

  // Places the block of `node` starting at `left`. The node is centred in its block, and the
  // children, side by side, are centred under it.
  function place(node: MapNode, left: number): void {
    const block = blockWidth.get(node.id) ?? nodeWidth(node)
    const depth = depthOf.get(node.id) ?? 0
    const height = nodeHeight(node)
    positioned.push({
      ...node,
      x: left + (block - nodeWidth(node)) / 2,
      // Centred in the row, so a short subagent card lines up with the taller session cards.
      y: rowY[depth] + (rowHeight[depth] - height) / 2,
      width: nodeWidth(node),
      height,
    })
    const children = childrenOf.get(node.id) ?? []
    const childrenWidth =
      children.reduce((sum, child) => sum + (blockWidth.get(child.id) ?? 0), 0) +
      Math.max(0, children.length - 1) * SIBLING_GAP
    let cursor = left + (block - childrenWidth) / 2
    for (const child of children) {
      place(child, cursor)
      cursor += (blockWidth.get(child.id) ?? 0) + SIBLING_GAP
    }
  }

  let blockLeft = 0
  roots.forEach((root, index) => {
    const width = measure(root)
    place(root, blockLeft)
    blockLeft += width + (index < roots.length - 1 ? BLOCK_GAP : 0)
  })

  // Placement visits parents first. Return nodes in model order, so keyboard focus follows the
  // order of sessions and then subagents.
  const modelOrder = new Map(map.nodes.map((node, index) => [node.id, index]))
  positioned.sort((a, b) => (modelOrder.get(a.id) ?? 0) - (modelOrder.get(b.id) ?? 0))

  return {
    nodes: positioned,
    edges: buildEdges(map.edges, positioned),
    width: roots.length === 0 ? 0 : blockLeft,
    height: roots.length === 0 ? 0 : y - ROW_GAP,
  }
}

function hasPosition(positions: NodePositions, id: string): boolean {
  if (!Object.hasOwn(positions, id)) return false
  const position = positions[id] as { x?: unknown; y?: unknown } | null | undefined
  return Number.isFinite(position?.x) && Number.isFinite(position?.y)
}

/**
 * The layout with the user's saved positions laid over it, and the edges redrawn to follow.
 * Returns the same layout when no node has a saved position, so a project nobody has edited keeps
 * the automatic layout, including its ordering.
 *
 * Nodes that are not saved yet are placed like this:
 * - A new top-level session goes to the right of everything saved, level with the top of the saved
 *   top-level sessions, and takes its own forks and subagents with it.
 * - A new subagent or fork of a saved session lands at its normal automatic position, even if that
 *   overlaps something. The user can move it.
 * Saved positions for nodes that no longer exist are ignored.
 */
export function applyCustomPositions(
  layout: ProjectLayout,
  positions: NodePositions,
): ProjectLayout {
  const saved = layout.nodes.filter((node) => hasPosition(positions, node.id))
  if (saved.length === 0) return layout

  const byId = new Map(layout.nodes.map((node) => [node.id, node]))
  const isSaved = (node: PositionedNode) => hasPosition(positions, node.id)
  const isRoot = (node: PositionedNode) => node.parentId === null || !byId.has(node.parentId)

  const childrenOf = new Map<string, PositionedNode[]>()
  for (const node of layout.nodes) {
    if (isRoot(node)) continue
    const siblings = childrenOf.get(node.parentId!) ?? []
    siblings.push(node)
    childrenOf.set(node.parentId!, siblings)
  }

  const rightEdge = Math.max(...saved.map((node) => positions[node.id].x + node.width))
  const savedRoots = saved.filter(isRoot)
  const topY = Math.min(...(savedRoots.length > 0 ? savedRoots : saved).map((node) => positions[node.id].y))

  // Each new top-level session and its unsaved descendants move together, as one block.
  const shift = new Map<string, { dx: number; dy: number }>()
  let cursor = rightEdge + BLOCK_GAP
  const newRoots = layout.nodes.filter((node) => isRoot(node) && !isSaved(node)).sort((a, b) => a.x - b.x)
  for (const root of newRoots) {
    const members: PositionedNode[] = []
    const stack = [root]
    while (stack.length > 0) {
      const node = stack.pop()!
      members.push(node)
      for (const child of childrenOf.get(node.id) ?? []) {
        if (!isSaved(child)) stack.push(child)
      }
    }
    const left = Math.min(...members.map((m) => m.x))
    const right = Math.max(...members.map((m) => m.x + m.width))
    const delta = { dx: cursor - left, dy: topY - root.y }
    for (const member of members) shift.set(member.id, delta)
    cursor += right - left + BLOCK_GAP
  }

  const nodes = layout.nodes.map((node) => {
    if (isSaved(node)) return { ...node, x: positions[node.id].x, y: positions[node.id].y }
    const move = shift.get(node.id)
    return move ? { ...node, x: node.x + move.dx, y: node.y + move.dy } : node
  })

  return {
    nodes,
    edges: buildEdges(layout.edges, nodes),
    width: nodes.reduce((max, node) => Math.max(max, node.x + node.width), 0),
    height: nodes.reduce((max, node) => Math.max(max, node.y + node.height), 0),
  }
}
