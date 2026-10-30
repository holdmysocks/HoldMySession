import { describe, it, expect } from 'vitest'
import { isTailnetAddress, machineAddresses, makePairingCode, parsePairingCode } from './addresses'
import { ALLOWED_REMOTE, elevatedPowerShell, firewallState, requestFirewallRule, ruleCommand } from './firewall'

const iface = (address: string, extra: Record<string, unknown> = {}) => ({ address, family: 'IPv4', internal: false, ...extra }) as never

describe('machineAddresses', () => {
  it('lists local-network and tailnet addresses and the computer name, and leaves out loopback and link-local', () => {
    const list = machineAddresses(3000, {
      Ethernet: [iface('192.168.1.20'), { address: 'fe80::1', family: 'IPv6', internal: false } as never],
      Tailscale: [iface('100.101.102.103')],
      Loopback: [iface('127.0.0.1', { internal: true })],
      Odd: [iface('169.254.3.4')],
    }, 'DESKPC')
    expect(list).toEqual([
      { url: 'http://192.168.1.20:3000', host: '192.168.1.20', kind: 'lan' },
      { url: 'http://100.101.102.103:3000', host: '100.101.102.103', kind: 'tailnet' },
      { url: 'http://DESKPC:3000', host: 'DESKPC', kind: 'name' },
    ])
  })

  it('knows the tailnet range, which is 100.64.0.0 to 100.127.255.255', () => {
    expect(isTailnetAddress('100.64.0.1')).toBe(true)
    expect(isTailnetAddress('100.127.255.254')).toBe(true)
    expect(isTailnetAddress('100.63.0.1')).toBe(false)
    expect(isTailnetAddress('100.128.0.1')).toBe(false)
    expect(isTailnetAddress('192.168.1.1')).toBe(false)
  })
})

describe('the pairing code', () => {
  it('round-trips every address and the token', () => {
    const urls = ['http://192.168.1.20:3000', 'http://100.101.102.103:3000']
    expect(parsePairingCode(makePairingCode(urls, 'abc123'))).toEqual({ urls, token: 'abc123' })
    expect(parsePairingCode(`  ${makePairingCode(urls, 'abc123')}\n`)).toEqual({ urls, token: 'abc123' })
  })
  it('rejects anything else, and keeps only http and https addresses', () => {
    expect(parsePairingCode('hello')).toBeNull()
    expect(parsePairingCode('hms1.!!!')).toBeNull()
    expect(parsePairingCode(makePairingCode([], 'x'))).toBeNull()
    expect(parsePairingCode(makePairingCode(['ftp://a', 'http://ok:3000'], 'x'))?.urls).toEqual(['http://ok:3000'])
    expect(parsePairingCode(makePairingCode(['http://ok:3000'], ''))).toBeNull()
  })
})

describe('the firewall rule', () => {
  it('replaces the rule, for this port, for the local network and the tailnet only', () => {
    const cmd = ruleCommand(3000)
    expect(cmd).toContain('delete rule name=HoldMySession')
    expect(cmd).toContain('add rule name=HoldMySession dir=in action=allow protocol=TCP localport=3000 profile=any')
    expect(cmd).toContain(`remoteip=${ALLOWED_REMOTE}`)
    expect(ALLOWED_REMOTE).toBe('LocalSubnet,100.64.0.0/10')
  })
  it('asks Windows for permission through PowerShell, with the command safely quoted', () => {
    const args = elevatedPowerShell(8080)
    expect(args.slice(0, 2)).toEqual(['-NoProfile', '-WindowStyle'])
    const script = args[args.length - 1]
    expect(script).toContain('Start-Process -FilePath cmd.exe')
    expect(script).toContain('-Verb RunAs')
    expect(script).toContain('localport=8080')
  })
  it('does nothing on other systems', () => {
    expect(firewallState('darwin')).toBe('not-needed')
    expect(firewallState('linux')).toBe('not-needed')
    expect(requestFirewallRule(3000, 'darwin')).toBe(false)
  })
})
