import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Settings } from '@/features/settings/settings.types'

export function generateToken(): string {
  return randomBytes(24).toString('hex')
}

const digest = (s: string) => createHash('sha256').update(s).digest()

/**
 * Whether a request may speak to this master: this install is a master, it has a token, and the
 * request carries it as a bearer token. The comparison takes the same time however much matches.
 */
export function isAuthorizedNode(headers: { get(name: string): string | null }, settings: Settings): boolean {
  if (settings.link.role !== 'master' || settings.link.nodeToken === '') return false
  const header = headers.get('authorization') ?? ''
  const match = /^Bearer (.+)$/.exec(header)
  if (!match) return false
  return timingSafeEqual(digest(match[1]), digest(settings.link.nodeToken))
}
