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
  /** The file that installs the newest release on this system, when the release has one. */
  download: UpdateDownload | null
}

export interface UpdateDownload {
  version: string
  name: string
  url: string
  /** The release's SHA256SUMS.txt, which the download is checked against. */
  sumsUrl: string | null
}

export interface ReleaseAsset {
  name: string
  url: string
}

/**
 * The zip for this system among a release's files: `HoldMySession-<version>-<win|mac>-<arch>.zip`.
 * Null on a system that has no packaged build (Linux), or when the release has no such file.
 */
export function pickDownload(assets: ReleaseAsset[], version: string, platform: string, arch: string): UpdateDownload | null {
  const label = platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : null
  if (!label) return null
  const name = `HoldMySession-${version}-${label}-${arch}.zip`
  const zip = assets.find((a) => a.name === name)
  if (!zip) return null
  return { version, name, url: zip.url, sumsUrl: assets.find((a) => a.name === 'SHA256SUMS.txt')?.url ?? null }
}

type Fetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>

let cached: { at: number; latest: string | null; url: string; assets: ReleaseAsset[] } | null = null

/**
 * Asks GitHub for the newest published release and compares it with the running version. The answer
 * is kept for six hours, and any failure (no network, rate limit) just means "nothing to report". Draft
 * releases and pre-releases are not offered. Server only.
 */
export async function checkForUpdate(
  current: string,
  fetchImpl: Fetch = fetch as unknown as Fetch,
  now: number = Date.now(),
  /** Ask GitHub again even if the kept answer is recent: for the Check for updates button. */
  force = false,
): Promise<UpdateInfo> {
  if (force || !cached || now - cached.at > CACHE_MS) {
    let latest: string | null = null
    let url = RELEASES_URL
    let assets: ReleaseAsset[] = []
    try {
      const response = await fetchImpl(LATEST_URL, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'HoldMySession' },
        signal: AbortSignal.timeout(5_000),
      })
      if (response.ok) {
        const release = (await response.json()) as { tag_name?: unknown; html_url?: unknown; assets?: unknown }
        if (typeof release.tag_name === 'string' && parseVersion(release.tag_name)) latest = release.tag_name.replace(/^v/, '')
        if (Array.isArray(release.assets)) {
          assets = release.assets.flatMap((a: { name?: unknown; browser_download_url?: unknown }) =>
            typeof a?.name === 'string' && typeof a.browser_download_url === 'string' && a.browser_download_url.startsWith('https://github.com/')
              ? [{ name: a.name, url: a.browser_download_url }]
              : [],
          )
        }
        if (typeof release.html_url === 'string' && release.html_url.startsWith('https://github.com/')) url = release.html_url
      }
    } catch {
      // Offline or limited: nothing to report.
    }
    cached = { at: now, latest, url, assets }
  }
  const available = cached.latest !== null && compareVersions(cached.latest, current) > 0
  return {
    current,
    latest: cached.latest,
    available,
    url: cached.url,
    download: available ? pickDownload(cached.assets, cached.latest!, process.platform, process.arch) : null,
  }
}

/** For tests: forget the kept answer. */
export function resetUpdateCheck(): void {
  cached = null
}
