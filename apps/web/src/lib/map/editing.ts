/**
 * Pure helpers for the layout editor: the grid cards snap to, moving a group of cards together,
 * and which cards a selection box touches. Coordinates are map units, like the layout's.
 */

/** Spacing of the grid cards snap to, in map units. The dots drawn in editor mode sit on it. */
export const GRID_SIZE = 20

export function snapToGrid(value: number, grid: number = GRID_SIZE): number {
  // `+ 0` turns -0 into 0, so a snapped zero is a plain zero.
  return Math.round(value / grid) * grid + 0
}

export interface Placed {
  id: string
  x: number
  y: number
}

/**
 * Where each card in `origins` goes when the pointer has moved by (dx, dy). With `snap`, the
 * primary card, the one under the pointer, lands on a grid point, and the others move by the same
 * amount, so a group keeps its arrangement. Without it, everything follows the pointer exactly.
 */
export function dragPositions(
  origins: ReadonlyArray<Placed>,
  primaryId: string,
  dx: number,
  dy: number,
  snap: boolean,
  grid: number = GRID_SIZE,
): Placed[] {
  const primary = origins.find((origin) => origin.id === primaryId) ?? origins[0]
  if (!primary) return []
  const moveX = snap ? snapToGrid(primary.x + dx, grid) - primary.x : dx
  const moveY = snap ? snapToGrid(primary.y + dy, grid) - primary.y : dy
  return origins.map((origin) => ({ id: origin.id, x: origin.x + moveX, y: origin.y + moveY }))
}

/** A rectangle given by two corners, in any order. */
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** The IDs of the cards a box touches or contains, in their original order. */
export function nodesInBox(
  nodes: ReadonlyArray<{ id: string; x: number; y: number; width: number; height: number }>,
  box: Box,
): string[] {
  const left = Math.min(box.x0, box.x1)
  const right = Math.max(box.x0, box.x1)
  const top = Math.min(box.y0, box.y1)
  const bottom = Math.max(box.y0, box.y1)
  return nodes
    .filter((node) => node.x < right && node.x + node.width > left && node.y < bottom && node.y + node.height > top)
    .map((node) => node.id)
}

/** `ids` with `id` added, or removed when it is already there. */
export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id]
}
