import { describe, it, expect } from 'vitest'
import { uniqueOutputByFile } from './unique-output'

const entry = (id: string, startedAt: string, outputs: Record<string, number>, untracked = 0) => ({
  id,
  startedAt,
  requestOutputs: new Map(Object.entries(outputs)),
  untrackedOutputTokens: untracked,
})

describe('uniqueOutputByFile', () => {
  it('gives each file all of its output when nothing is shared', () => {
    const result = uniqueOutputByFile([entry('a', '2026-01-01', { r1: 10, r2: 20 }), entry('b', '2026-01-02', { r3: 5 })])
    expect(result.get('a')).toBe(30)
    expect(result.get('b')).toBe(5)
  })

  it('counts a request held by a parent and its fork for the parent only', () => {
    const result = uniqueOutputByFile([
      entry('fork', '2026-01-02', { r1: 10, r2: 20, r3: 7 }),
      entry('parent', '2026-01-01', { r1: 10, r2: 20 }),
    ])
    expect(result.get('parent')).toBe(30)
    expect(result.get('fork')).toBe(7)
    expect([...result.values()].reduce((a, b) => a + b, 0)).toBe(37)
  })

  it('always counts output that has no request ID, and keeps two files of one session ID apart', () => {
    const result = uniqueOutputByFile([
      entry('folder-a/s', '2026-01-01', { r1: 10 }, 3),
      entry('folder-b/s', '2026-01-01', { r1: 10 }, 4),
    ])
    expect(result.get('folder-a/s')).toBe(13)
    expect(result.get('folder-b/s')).toBe(4)
  })

  it('does not depend on the order of the list when start times tie', () => {
    const one = uniqueOutputByFile([entry('x', '2026-01-01', { r: 5 }), entry('y', '2026-01-01', { r: 5 })])
    const two = uniqueOutputByFile([entry('y', '2026-01-01', { r: 5 }), entry('x', '2026-01-01', { r: 5 })])
    expect(Object.fromEntries(one)).toEqual(Object.fromEntries(two))
  })
})
