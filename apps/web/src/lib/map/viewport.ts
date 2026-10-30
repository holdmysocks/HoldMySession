/**
 * Pure pan and zoom maths for the map canvas. A view maps map coordinates to screen pixels:
 * screen = map * k + (x, y). The canvas applies it as one transform on a group, so the drawing
 * itself never changes size.
 */

export interface MapView {
  /** Screen x of the map origin, in pixels. */
  x: number
  /** Screen y of the map origin, in pixels. */
  y: number
  /** Zoom factor: screen pixels per map unit. */
  k: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface ViewSize {
  width: number
  height: number
}

export interface FitOptions {
  /** Empty space kept around the drawing, in pixels. */
  padding: number
  minScale: number
  maxScale: number
  /** Centre the drawing in the view. Otherwise it is aligned to the top left. */
  center: boolean
}

export const MIN_SCALE = 0.15
export const MAX_SCALE = 3

export function clampScale(k: number, min: number = MIN_SCALE, max: number = MAX_SCALE): number {
  return Math.min(max, Math.max(min, k))
}

/** The box that holds every node, or null when there are none. */
export function boundsOf(
  nodes: ReadonlyArray<{ x: number; y: number; width: number; height: number }>,
): Bounds | null {
  if (nodes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + node.width)
    maxY = Math.max(maxY, node.y + node.height)
  }
  return { minX, minY, maxX, maxY }
}

/** A view that shows all of `bounds` in `size`, within the scale limits. */
export function fitView(bounds: Bounds, size: ViewSize, options: FitOptions): MapView {
  const contentWidth = Math.max(bounds.maxX - bounds.minX, 1)
  const contentHeight = Math.max(bounds.maxY - bounds.minY, 1)
  const availableWidth = Math.max(size.width - options.padding * 2, 1)
  const availableHeight = Math.max(size.height - options.padding * 2, 1)
  const k = clampScale(
    Math.min(availableWidth / contentWidth, availableHeight / contentHeight),
    options.minScale,
    options.maxScale,
  )
  return {
    k,
    x: options.center
      ? (size.width - contentWidth * k) / 2 - bounds.minX * k
      : options.padding - bounds.minX * k,
    y: options.center
      ? (size.height - contentHeight * k) / 2 - bounds.minY * k
      : options.padding - bounds.minY * k,
  }
}

/** Zoom by `factor` while the map point under screen position (px, py) stays where it is. */
export function zoomAt(view: MapView, factor: number, px: number, py: number): MapView {
  const k = clampScale(view.k * factor)
  const ratio = k / view.k
  return { k, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio }
}
