import { compareVersions, parseVersion } from './version'

export const RELEASES_URL = 'https://github.com/holdmysocks/HoldMySession/releases'
const LATEST_URL = 'https://api.github.com/repos/holdmysocks/HoldMySession/releases/latest'
const CACHE_MS = 6 * 60 * 60_000

export interface UpdateInfo {
  current: string
  /** The newest published release, or null if it could not be found out. */
  latest: string | null
  available: boolean
  /** The page of that release, or of all releases. */
  url: string
}

type Fetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>

let cached: { at: number; latest: string | null; url: string } | null = null

/**
 * Asks GitHub for the newest published release and compares it with the running version. The answer
 * is kept for six hours, and any failure (no network, rate limit) just means "nothing to report". Draft
 * releases and pre-releases are not offered. Server only.
 */
export async function checkForUpdate(current: string, fetchImpl: Fetch = fetch as unknown as Fetch, now: number = Date.now()): Promise<UpdateInfo> {
  if (!cached || now - cached.at > CACHE_MS) {
    let latest: string | null = null
    let url = RELEASES_URL
    try {
      const response = await fetchImpl(LATEST_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'HoldMySession' },
        signal: AbortSignal.timeout(5_000),
      })
      if (response.ok) {
        const release = (await response.json()) as { tag_name?: unknown; html_url?: unknown }
        if (typeof release.tag_name === 'string' && parseVersion(release.tag_name)) latest = release.tag_name.replace(/^v/, '')
        if (typeof release.html_url === 'string' && release.html_url.startsWith('https://github.com/')) url = release.html_url
      }
    } catch {
      // Offline or limited: nothing to report.
    }
    cached = { at: now, latest, url }
  }
  return { current, latest: cached.latest, available: cached.latest !== null && compareVersions(cached.latest, current) > 0, url: cached.url }
}

/** For tests: forget the kept answer. */
export function resetUpdateCheck(): void {
  cached = null
}
