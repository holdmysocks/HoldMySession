import { describe, it, expect } from 'vitest'
import { GUARD_HEADER, isSameOriginRequest } from './request-guard'

const req = (headers: Record<string, string>) => new Request('http://localhost:3000/api/x', { method: 'POST', headers })

describe('isSameOriginRequest', () => {
  it('needs the guard header', () => {
    expect(isSameOriginRequest(req({}))).toBe(false)
    expect(isSameOriginRequest(req({ [GUARD_HEADER]: '1' }))).toBe(true)
  })
  it('refuses a request that says it came from another site', () => {
    expect(isSameOriginRequest(req({ [GUARD_HEADER]: '1', origin: 'https://evil.example' }))).toBe(false)
    expect(isSameOriginRequest(req({ [GUARD_HEADER]: '1', origin: 'http://localhost:3000' }))).toBe(true)
  })
})
