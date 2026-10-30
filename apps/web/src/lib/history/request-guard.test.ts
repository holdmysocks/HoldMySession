import { describe, it, expect } from 'vitest'
import { GUARD_HEADER, isSameOriginRequest } from './request-guard'

// A plain object, not a Request: the test environment's Request drops the Origin header, as a browser page would not.
const req = (headers: Record<string, string>) => ({
  url: 'http://localhost:3000/api/x',
  headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
})

describe('isSameOriginRequest', () => {
  it('needs the guard header', () => {
    expect(isSameOriginRequest(req({}))).toBe(false)
    expect(isSameOriginRequest(req({ [GUARD_HEADER]: '1' }))).toBe(true)
  })
  it('refuses a request that says it came from another site', () => {
    expect(isSameOriginRequest(req({ [GUARD_HEADER]: '1', origin: 'https://evil.example' }))).toBe(false)
    expect(isSameOriginRequest(req({ [GUARD_HEADER]: '1', origin: 'http://localhost:3000' }))).toBe(true)
  })
  it('refuses an origin that is not a URL', () => {
    expect(isSameOriginRequest(req({ [GUARD_HEADER]: '1', origin: 'null' }))).toBe(false)
  })
})
