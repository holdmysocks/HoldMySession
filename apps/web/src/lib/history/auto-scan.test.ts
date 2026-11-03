import { beforeEach, describe, it, expect, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { autoScanTick, isScanDue, resetAutoScanState, transcriptsChangedSince } from './auto-scan'

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
  beforeEach(() => resetAutoScanState())

  function deps(over: Partial<Parameters<typeof autoScanTick>[0]> = {}) {
    const scan = vi.fn(async () => undefined)
    return {
      scan,
      deps: {
        settings: () => ({ enabled: true, intervalMinutes: 5 }),
        lastFinishedMs: () => 0,
        scan,
        now: () => 10 * MIN,
        changedSince: () => true,
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

describe('autoScanTick when nothing was written', () => {
  beforeEach(() => resetAutoScanState())
  const base = (over = {}) => {
    const scan = vi.fn(async () => undefined)
    const changedSince = vi.fn(() => false)
    return { scan, changedSince, deps: { settings: () => ({ enabled: true, intervalMinutes: 15 }), lastFinishedMs: () => 0, scan, now: () => 20 * MIN, changedSince, ...over } }
  }

  it('skips a due scan, since nothing new would be found', async () => {
    const { deps: d, scan, changedSince } = base()
    expect(await autoScanTick(d)).toBe('skipped')
    expect(changedSince).toHaveBeenCalledWith(0)
    expect(scan).not.toHaveBeenCalled()
  })

  it('does not look at the files again until the interval has passed', async () => {
    const { deps: d, changedSince } = base()
    await autoScanTick(d)
    await autoScanTick({ ...d, now: () => 20 * MIN + 30_000 })
    expect(changedSince).toHaveBeenCalledTimes(1)
    await autoScanTick({ ...d, now: () => 36 * MIN })
    expect(changedSince).toHaveBeenCalledTimes(2)
  })

  it('scans once something was written, and always for the first scan', async () => {
    const written = base({ changedSince: () => true })
    expect(await autoScanTick(written.deps)).toBe('scanned')
    resetAutoScanState()
    const first = base({ lastFinishedMs: () => null })
    expect(await autoScanTick(first.deps)).toBe('scanned')
    expect(first.changedSince).not.toHaveBeenCalled()
  })
})

describe('transcriptsChangedSince', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changed-'))
  })
  const transcript = (project: string, name: string, mtimeMs: number) => {
    fs.mkdirSync(path.join(dir, project), { recursive: true })
    const file = path.join(dir, project, name)
    fs.writeFileSync(file, '{}\n')
    fs.utimesSync(file, new Date(mtimeMs), new Date(mtimeMs))
  }

  it('is true when a transcript is newer, false when none is', () => {
    transcript('p1', 'a.jsonl', 1_000_000)
    transcript('p2', 'b.jsonl', 5_000_000)
    expect(transcriptsChangedSince(4_000_000, dir)).toBe(true)
    expect(transcriptsChangedSince(6_000_000, dir)).toBe(false)
  })
  it('ignores files that are not transcripts', () => {
    transcript('p1', 'notes.txt', 9_000_000)
    expect(transcriptsChangedSince(1, dir)).toBe(false)
  })
  it('says yes when the folder cannot be read, to be safe', () => {
    expect(transcriptsChangedSince(1, path.join(dir, 'missing'))).toBe(true)
  })
})
