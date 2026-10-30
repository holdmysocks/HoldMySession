import { describe, it, expect } from 'vitest'
import { GRID_SIZE, dragPositions, nodesInBox, snapToGrid, toggleId } from './editing'

describe('snapToGrid', () => {
  it('rounds to the nearest grid point', () => {
    expect(snapToGrid(0)).toBe(0)
    expect(snapToGrid(9)).toBe(0)
    expect(snapToGrid(10)).toBe(GRID_SIZE)
    expect(snapToGrid(47)).toBe(40)
    expect(snapToGrid(-11)).toBe(-20)
    expect(snapToGrid(-4)).toBe(0)
    expect(Object.is(snapToGrid(-4), 0)).toBe(true)
  })

  it('takes a grid size', () => {
    expect(snapToGrid(37, 25)).toBe(25)
  })
})

describe('dragPositions', () => {
  const origins = [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 330, y: 105 },
  ]

  it('moves every card by the same amount, following the pointer exactly when not snapping', () => {
    expect(dragPositions(origins, 'a', 47, 33, false)).toEqual([
      { id: 'a', x: 47, y: 33 },
      { id: 'b', x: 377, y: 138 },
    ])
  })

  it('puts the primary card on a grid point and keeps the others in step with it', () => {
    const moved = dragPositions(origins, 'a', 47, 33, true)
    expect(moved[0]).toEqual({ id: 'a', x: 40, y: 40 })
    // b keeps its offset from a: it was 330 right and 105 down.
    expect(moved[1]).toEqual({ id: 'b', x: 370, y: 145 })
  })

  it('snaps by the primary card even when it is not the first one', () => {
    const moved = dragPositions(origins, 'b', 12, 12, true)
    expect(moved[1]).toEqual({ id: 'b', x: 340, y: 120 })
    expect(moved[0]).toEqual({ id: 'a', x: 10, y: 15 })
  })

  it('is empty for nothing to move', () => {
    expect(dragPositions([], 'a', 5, 5, true)).toEqual([])
  })
})

describe('nodesInBox', () => {
  const nodes = [
    { id: 'a', x: 0, y: 0, width: 100, height: 50 },
    { id: 'b', x: 200, y: 0, width: 100, height: 50 },
    { id: 'c', x: 0, y: 200, width: 100, height: 50 },
  ]

  it('selects the cards a box touches, whichever corner it was drawn from', () => {
    expect(nodesInBox(nodes, { x0: -10, y0: -10, x1: 150, y1: 60 })).toEqual(['a'])
    expect(nodesInBox(nodes, { x0: 250, y0: 100, x1: 50, y1: -20 })).toEqual(['a', 'b'])
  })

  it('selects a card the box only overlaps a corner of, and none when the box is empty space', () => {
    expect(nodesInBox(nodes, { x0: 90, y0: 40, x1: 120, y1: 80 })).toEqual(['a'])
    expect(nodesInBox(nodes, { x0: 120, y0: 100, x1: 180, y1: 150 })).toEqual([])
  })

  it('does not count a card the box merely touches along an edge', () => {
    expect(nodesInBox(nodes, { x0: 100, y0: 0, x1: 150, y1: 50 })).toEqual([])
  })
})

describe('toggleId', () => {
  it('adds an id that is not there and removes one that is', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggleId([], 'a')).toEqual(['a'])
  })
})
