import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const NOW = Date.parse('2026-11-02T12:00:00Z')
const H = 3_600_000
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * H).toISOString()

function answer(hoursAgo: number, request: string, usage: { i?: number; o?: number; cr?: number; cw?: number }, model = 'claude-sonnet-4-20250514') {
  return JSON.stringify({
    type: 'assistant',
    timestamp: iso(hoursAgo),
    requestId: request,
    message: { id: `msg_${request}`, model, usage: { input_tokens: usage.i ?? 0, output_tokens: usage.o ?? 0, cache_read_input_tokens: usage.cr ?? 0, cache_creation_input_tokens: usage.cw ?? 0 } },
  })
}

describe('buildUsageOverview', () => {
  let root: string
  let projects: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'overview-'))
    projects = path.join(root, 'claude', 'projects', '-work-app')
    fs.mkdirSync(projects, { recursive: true })
    vi.stubEnv('CLAUDE_CONFIG_DIR', path.join(root, 'claude'))
    vi.stubEnv('HOLDMYSESSION_DIR', path.join(root, 'data'))
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const transcript = (id: string, lines: string[], ageHours = 0) => {
    const file = path.join(projects, `${id}.jsonl`)
    fs.writeFileSync(file, lines.join('\n') + '\n')
    const t = new Date(NOW - ageHours * H)
    fs.utimesSync(file, t, t)
  }
  const report = (five: number | null, seven: number | null, minutesAgo = 1) => {
    fs.mkdirSync(path.join(root, 'data'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'data', 'usage.json'),
      JSON.stringify({
        updatedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
        fiveHour: five === null ? null : { usedPercentage: five, resetsAt: (NOW + 2 * H) / 1000 },
        sevenDay: seven === null ? null : { usedPercentage: seven, resetsAt: (NOW + 3 * 24 * H) / 1000 },
      }),
    )
  }
  const build = async () => (await import('./overview')).buildUsageOverview(NOW)

  it('is empty with nothing on this computer', async () => {
    const o = await build()
    expect(o.real).toEqual({ fiveHour: null, sevenDay: null, updatedAt: null })
    expect(o.estimate.block).toBeNull()
    expect(o.estimate.week).toMatchObject({ tokens: 0, usd: 0, events: 0, percentage: null, burn: [] })
    expect(o.statusLine.installed).toBe(false)
  })

  it('counts input, output and cache writes as tokens, not cache reads, and each answer once', async () => {
    transcript('s1', [answer(1, 'r1', { i: 100, o: 50, cr: 100000, cw: 25 }), answer(1, 'r1', { i: 100, o: 50, cr: 100000, cw: 25 }), 'not json', JSON.stringify({ type: 'user', timestamp: iso(1) })])
    const o = await build()
    expect(o.estimate.week.tokens).toBe(175)
    expect(o.estimate.week.events).toBe(1)
    expect(o.estimate.week.usd).toBeGreaterThan(0)
  })

  it('finds the running 5-hour block and ranks sessions by what they used in it', async () => {
    transcript('big', [answer(2, 'a', { o: 9000 }), answer(1, 'b', { o: 1000 })])
    transcript('small', [answer(1.5, 'c', { o: 1000 })])
    transcript('older', [answer(30, 'd', { o: 5000 })])
    const o = await build()
    expect(o.estimate.block?.tokens).toBe(11000)
    expect(o.estimate.block?.burn.map((b) => b.sessionId)).toEqual(['big', 'small'])
    expect(o.estimate.block?.burn[0].share).toBeCloseTo(10000 / 11000, 5)
    expect(o.estimate.week.tokens).toBe(16000)
    expect(o.estimate.week.burn.map((b) => b.sessionId)).toEqual(['big', 'older', 'small'])
  })

  it('has no running block once the last one ended', async () => {
    transcript('s1', [answer(6, 'a', { o: 100 })])
    expect((await build()).estimate.block).toBeNull()
  })

  it('ignores transcripts not touched for a week', async () => {
    transcript('stale', [answer(1, 'a', { o: 100 })], 24 * 8)
    expect((await build()).estimate.week.tokens).toBe(0)
  })

  it('gives the real windows with their pace, and drops one that has reset', async () => {
    report(80, 10)
    const o = await build()
    expect(o.real.fiveHour?.usedPercentage).toBe(80)
    expect(o.real.fiveHour?.pace.projectedPercentage).toBeGreaterThan(100)
    expect(o.real.sevenDay?.usedPercentage).toBe(10)
    expect(o.real.updatedAt).toBe(new Date(NOW - 60_000).toISOString())
    fs.writeFileSync(path.join(root, 'data', 'usage.json'), JSON.stringify({ updatedAt: iso(9), fiveHour: { usedPercentage: 90, resetsAt: (NOW - H) / 1000 }, sevenDay: null }))
    vi.resetModules()
    expect((await build()).real.fiveHour).toBeNull()
  })

  it('learns the limit from a real report and then estimates a share', async () => {
    transcript('s1', [answer(1, 'a', { o: 2000 })])
    report(40, null)
    const first = await build()
    // 2000 tokens at 40% means a limit near 5000, so the estimate agrees with the report it learned from.
    expect(first.estimate.block?.percentage).toBeCloseTo(40, 5)
    // Later, with no fresh report, the same limit turns more tokens into a share.
    fs.rmSync(path.join(root, 'data', 'usage.json'))
    transcript('s1', [answer(1, 'a', { o: 2000 }), answer(0.5, 'b', { o: 1000 })])
    vi.resetModules()
    const later = await build()
    expect(later.real.fiveHour).toBeNull()
    expect(later.estimate.block?.percentage).toBeCloseTo(60, 5)
    expect(JSON.parse(fs.readFileSync(path.join(root, 'data', 'usage-calibration.json'), 'utf-8')).fiveHour).toEqual([5000])
  })

  it('does not learn from a report with very little used', async () => {
    transcript('s1', [answer(1, 'a', { o: 2000 })])
    report(1, null)
    const o = await build()
    expect(o.estimate.block?.percentage).toBeNull()
    expect(fs.existsSync(path.join(root, 'data', 'usage-calibration.json'))).toBe(false)
  })
})
