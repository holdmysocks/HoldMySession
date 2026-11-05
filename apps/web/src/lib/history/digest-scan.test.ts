import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const rec = (sessionId: string, o: object) => JSON.stringify({ sessionId, cwd: '/w/demo', ...o })
const user = (sid: string, n: number, ts: string) => rec(sid, { type: 'user', uuid: `u-${sid}-${n}`, timestamp: ts, message: { role: 'user', content: `q${n}` } })
const answer = (sid: string, request: string, ts: string, tokens: number, model = 'claude-sonnet-4-5', tools = 0) =>
  rec(sid, {
    type: 'assistant', uuid: `a-${sid}-${request}`, requestId: request, timestamp: ts,
    message: {
      id: `m-${request}`, role: 'assistant', model, stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }, ...Array.from({ length: tools }, (_, k) => ({ type: 'tool_use', id: `t-${request}-${k}`, name: 'Read', input: { file_path: '/a' } }))],
      usage: { input_tokens: tokens, output_tokens: tokens * 2, cache_read_input_tokens: tokens * 10, cache_creation_input_tokens: 5 },
    },
  })

describe('the history scan from digests', () => {
  let dir: string
  let data: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'digest-claude-'))
    data = fs.mkdtempSync(path.join(os.tmpdir(), 'digest-data-'))
    vi.stubEnv('CLAUDE_CONFIG_DIR', dir)
    vi.stubEnv('HOLDMYSESSION_DIR', data)
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(data, { recursive: true, force: true })
  })

  const write = (project: string, name: string, lines: string[]) => {
    const folder = path.join(dir, 'projects', project)
    fs.mkdirSync(folder, { recursive: true })
    const file = path.join(folder, `${name}.jsonl`)
    fs.writeFileSync(file, lines.join('\n') + '\n')
    return file
  }

  /** Session a; b is forked from it and holds its first two answers; c is separate, on two days, with tool calls and a second model. */
  const make = () => {
    const a = write('-w-demo', 'aaaa', [
      user('aaaa', 0, '2026-01-05T09:00:00.000Z'),
      answer('aaaa', 'r0', '2026-01-05T09:00:05.000Z', 100),
      answer('aaaa', 'r1', '2026-01-05T09:01:00.000Z', 200, 'claude-opus-5-5', 2),
      answer('aaaa', 'r2', '2026-01-05T09:02:00.000Z', 300),
    ])
    const b = write('-w-demo', 'bbbb', [
      user('bbbb', 0, '2026-01-05T10:00:00.000Z'),
      answer('bbbb', 'r0', '2026-01-05T09:00:05.000Z', 100),
      answer('bbbb', 'r1', '2026-01-05T09:01:00.000Z', 200, 'claude-opus-5-5', 2),
      answer('bbbb', 'r3', '2026-01-05T10:00:30.000Z', 400),
    ])
    const c = write('-w-other', 'cccc', [
      user('cccc', 0, '2026-01-06T23:30:00.000Z'),
      answer('cccc', 'r4', '2026-01-06T23:30:05.000Z', 50, 'claude-sonnet-4-5', 3),
      answer('cccc', 'r5', '2026-01-07T00:30:05.000Z', 60, 'claude-haiku-4-5', 1),
    ])
    return { a, b, c }
  }

  async function load() {
    const { scanAllSessionsWithPaths } = await import('@/lib/scanner/session-scanner')
    const { parseDetailsDeduplicated } = await import('@/lib/parsers/stats-parser')
    const { openHistoryDb } = await import('./history-db')
    const { ingestSessions } = await import('./ingest')
    const digest = await import('./digest-scan')
    return { scanAllSessionsWithPaths, parseDetailsDeduplicated, openHistoryDb, ingestSessions, digest }
  }

  const rows = (db: { prepare: (sql: string) => { all: () => Array<Record<string, unknown>> } }) => ({
    sessions: db.prepare('SELECT session_key, session_id, message_count, tool_call_count, started_at, last_active_at, on_disk FROM sessions ORDER BY session_key').all(),
    usage: db.prepare('SELECT session_key, day, model, input_tokens, output_tokens, thinking_tokens, cache_read_tokens, cache_write_tokens FROM usage_daily ORDER BY session_key, day, model').all(),
    activity: db.prepare('SELECT session_key, day, messages, tool_calls FROM activity_daily ORDER BY session_key, day').all(),
  })

  it('writes the same history as reading every transcript in full, with a forked session\'s copied answers counted once', async () => {
    make()
    const { scanAllSessionsWithPaths, parseDetailsDeduplicated, openHistoryDb, ingestSessions, digest } = await load()
    const summaries = await scanAllSessionsWithPaths()
    expect(summaries).toHaveLength(3)
    const now = new Date('2026-02-01T00:00:00Z')

    const details = await parseDetailsDeduplicated(summaries)
    const oldDb = openHistoryDb(':memory:')
    ingestSessions(oldDb, summaries.map((summary) => ({ summary, detail: details.get(summary.filePath) ?? null })), now)

    const { entries, counts } = await digest.digestEntries(summaries, 'test')
    const newDb = openHistoryDb(':memory:')
    ingestSessions(newDb, entries, now)

    expect(counts).toEqual({ parsed: 3, reused: 0, failed: 0 })
    const expected = rows(oldDb)
    expect(rows(newDb)).toEqual(expected)
    // Sanity: the copied answers were taken out of the later session, so the sum is each answer once.
    const total = (expected.usage as Array<{ input_tokens: number }>).reduce((n, r) => n + r.input_tokens, 0)
    expect(total).toBe(100 + 200 + 300 + 400 + 50 + 60)
    expect(expected.activity.length).toBeGreaterThan(3)
  })

  it('does not read a session again until its files change', async () => {
    const files = make()
    const { scanAllSessionsWithPaths, digest } = await load()
    const scan = async () => {
      const summaries = await scanAllSessionsWithPaths()
      const { entries, counts } = await digest.digestEntries(summaries, 'test')
      for (const _ of entries) void _
      return counts
    }
    expect(await scan()).toEqual({ parsed: 3, reused: 0, failed: 0 })
    expect(await scan()).toEqual({ parsed: 0, reused: 3, failed: 0 })

    fs.appendFileSync(files.b, answer('bbbb', 'r6', '2026-01-05T10:05:00.000Z', 10) + '\n')
    expect(await scan()).toEqual({ parsed: 1, reused: 2, failed: 0 })

    // A subagent's transcript is part of its session, so a change there makes the session be read again.
    const agent = path.join(files.a.replace(/\.jsonl$/, ''), 'subagents', 'agent-x1.jsonl')
    fs.mkdirSync(path.dirname(agent), { recursive: true })
    fs.writeFileSync(agent, '{}\n')
    expect(await scan()).toEqual({ parsed: 1, reused: 2, failed: 0 })
    expect(await scan()).toEqual({ parsed: 0, reused: 3, failed: 0 })
    fs.appendFileSync(agent, '{}\n')
    expect(await scan()).toEqual({ parsed: 1, reused: 2, failed: 0 })
  })

  it('reads everything again for a new version of the app, in case what a digest holds has changed', async () => {
    make()
    const { scanAllSessionsWithPaths, digest } = await load()
    const summaries = await scanAllSessionsWithPaths()
    for (const _ of (await digest.digestEntries(summaries, '1.0.0')).entries) void _
    const again = await digest.digestEntries(summaries, '1.0.1')
    for (const _ of again.entries) void _
    expect(again.counts.parsed).toBe(3)
  })

  it('still counts a change in what is shared between sessions: an answer added to the first session, copied later, is counted once', async () => {
    const files = make()
    const { scanAllSessionsWithPaths, parseDetailsDeduplicated, openHistoryDb, ingestSessions, digest } = await load()
    const first = await scanAllSessionsWithPaths()
    for (const _ of (await digest.digestEntries(first, 'test')).entries) void _
    // The fork gains an answer the parent also has, written to the parent later.
    fs.appendFileSync(files.a, answer('aaaa', 'r3', '2026-01-05T10:00:30.000Z', 400) + '\n')
    const summaries = await scanAllSessionsWithPaths()
    const now = new Date('2026-02-01T00:00:00Z')
    const details = await parseDetailsDeduplicated(summaries)
    const oldDb = openHistoryDb(':memory:')
    ingestSessions(oldDb, summaries.map((summary) => ({ summary, detail: details.get(summary.filePath) ?? null })), now)
    const { entries, counts } = await digest.digestEntries(summaries, 'test')
    const newDb = openHistoryDb(':memory:')
    ingestSessions(newDb, entries, now)
    expect(counts.parsed).toBe(1)
    expect(rows(newDb)).toEqual(rows(oldDb))
  })

  it('treats a session it cannot read as failed, and keeps no digest for one that is gone', async () => {
    const files = make()
    const { scanAllSessionsWithPaths, digest } = await load()
    const summaries = await scanAllSessionsWithPaths()
    for (const _ of (await digest.digestEntries(summaries, 'test')).entries) void _
    expect(fs.readdirSync(digest.digestDir())).toHaveLength(3)
    fs.rmSync(files.c)
    expect(digest.pruneDigests(summaries.filter((s) => !s.filePath.endsWith('cccc.jsonl')))).toBe(1)
    expect(fs.readdirSync(digest.digestDir())).toHaveLength(2)
    // A session in the list whose transcript is gone is failed, not an error.
    const { entries, counts } = await digest.digestEntries(summaries, 'test')
    const handed = [...entries]
    expect(counts.failed).toBe(1)
    expect(handed.filter((e) => e.detail === null)).toHaveLength(1)
  })
})
