import { describe, it, expect, beforeEach } from 'vitest'
import { compareVersions, parseVersion } from './version'
import { checkForUpdate, resetUpdateCheck, RELEASES_URL } from './update-check'

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
    expect(failing).toEqual({ current: '0.6.0', latest: null, available: false, url: RELEASES_URL })
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
