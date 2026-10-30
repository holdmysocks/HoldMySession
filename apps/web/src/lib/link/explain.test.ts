import { describe, it, expect } from 'vitest'
import { explainConnectionError } from './explain'

const err = (name: string, code?: string) => Object.assign(new Error('x'), { name, cause: code ? { code } : undefined })

describe('explainConnectionError', () => {
  const A = 'http://192.168.1.20:3000'
  it('says the master is not listening when the connection is refused', () => {
    expect(explainConnectionError(err('TypeError', 'ECONNREFUSED'), A)).toMatch(/not listening on the network.*Listen on the network/s)
  })
  it('points at the firewall when there is no answer', () => {
    expect(explainConnectionError(err('TimeoutError'), A)).toMatch(/firewall/)
    expect(explainConnectionError(err('TypeError', 'ETIMEDOUT'), A)).toMatch(/firewall/)
  })
  it('suggests the IP address when a name is not found, and the network when a host is unreachable', () => {
    expect(explainConnectionError(err('TypeError', 'ENOTFOUND'), 'http://pc:3000')).toMatch(/IP address/)
    expect(explainConnectionError(err('TypeError', 'EHOSTUNREACH'), A)).toMatch(/same network or tailnet/)
  })
  it('still says which address failed for anything else', () => {
    expect(explainConnectionError(new Error('weird'), A)).toBe(`Could not reach ${A}.`)
    expect(explainConnectionError(null, A)).toBe(`Could not reach ${A}.`)
  })
})
