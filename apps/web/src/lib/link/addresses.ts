import * as os from 'node:os'

/** An address a node can use to reach this machine, with what kind of network it is on. */
export interface MachineAddress {
  url: string
  host: string
  kind: 'lan' | 'tailnet' | 'name' | 'other'
}

type Interfaces = ReturnType<typeof os.networkInterfaces>

const ipv4 = (a: string): number[] | null => {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(a)
  return m ? m.slice(1).map(Number) : null
}

/** 100.64.0.0/10, the range Tailscale gives its devices. */
export function isTailnetAddress(address: string): boolean {
  const p = ipv4(address)
  return !!p && p[0] === 100 && p[1] >= 64 && p[1] <= 127
}

function isPrivateLan(address: string): boolean {
  const p = ipv4(address)
  return !!p && (p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168))
}

/**
 * Every address of this computer a node could connect to: its tailnet and local-network addresses, then
 * its computer name. Loopback and link-local addresses are left out, since no other machine can use them.
 */
export function machineAddresses(port: number, interfaces: Interfaces = os.networkInterfaces(), hostname: string = os.hostname()): MachineAddress[] {
  const found: MachineAddress[] = []
  for (const list of Object.values(interfaces)) {
    for (const info of list ?? []) {
      if (info.family !== 'IPv4' || info.internal || info.address.startsWith('169.254.')) continue
      found.push({
        url: `http://${info.address}:${port}`,
        host: info.address,
        kind: isTailnetAddress(info.address) ? 'tailnet' : isPrivateLan(info.address) ? 'lan' : 'other',
      })
    }
  }
  const order = { lan: 0, tailnet: 1, other: 2, name: 3 }
  found.sort((a, b) => order[a.kind] - order[b.kind] || a.host.localeCompare(b.host))
  if (hostname) found.push({ url: `http://${hostname}:${port}`, host: hostname, kind: 'name' })
  return found
}

/** What a node needs to join a master, in one string to copy: every address of the master, and the token. */
export function makePairingCode(urls: string[], token: string): string {
  return 'hms1.' + Buffer.from(JSON.stringify({ u: urls, t: token }), 'utf-8').toString('base64url')
}

export function parsePairingCode(code: string): { urls: string[]; token: string } | null {
  const match = /^hms1\.([A-Za-z0-9_-]+)$/.exec(code.trim())
  if (!match) return null
  try {
    const parsed = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf-8')) as { u?: unknown; t?: unknown }
    if (!Array.isArray(parsed.u) || typeof parsed.t !== 'string' || parsed.t === '') return null
    const urls = parsed.u.filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 12)
    return urls.length > 0 ? { urls, token: parsed.t } : null
  } catch {
    return null
  }
}
