import { describe, it, expect } from 'vitest'
import { findCwd, findForkedFrom, parseRecord } from './session-head'
import type { RawJsonlMessage } from './types'

describe('findCwd', () => {
  it('returns the cwd of the first record that has one', () => {
    const records = [{ type: 'summary' }, { type: 'user', cwd: 'D:\\MCLA' }, { type: 'user', cwd: '/other' }] as RawJsonlMessage[]
    expect(findCwd(records)).toBe('D:\\MCLA')
  })

  it('skips blank and non-string cwd values', () => {
    const records = [{ type: 'user', cwd: '  ' }, { type: 'user', cwd: 3 }, { type: 'user', cwd: '/x' }] as unknown as RawJsonlMessage[]
    expect(findCwd(records)).toBe('/x')
  })

  it('returns null when no record has a cwd', () => {
    expect(findCwd([{ type: 'summary' }] as RawJsonlMessage[])).toBeNull()
    expect(findCwd([])).toBeNull()
  })
})

describe('findForkedFrom', () => {
  it('reads the parent session and message from a copied record', () => {
    const records = [
      { type: 'user' },
      { type: 'user', forkedFrom: { sessionId: 'parent-1', messageUuid: 'm-9' } },
    ] as RawJsonlMessage[]
    expect(findForkedFrom(records)).toEqual({ sessionId: 'parent-1', messageUuid: 'm-9' })
  })

  it('keeps a null message uuid when it is missing', () => {
    const records = [{ type: 'user', forkedFrom: { sessionId: 'p' } }] as RawJsonlMessage[]
    expect(findForkedFrom(records)).toEqual({ sessionId: 'p', messageUuid: null })
  })

  it('ignores a forkedFrom without a usable session id', () => {
    const records = [{ type: 'user', forkedFrom: { sessionId: '' } }, { type: 'user', forkedFrom: null }] as unknown as RawJsonlMessage[]
    expect(findForkedFrom(records)).toBeNull()
  })
})

describe('parseRecord', () => {
  it('returns null for blank, invalid, and non-object lines', () => {
    expect(parseRecord('   ')).toBeNull()
    expect(parseRecord('{not json')).toBeNull()
    expect(parseRecord('[1,2]')).toBeNull()
    expect(parseRecord('null')).toBeNull()
  })

  it('parses an object line', () => {
    expect(parseRecord('{"type":"summary"}')).toEqual({ type: 'summary' })
  })
})
