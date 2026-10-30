import { describe, it, expect, vi } from 'vitest'
import { autoScanTick, isScanDue } from './auto-scan'

const MIN = 60_000

describe('isScanDue', () => {
  const base = { enabled: true, intervalMinutes: 15, lastFinishedMs: 1_000_000, now: 1_000_000 }
  it('is never due when switched off', () => {
    expect(isScanDue({ ...base, enabled: false, lastFinishedMs: null })).toBe(false)
  })
  it('is due at once if there has never been a scan', () => {
    expect(isScanDue({ ...base, lastFinishedMs: null })).toBe(true)
  })
  it('is due once the interval has passed since the last scan finished, not before', () => {
    expect(isScanDue({ ...base, now: base.now + 14 * MIN })).toBe(false)
    expect(isScanDue({ ...base, now: base.now + 15 * MIN })).toBe(true)
  })
})

describe('autoScanTick', () => {
  function deps(over: Partial<Parameters<typeof autoScanTick>[0]> = {}) {
    const scan = vi.fn(async () => undefined)
    return {
      scan,
      deps: {
        settings: () => ({ enabled: true, intervalMinutes: 5 }),
        lastFinishedMs: () => 0,
        scan,
        now: () => 10 * MIN,
        ...over,
      },
    }
  }

  it('scans when due', async () => {
    const { deps: d, scan } = deps()
    expect(await autoScanTick(d)).toBe('scanned')
    expect(scan).toHaveBeenCalledTimes(1)
  })

  it('does nothing when off, and does not even look at the scan log', async () => {
    const lastFinishedMs = vi.fn(() => 0)
    const { deps: d, scan } = deps({ settings: () => ({ enabled: false, intervalMinutes: 5 }), lastFinishedMs })
    expect(await autoScanTick(d)).toBe('skipped')
    expect(scan).not.toHaveBeenCalled()
    expect(lastFinishedMs).not.toHaveBeenCalled()
  })

  it('picks up a changed setting on the next look', async () => {
    let interval = 60
    const { deps: d, scan } = deps({ settings: () => ({ enabled: true, intervalMinutes: interval }) })
    expect(await autoScanTick(d)).toBe('skipped')
    interval = 5
    expect(await autoScanTick(d)).toBe('scanned')
    expect(scan).toHaveBeenCalledTimes(1)
  })
})
