import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { openHistoryDb } from './history-db'

function claudeFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-'))
  const project = path.join(dir, 'projects', '-w-demo')
  fs.mkdirSync(project, { recursive: true })
  const rec = (o: object) => JSON.stringify({ sessionId: 's1', cwd: '/w/demo', ...o })
  fs.writeFileSync(
    path.join(project, 's1.jsonl'),
    [
      rec({ type: 'user', uuid: 'u0', timestamp: '2026-01-05T09:00:00.000Z', message: { role: 'user', content: 'hi' } }),
      rec({
        type: 'assistant', uuid: 'a0', requestId: 'r0', timestamp: '2026-01-05T09:00:05.000Z',
        message: { id: 'm0', role: 'assistant', model: 'claude-haiku-4-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 50, output_tokens: 120, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 } },
      }),
    ].join('\n') + '\n',
  )
  return dir
}

describe('runHistoryScan', () => {
  afterEach(() => vi.unstubAllEnvs())
  // The scanner also looks under the home folder, so point that at an empty place too.
  const emptyHome = () => vi.stubEnv('HOME', fs.mkdtempSync(path.join(os.tmpdir(), 'home-')))
  // The Claude folder is read once when the scanner is first imported, so import it after the environment is set.
  async function freshScan() {
    vi.resetModules()
    return (await import('./scan')).runHistoryScan
  }

  it('records a Claude folder, writes the scan log, and is repeatable', async () => {
    emptyHome()
    vi.stubEnv('CLAUDE_CONFIG_DIR', claudeFolder())
    const runHistoryScan = await freshScan()
    const db = openHistoryDb(':memory:')
    const first = await runHistoryScan(db)
    const second = await runHistoryScan(db)
    expect(first).toMatchObject({ ok: true, sessionsSeen: 1, added: 1 })
    expect(second).toMatchObject({ ok: true, sessionsSeen: 1, added: 0, updated: 1 })
    const usage = db.prepare('SELECT SUM(input_tokens) AS i, SUM(output_tokens) AS o, SUM(cache_read_tokens) AS c FROM usage_daily').get()
    expect(usage).toMatchObject({ i: 50, o: 120, c: 1000 })
    const log = db.prepare('SELECT status FROM scan_log ORDER BY id').all().map((r) => r.status)
    expect(log).toEqual(['ok', 'ok'])
  })

  it('leaves the history alone when the Claude folder has gone', async () => {
    const folder = claudeFolder()
    emptyHome()
    vi.stubEnv('CLAUDE_CONFIG_DIR', folder)
    const runHistoryScan = await freshScan()
    const db = openHistoryDb(':memory:')
    await runHistoryScan(db)
    fs.rmSync(folder, { recursive: true })
    const after = await runHistoryScan(db)
    expect(after).toMatchObject({ ok: true, sessionsSeen: 0, missing: 0 })
    expect(Number(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE on_disk = 1').get()!.n)).toBe(1)
    expect(Number(db.prepare('SELECT SUM(input_tokens) AS n FROM usage_daily').get()!.n)).toBe(50)
  })
})
