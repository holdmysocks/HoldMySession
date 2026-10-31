import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { openHistoryDb } from './history-db'
import { splitDuration, statsFromHistory } from './history-stats'
import { UNLINKED_PROJECT_KEY } from '@/lib/projects/unlinked'

function claudeFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-'))
  const write = (project: string, id: string, cwd: string | null, lines: object[]) => {
    const folder = path.join(dir, 'projects', project)
    fs.mkdirSync(folder, { recursive: true })
    const base = cwd ? { sessionId: id, cwd } : { sessionId: id }
    fs.writeFileSync(path.join(folder, `${id}.jsonl`), lines.map((l) => JSON.stringify({ ...base, ...l })).join('\n') + '\n')
  }
  const reply = (n: number, ts: string, model: string, usage: object) => ({
    type: 'assistant', uuid: `a${n}`, requestId: `r${n}`, timestamp: ts,
    message: { id: `m${n}`, role: 'assistant', model, stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage },
  })
  const user = (n: number, ts: string) => ({ type: 'user', uuid: `u${n}`, timestamp: ts, message: { role: 'user', content: 'hi' } })
  write('-w-app', 'app1', '/w/app', [
    user(0, '2026-02-01T09:00:00.000Z'),
    reply(1, '2026-02-01T09:00:05.000Z', 'claude-opus-5-5', { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 900, cache_creation_input_tokens: 10 }),
    user(2, '2026-02-03T09:00:00.000Z'),
    reply(3, '2026-02-03T09:00:05.000Z', 'claude-opus-5-5', { input_tokens: 40, output_tokens: 20, cache_read_input_tokens: 400, cache_creation_input_tokens: 0 }),
  ])
  write('-w-other', 'oth1', '/w/other', [
    user(4, '2026-02-02T10:00:00.000Z'),
    reply(5, '2026-02-02T10:00:05.000Z', 'claude-haiku-5-5', { input_tokens: 7, output_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
  ])
  write('-tmp-scratch1', 'scr1', null, [
    user(6, '2026-02-04T11:00:00.000Z'),
    reply(7, '2026-02-04T11:00:05.000Z', 'claude-haiku-5-5', { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
  ])
  return dir
}

describe('statsFromHistory', () => {
  afterEach(() => vi.unstubAllEnvs())

  async function scanned() {
    vi.stubEnv('HOME', fs.mkdtempSync(path.join(os.tmpdir(), 'home-')))
    vi.stubEnv('CLAUDE_CONFIG_DIR', claudeFolder())
    vi.resetModules()
    const { runHistoryScan } = await import('./scan')
    const { compareHistoryWithLive } = await import('./compare')
    const db = openHistoryDb(':memory:')
    await runHistoryScan(db)
    return { db, compareHistoryWithLive }
  }

  it('gives the same totals as reading the session files', async () => {
    const { db, compareHistoryWithLive } = await scanned()
    const result = await compareHistoryWithLive(db)
    expect(result).not.toBeNull()
    expect(result!.rows.filter((r) => !r.same)).toEqual([])
    expect(result!.rows.find((r) => r.label === 'Sessions')).toMatchObject({ live: 3, history: 3 })
    expect(result!.changedWhileChecking).toBe(0)
  })

  it('counts tokens on the day each reply happened', async () => {
    const { db } = await scanned()
    const stats = statsFromHistory(db)!
    const opus = stats.dailyModelTokens.filter((d) => d.tokensByModel['claude-opus-5-5'])
    expect(opus.map((d) => d.date).length).toBe(2)
    expect(opus.reduce((a, d) => a + d.tokensByModel['claude-opus-5-5'], 0)).toBe(210)
  })

  it('narrows to one project, and groups scratch and no-folder sessions as unlinked', async () => {
    const { db } = await scanned()
    expect(statsFromHistory(db, { projectPath: '/w/app' })!.totalSessions).toBe(1)
    expect(statsFromHistory(db, { projectPath: UNLINKED_PROJECT_KEY })!.totalSessions).toBe(1)
    expect(statsFromHistory(db, { projectPath: '/w/nothing' })).toBeNull()
  })

  it('keeps sessions whose transcripts are gone', async () => {
    const { db } = await scanned()
    db.exec('UPDATE sessions SET on_disk = 0')
    expect(statsFromHistory(db)!.totalSessions).toBe(3)
  })

  it('asks for a rescan when sessions were stored before the project columns existed', async () => {
    const { db } = await scanned()
    db.exec('UPDATE sessions SET cwd = NULL')
    expect(statsFromHistory(db)).toBeNull()
  })
})

describe('splitDuration', () => {
  it('puts a session that stayed within one day on that day', () => {
    const out = splitDuration('2026-10-30T09:00:00', '2026-10-30T11:00:00', 7_200_000)
    expect([...out]).toEqual([['2026-10-30', 7_200_000]])
  })

  it('spreads a session over the days it spanned, and the parts add up to its duration', () => {
    // Noon to noon the next day: half on each local day.
    const out = splitDuration('2026-10-30T12:00:00', '2026-10-31T12:00:00', 10_000_000)
    expect([...out.keys()]).toEqual(['2026-10-30', '2026-10-31'])
    expect([...out.values()].reduce((a, b) => a + b, 0)).toBe(10_000_000)
    expect(out.get('2026-10-30')).toBe(5_000_000)
  })

  it('gives nothing for a session with no duration', () => {
    expect(splitDuration('2026-10-30T09:00:00', '2026-10-30T09:00:00', 0).size).toBe(0)
  })
})
