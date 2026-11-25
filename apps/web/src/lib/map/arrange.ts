import { BLOCK_GAP, type ProjectLayout, type NodePositions, type PositionedNode } from './layout'
import { snapToGrid } from './editing'

/** Gap between one shelf of trees and the next. A multiple of the editor's grid. */
export const SHELF_GAP = 60

interface Tree {
  nodes: PositionedNode[]
  width: number
  height: number
  left: number
  top: number
  branch: string | null
  order: number
}

/** Every top-level session with the forks and subagents under it, each still laid out as the automatic layout draws it. */
function treesOf(layout: ProjectLayout): Tree[] {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]))
  const rootOf = (node: PositionedNode): string => {
    let current = node
    const seen = new Set<string>()
    while (current.parentId !== null && byId.has(current.parentId) && !seen.has(current.id)) {
      seen.add(current.id)
      current = byId.get(current.parentId)!
    }
    return current.id
  }
  const groups = new Map<string, PositionedNode[]>()
  for (const node of layout.nodes) {
    const root = rootOf(node)
    const list = groups.get(root) ?? []
    list.push(node)
    groups.set(root, list)
  }
  const order = new Map(layout.nodes.map((n, i) => [n.id, i]))
  return [...groups.entries()].map(([rootId, nodes]) => {
    const left = Math.min(...nodes.map((n) => n.x))
    const top = Math.min(...nodes.map((n) => n.y))
    return {
      nodes,
      left,
      top,
      width: Math.max(...nodes.map((n) => n.x + n.width)) - left,
      height: Math.max(...nodes.map((n) => n.y + n.height)) - top,
      branch: byId.get(rootId)?.branch ?? null,
      order: order.get(rootId) ?? 0,
    }
  })
}

/**
 * Trees on the same branch sit together, bigger groups first, and within a group the bigger trees come first,
 * so related sessions end up side by side and the shelves pack tightly.
 */
function sortTrees(trees: Tree[]): Tree[] {
  const groupSize = new Map<string, number>()
  for (const t of trees) groupSize.set(t.branch ?? '', (groupSize.get(t.branch ?? '') ?? 0) + t.nodes.length)
  return [...trees].sort((a, b) => {
    // Sessions with no branch go last, as one group.
    if ((a.branch === null) !== (b.branch === null)) return a.branch === null ? 1 : -1
    const g = (groupSize.get(b.branch ?? '') ?? 0) - (groupSize.get(a.branch ?? '') ?? 0)
    if (g !== 0) return g
    if (a.branch !== b.branch) return (a.branch ?? '') < (b.branch ?? '') ? -1 : 1
    return b.nodes.length - a.nodes.length || a.order - b.order
  })
}

interface Packed {
  at: Array<{ tree: Tree; x: number; y: number }>
  width: number
  height: number
}

/** Fills a row from the left and starts the next one below when the next tree would pass `limit`. */
function pack(trees: Tree[], limit: number): Packed {
  const at: Packed['at'] = []
  let x = 0
  let y = 0
  let rowHeight = 0
  let width = 0
  for (const tree of trees) {
    if (x > 0 && x + tree.width > limit) {
      y += rowHeight + SHELF_GAP
      x = 0
      rowHeight = 0
    }
    at.push({ tree, x, y })
    x += tree.width + BLOCK_GAP
    rowHeight = Math.max(rowHeight, tree.height)
    width = Math.max(width, x - BLOCK_GAP)
  }
  return { at, width, height: y + rowHeight }
}

/**
 * Positions that fit every session into a frame of the given shape. Each top-level session keeps its forks and
 * subagents under it, trees on the same branch are placed next to each other, and when they do not fit in one row the
 * rest goes on a new row below. The row width is the one that lets the whole drawing be shown biggest in the frame.
 * Returns a position for every card, on the editor's grid, starting at the origin.
 */
export function arrangeToFit(layout: ProjectLayout, frame: { width: number; height: number }): NodePositions {
  const trees = sortTrees(treesOf(layout))
  if (trees.length === 0) return {}
  const aspectFrame = frame.width > 0 && frame.height > 0 ? { width: frame.width, height: frame.height } : { width: 16, height: 9 }
  const widest = Math.max(...trees.map((t) => t.width))
  const total = trees.reduce((sum, t) => sum + t.width, 0) + BLOCK_GAP * (trees.length - 1)

  // Try every row width from the widest tree up to everything in one row, and keep the one shown biggest.
  let best: Packed | null = null
  let bestScale = -1
  for (let limit = widest; limit <= total + BLOCK_GAP; limit += BLOCK_GAP) {
    const packed = pack(trees, limit)
    const scale = Math.min(aspectFrame.width / Math.max(1, packed.width), aspectFrame.height / Math.max(1, packed.height))
    if (scale > bestScale + 1e-9) {
      best = packed
      bestScale = scale
    }
  }

  const out: NodePositions = {}
  for (const { tree, x, y } of best!.at) {
    for (const node of tree.nodes) {
      out[node.id] = { x: snapToGrid(x + node.x - tree.left), y: snapToGrid(y + node.y - tree.top) }
    }
  }
  return out
}
