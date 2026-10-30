import { describe, it, expect } from 'vitest'
import { MAX_SCALE, MIN_SCALE, boundsOf, clampScale, fitView, zoomAt } from './viewport'

const FIT = { padding: 20, minScale: 0.5, maxScale: 1, center: false }

describe('boundsOf', () => {
  it('is null with no nodes', () => {
    expect(boundsOf([])).toBeNull()
  })

  it('covers every node, including ones at negative positions', () => {
    expect(
      boundsOf([
        { x: 10, y: 20, width: 100, height: 50 },
        { x: -30, y: 200, width: 40, height: 10 },
      ]),
    ).toEqual({ minX: -30, minY: 20, maxX: 110, maxY: 210 })
  })
})

describe('clampScale', () => {
  it('keeps the zoom within the limits', () => {
    expect(clampScale(100)).toBe(MAX_SCALE)
    expect(clampScale(0.001)).toBe(MIN_SCALE)
    expect(clampScale(1)).toBe(1)
  })
})

describe('fitView', () => {
  const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 400 }

  it('shrinks a drawing that is wider than the view, down to the minimum scale', () => {
    const view = fitView(bounds, { width: 760, height: 600 }, FIT)
    expect(view.k).toBeCloseTo(0.72)
    expect(view.x).toBe(20)
    expect(view.y).toBe(20)
    expect(fitView(bounds, { width: 300, height: 600 }, FIT).k).toBe(0.5)
  })

  it('never enlarges past the maximum scale', () => {
    expect(fitView(bounds, { width: 4000, height: 3000 }, FIT).k).toBe(1)
  })

  it('centres the drawing when asked', () => {
    const view = fitView(bounds, { width: 2000, height: 1000 }, { ...FIT, center: true })
    expect(view.k).toBe(1)
    expect(view.x).toBe(500)
    expect(view.y).toBe(300)
  })

  it('accounts for a drawing that does not start at the origin', () => {
    const view = fitView({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, { width: 1000, height: 1000 }, FIT)
    expect(view.x).toBe(120)
    expect(view.y).toBe(70)
  })
})

describe('zoomAt', () => {
  it('keeps the map point under the cursor fixed', () => {
    const view = { x: 50, y: 30, k: 1 }
    const next = zoomAt(view, 2, 250, 130)
    expect(next.k).toBe(2)
    // The map point under (250, 130) was ((250 - 50) / 1, (130 - 30) / 1) = (200, 100).
    expect((250 - next.x) / next.k).toBeCloseTo(200)
    expect((130 - next.y) / next.k).toBeCloseTo(100)
  })

  it('stops at the zoom limits', () => {
    expect(zoomAt({ x: 0, y: 0, k: MAX_SCALE }, 2, 0, 0).k).toBe(MAX_SCALE)
    expect(zoomAt({ x: 0, y: 0, k: MIN_SCALE }, 0.5, 0, 0).k).toBe(MIN_SCALE)
  })
})
