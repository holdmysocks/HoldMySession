import { describe, it, expect } from 'vitest'
import { NodePositionsSchema, ProjectKeySchema } from './layout-schema'

describe('NodePositionsSchema', () => {
  it('accepts positions by node id', () => {
    expect(NodePositionsSchema.safeParse({ 'session:a': { x: 10.5, y: -20 } }).success).toBe(true)
  })

  it('rejects non-numbers and huge values', () => {
    expect(NodePositionsSchema.safeParse({ a: { x: '1', y: 2 } }).success).toBe(false)
    expect(NodePositionsSchema.safeParse({ a: { x: 2_000_000, y: 0 } }).success).toBe(false)
  })

  it('rejects reserved keys, and never keeps a __proto__ key', () => {
    expect(NodePositionsSchema.safeParse({ constructor: { x: 1, y: 1 } }).success).toBe(false)
    expect(NodePositionsSchema.safeParse({ prototype: { x: 1, y: 1 } }).success).toBe(false)
    const parsed = NodePositionsSchema.safeParse(JSON.parse('{"__proto__":{"x":1,"y":1},"ok":{"x":2,"y":2}}'))
    expect(parsed.success && Object.hasOwn(parsed.data, '__proto__')).toBe(false)
    expect(parsed.success && parsed.data.ok).toEqual({ x: 2, y: 2 })
  })

  it('rejects an unreasonable number of nodes', () => {
    const many = Object.fromEntries(Array.from({ length: 5001 }, (_, i) => [`n${i}`, { x: 0, y: 0 }]))
    expect(NodePositionsSchema.safeParse(many).success).toBe(false)
  })
})

describe('ProjectKeySchema', () => {
  it('rejects empty and reserved keys', () => {
    expect(ProjectKeySchema.safeParse('').success).toBe(false)
    expect(ProjectKeySchema.safeParse('constructor').success).toBe(false)
    expect(ProjectKeySchema.safeParse('-home-user-app').success).toBe(true)
  })
})
