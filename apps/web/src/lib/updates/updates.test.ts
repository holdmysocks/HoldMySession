import { describe, it, expect, beforeEach } from 'vitest'
import { compareVersions, parseVersion } from './version'
import { checkForUpdate, pickDownload, resetUpdateCheck, RELEASES_URL } from './update-check'

describe('versions', () => {
  it('reads plain and tagged versions', () => {
    expect(parseVersion('0.6.0')).toEqual([0, 6, 0])
    expect(parseVersion('v1.12.3')).toEqual([1, 12, 3])
    expect(parseVersion('v1.0.0-beta.1')).toEqual([1, 0, 0])
    expect(parseVersion('latest')).toBeNull()
    expect(parseVersion('1.2')).toBeNull()
  })
  it('orders them by number, not by text', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('0.6.0', '0.6.1')).toBeLessThan(0)
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('unknown', '1.0.0')).toBe(0)
  })
})

describe('checkForUpdate', () => {
  beforeEach(resetUpdateCheck)
  const reply = (body: unknown, ok = true) => async () => ({ ok, json: async () => body })

  it('says a newer release is available, with its page', async () => {
    const info = await checkForUpdate('0.6.0', reply({ tag_name: 'v0.7.0', html_url: 'https://github.com/holdmysocks/HoldMySession/releases/tag/v0.7.0' }))
    expect(info).toMatchObject({ current: '0.6.0', latest: '0.7.0', available: true, url: 'https://github.com/holdmysocks/HoldMySession/releases/tag/v0.7.0' })
  })
  it('says nothing when up to date, or ahead of the newest release', async () => {
    expect((await checkForUpdate('0.7.0', reply({ tag_name: 'v0.7.0' }))).available).toBe(false)
    resetUpdateCheck()
    expect((await checkForUpdate('0.8.0', reply({ tag_name: 'v0.7.0' }))).available).toBe(false)
  })
  it('reports nothing when GitHub cannot be reached or answers badly, and links to the releases', async () => {
    const failing = await checkForUpdate('0.6.0', async () => { throw new Error('offline') })
    expect(failing).toEqual({ current: '0.6.0', latest: null, available: false, url: RELEASES_URL, download: null })
    resetUpdateCheck()
    expect((await checkForUpdate('0.6.0', reply({}, false))).latest).toBeNull()
    resetUpdateCheck()
    expect((await checkForUpdate('0.6.0', reply({ tag_name: 'nightly' }))).latest).toBeNull()
  })
  it('does not follow a link to anywhere but GitHub', async () => {
    const info = await checkForUpdate('0.6.0', reply({ tag_name: 'v0.7.0', html_url: 'https://evil.example/x' }))
    expect(info.url).toBe(RELEASES_URL)
  })
  it('keeps the answer for a while instead of asking every time', async () => {
    let calls = 0
    const counting = async () => { calls += 1; return { ok: true, json: async () => ({ tag_name: 'v0.7.0' }) } }
    await checkForUpdate('0.6.0', counting, 1_000)
    await checkForUpdate('0.6.0', counting, 2_000)
    expect(calls).toBe(1)
    await checkForUpdate('0.6.0', counting, 1_000 + 7 * 60 * 60_000)
    expect(calls).toBe(2)
  })
})

describe('pickDownload', () => {
  const assets = [
    { name: 'HoldMySession-0.7.0-win-x64.zip', url: 'https://github.com/x/y/win.zip' },
    { name: 'HoldMySession-0.7.0-mac-arm64.zip', url: 'https://github.com/x/y/mac.zip' },
    { name: 'SHA256SUMS.txt', url: 'https://github.com/x/y/sums.txt' },
  ]

  it('picks the zip for this system and its checksums', () => {
    expect(pickDownload(assets, '0.7.0', 'win32', 'x64')).toEqual({
      version: '0.7.0', name: 'HoldMySession-0.7.0-win-x64.zip', url: 'https://github.com/x/y/win.zip', sumsUrl: 'https://github.com/x/y/sums.txt',
    })
    expect(pickDownload(assets, '0.7.0', 'darwin', 'arm64')?.url).toBe('https://github.com/x/y/mac.zip')
  })

  it('finds nothing for a system with no build, or an architecture the release lacks', () => {
    expect(pickDownload(assets, '0.7.0', 'linux', 'x64')).toBeNull()
    expect(pickDownload(assets, '0.7.0', 'darwin', 'x64')).toBeNull()
    expect(pickDownload([], '0.7.0', 'win32', 'x64')).toBeNull()
  })

  it('has no checksums link when the release has none', () => {
    expect(pickDownload(assets.slice(0, 1), '0.7.0', 'win32', 'x64')?.sumsUrl).toBeNull()
  })
})

describe('checkForUpdate downloads', () => {
  const release = { tag_name: 'v0.7.0', assets: [{ name: 'HoldMySession-0.7.0-win-x64.zip', browser_download_url: 'https://github.com/x/y/win.zip' }] }
  const answer = async () => ({ ok: true, json: async () => release })

  it('offers no download on a system with no build, even when a newer release exists', async () => {
    resetUpdateCheck()
    const info = await checkForUpdate('0.6.0', answer, Date.now(), true)
    expect(info.available).toBe(true)
    // The tests run on Linux, which has no packaged build.
    expect(info.download).toBeNull()
    resetUpdateCheck()
  })

  it('asks again when forced, even within the kept time', async () => {
    resetUpdateCheck()
    let calls = 0
    const counting = async () => { calls += 1; return answer() }
    await checkForUpdate('0.6.0', counting)
    await checkForUpdate('0.6.0', counting)
    await checkForUpdate('0.6.0', counting, Date.now(), true)
    expect(calls).toBe(2)
    resetUpdateCheck()
  })
})
