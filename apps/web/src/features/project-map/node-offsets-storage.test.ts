import { describe, it, expect, vi, afterEach } from 'vitest'
import { getStoredOffsets, parseNodeOffsets, setStoredOffsets, subscribeStoredOffsets } from './node-offsets-storage'

describe('parseNodeOffsets', () => {
  it('reads valid offsets', () => {
    expect(parseNodeOffsets('{"a":{"dx":10,"dy":-5}}')).toEqual({ a: { dx: 10, dy: -5 } })
  })

  it('is empty for nothing, bad JSON, or the wrong shape', () => {
    expect(parseNodeOffsets(null)).toEqual({})
    expect(parseNodeOffsets('{oops')).toEqual({})
    expect(parseNodeOffsets('[1,2]')).toEqual({})
    expect(parseNodeOffsets('"text"')).toEqual({})
  })

  it('drops entries that are not a finite number pair', () => {
    const raw = '{"good":{"dx":1,"dy":2},"text":{"dx":"1","dy":2},"missing":{"dx":1},"null":null,"num":5}'
    expect(parseNodeOffsets(raw)).toEqual({ good: { dx: 1, dy: 2 } })
  })
})

// Each test uses its own project key, because the store keeps what it has read for the page's life.
describe('node offsets store', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads an entry already in storage', () => {
    window.localStorage.setItem('session-map-offsets:existing', '{"a":{"dx":3,"dy":4}}')
    expect(parseNodeOffsets(getStoredOffsets('existing'))).toEqual({ a: { dx: 3, dy: 4 } })
  })

  it('is empty for a project with nothing stored', () => {
    expect(getStoredOffsets('nothing')).toBeNull()
  })

  it('saves per project and tells subscribers', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeStoredOffsets(listener)
    setStoredOffsets('p1', { a: { dx: 3, dy: 4 } })
    setStoredOffsets('p2', { b: { dx: 7, dy: 8 } })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(parseNodeOffsets(getStoredOffsets('p1'))).toEqual({ a: { dx: 3, dy: 4 } })
    expect(window.localStorage.getItem('session-map-offsets:p2')).toBe('{"b":{"dx":7,"dy":8}}')
    unsubscribe()
    setStoredOffsets('p1', {})
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('removes the entry when saving an empty set', () => {
    setStoredOffsets('removable', { a: { dx: 3, dy: 4 } })
    setStoredOffsets('removable', {})
    expect(window.localStorage.getItem('session-map-offsets:removable')).toBeNull()
    expect(getStoredOffsets('removable')).toBeNull()
  })

  it('keeps working in memory when storage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => setStoredOffsets('full', { a: { dx: 1, dy: 2 } })).not.toThrow()
    expect(parseNodeOffsets(getStoredOffsets('full'))).toEqual({ a: { dx: 1, dy: 2 } })
  })
})
