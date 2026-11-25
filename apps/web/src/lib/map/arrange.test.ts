import { describe, expect, it } from 'vitest'
import { arrangeToFit } from './arrange'
import { layoutProjectMap } from './layout'
import type { MapNode, ProjectMap } from './project-map'

const node = (id: string, parentId: string | null, branch: string | null = 'main', kind: 'session' | 'subagent' = 'session'): MapNode =>
  ({ id, kind, sessionId: id, parentId, title: id, subtitle: '', branch, projectDisplayName: null, backgroundTaskCount: 0, parentRelation: parentId ? 'fork' : null, status: 'idle', needsYou: false }) as unknown as MapNode

const mapOf = (nodes: MapNode[]): ProjectMap =>
  ({ nodes, edges: nodes.filter((n) => n.parentId).map((n) => ({ from: n.parentId!, to: n.id, kind: 'fork' })) }) as unknown as ProjectMap

const overlap = (a: { x: number; y: number }, b: { x: number; y: number }, w = 280, h = 100) =>
  a.x < b.x + w && b.x < a.x + w && a.y < b.y + h && b.y < a.y + h

describe('arrangeToFit', () => {
  const many = Array.from({ length: 12 }, (_, i) => node(`s${i}`, null, i % 2 ? 'a' : 'b'))
  const layout = layoutProjectMap(mapOf(many))

  it('gives every card a place on the grid, with none on top of another', () => {
    const p = arrangeToFit(layout, { width: 1200, height: 700 })
    expect(Object.keys(p)).toHaveLength(12)
    const all = Object.values(p)
    all.forEach((a) => {
      expect(a.x % 20).toBe(0)
      expect(a.y % 20).toBe(0)
    })
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlap(all[i], all[j])).toBe(false)
  })

  it('wraps to rows below instead of one long row, for a frame that is not very wide', () => {
    const p = arrangeToFit(layout, { width: 900, height: 900 })
    expect(new Set(Object.values(p).map((q) => q.y)).size).toBeGreaterThan(1)
  })

  it('keeps one long row when the frame is wide and short', () => {
    const p = arrangeToFit(layout, { width: 20000, height: 200 })
    expect(new Set(Object.values(p).map((q) => q.y)).size).toBe(1)
  })

  it('keeps forks and subagents under their parent and trees on one branch together', () => {
    const nodes = [node('a1', null, 'x'), node('b1', null, 'y'), node('a2', null, 'x'), node('a1f', 'a1', 'x'), node('a1s', 'a1', null, 'subagent')]
    const p = arrangeToFit(layoutProjectMap(mapOf(nodes)), { width: 3000, height: 800 })
    expect(p['a1f'].y).toBeGreaterThan(p['a1'].y)
    expect(p['a1s'].y).toBeGreaterThan(p['a1'].y)
    // a1 and a2 share a branch, so b1 is not between them.
    const xs = ['a1', 'a2', 'b1'].map((id) => p[id].x)
    expect(Math.abs(p['a1'].x - p['a2'].x)).toBeLessThan(Math.abs(p['a1'].x - p['b1'].x) + 1)
    expect(xs.every(Number.isFinite)).toBe(true)
  })

  it('is empty for an empty map', () => {
    expect(arrangeToFit({ nodes: [], edges: [], width: 0, height: 0 }, { width: 100, height: 100 })).toEqual({})
  })
})
