import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const NOW = Date.parse('2026-11-02T12:00:00Z')

describe('readLiveLimits', () => {
  let data: string
  beforeEach(() => {
    data = fs.mkdtempSync(path.join(os.tmpdir(), 'live-limits-'))
    vi.stubEnv('HOLDMYSESSION_DIR', data)
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    fs.rmSync(data, { recursive: true, force: true })
  })
  const usage = (value: unknown) => fs.writeFileSync(path.join(data, 'usage.json'), JSON.stringify(value))
  const settings = (limits: unknown) => fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ version: 1, limits }))
  const read = async () => (await import('./live-limits')).readLiveLimits(NOW)
  const week = { usedPercentage: 41, resetsAt: (NOW + 86_400_000) / 1000 }
  const five = { usedPercentage: 78, resetsAt: (NOW + 3_600_000) / 1000 }

  it('is empty with nothing reported', async () => {
    expect(await read()).toEqual({ enabled: true, fiveHour: null, sevenDay: null, updatedAt: null })
  })
  it('gives the live windows', async () => {
    usage({ updatedAt: '2026-11-02T11:59:00.000Z', fiveHour: five, sevenDay: week, fiveHourSeenAt: '2026-11-02T11:59:00.000Z' })
    const r = await read()
    expect(r.fiveHour?.usedPercentage).toBe(78)
    expect(r.sevenDay?.usedPercentage).toBe(41)
  })
  it('has no 5-hour window for a plan that never reported one', async () => {
    usage({ updatedAt: '2026-11-02T11:59:00.000Z', fiveHour: null, sevenDay: week, fiveHourSeenAt: null })
    expect((await read()).fiveHour).toBeNull()
  })
  it('hides the 5-hour window when the setting says never', async () => {
    usage({ updatedAt: '2026-11-02T11:59:00.000Z', fiveHour: five, sevenDay: week, fiveHourSeenAt: '2026-11-02T11:59:00.000Z' })
    settings({ fiveHour: 'never', alerts: true })
    const r = await read()
    expect(r.fiveHour).toBeNull()
    expect(r.sevenDay).not.toBeNull()
  })
  it('drops a window that has reset, and reports the alerts setting', async () => {
    usage({ updatedAt: '2026-11-02T01:00:00.000Z', fiveHour: { usedPercentage: 90, resetsAt: (NOW - 1000) / 1000 }, sevenDay: week, fiveHourSeenAt: '2026-11-02T01:00:00.000Z' })
    settings({ fiveHour: 'auto', alerts: false })
    const r = await read()
    expect(r.fiveHour).toBeNull()
    expect(r.enabled).toBe(false)
  })
})
