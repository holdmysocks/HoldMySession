import { describe, it, expect } from 'vitest'
import type { SessionDetail, SessionSummary, TokenUsage } from '@/lib/parsers/types'
import { openHistoryDb } from './history-db'
import { ingestSessions, usageByDay, type IngestEntry } from './ingest'

const usage = (o: Partial<TokenUsage>): TokenUsage => ({
  inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, ...o,
})
const at = (d: number, h = 12) => new Date(2026, 2, d, h).toISOString()

function summary(id: string, extra: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: id, projectKey: 'proj', projectPath: '/p', projectName: 'p', projectDisplayName: 'Proj', sessionName: `name ${id}`,
    startedAt: at(1), lastActiveAt: at(3), durationMs: 1000, messageCount: 4, toolCallCount: 0,
    ...extra,
  } as SessionSummary
}

function detail(tokensByModel: Record<string, TokenUsage>, replyDays: Array<[number, string]>): SessionDetail {
  return {
    turns: replyDays.map(([day, model], i) => ({ uuid: `t${i}`, type: 'assistant', timestamp: at(day), model, toolCalls: [] })),
    tokensByModel, toolFrequency: { Bash: 2 },
  } as unknown as SessionDetail
}

const entry = (id: string, tokens: Record<string, TokenUsage>, days: Array<[number, string]>): IngestEntry => ({
  summary: summary(id), detail: detail(tokens, days),
})

const total = (db: ReturnType<typeof openHistoryDb>, col: string) =>
  Number(db.prepare(`SELECT COALESCE(SUM(${col}), 0) AS n FROM usage_daily`).get()!.n)

describe('usageByDay', () => {
  it('spreads a model over the days it replied and keeps the totals exact', () => {
    const d = detail({ m: usage({ inputTokens: 100, outputTokens: 31, cacheReadInputTokens: 7, thinkingTokens: 5 }) }, [[1, 'm'], [1, 'm'], [3, 'm']])
    const byDay = usageByDay(summary('s'), d)
    expect([...byDay.keys()].sort()).toEqual(['2026-03-01', '2026-03-03'])
    const sum = (f: string) => [...byDay.values()].reduce((a, m) => a + (m.get('m') as never as Record<string, number>)[f], 0)
    expect(sum('input_tokens')).toBe(100)
    expect(sum('output_tokens')).toBe(31)
    expect(sum('cache_read_tokens')).toBe(7)
    expect(sum('thinking_tokens')).toBe(5)
  })

  it('puts a model with no dated reply on the last active day', () => {
    const byDay = usageByDay(summary('s'), detail({ sub: usage({ inputTokens: 9 }) }, []))
    expect([...byDay.keys()]).toEqual(['2026-03-03'])
  })
})

describe('ingestSessions', () => {
  it('records sessions and usage, and counts a repeat scan as updates with the same totals', () => {
    const db = openHistoryDb(':memory:')
    const entries = [entry('a', { m: usage({ inputTokens: 10, outputTokens: 20 }) }, [[1, 'm']])]
    expect(ingestSessions(db, entries)).toEqual({ added: 1, updated: 0, missing: 0 })
    expect(ingestSessions(db, entries)).toEqual({ added: 0, updated: 1, missing: 0 })
    expect(total(db, 'input_tokens')).toBe(10)
    expect(total(db, 'output_tokens')).toBe(20)
  })

  it('replaces a session usage when it grows, instead of adding to it', () => {
    const db = openHistoryDb(':memory:')
    ingestSessions(db, [entry('a', { m: usage({ inputTokens: 10 }) }, [[1, 'm']])])
    ingestSessions(db, [entry('a', { m: usage({ inputTokens: 25 }) }, [[1, 'm']])])
    expect(total(db, 'input_tokens')).toBe(25)
  })

  it('keeps a session and its tokens after its transcript is gone, marked not on disk', () => {
    const db = openHistoryDb(':memory:')
    ingestSessions(db, [entry('a', { m: usage({ inputTokens: 10 }) }, [[1, 'm']]), entry('b', { m: usage({ inputTokens: 5 }) }, [[2, 'm']])])
    const result = ingestSessions(db, [entry('b', { m: usage({ inputTokens: 5 }) }, [[2, 'm']])])
    expect(result.missing).toBe(1)
    expect(total(db, 'input_tokens')).toBe(15)
    const gone = db.prepare("SELECT on_disk, session_name FROM sessions WHERE session_id = 'a'").get()
    expect(gone).toMatchObject({ on_disk: 0, session_name: 'name a' })
  })

  it('keeps the usage a session already had when its parse failed this time', () => {
    const db = openHistoryDb(':memory:')
    ingestSessions(db, [entry('a', { m: usage({ inputTokens: 10 }) }, [[1, 'm']])])
    ingestSessions(db, [{ summary: summary('a'), detail: null }])
    expect(total(db, 'input_tokens')).toBe(10)
  })

  it('keeps the same session id in two projects apart', () => {
    const db = openHistoryDb(':memory:')
    ingestSessions(db, [
      { summary: summary('x', { projectKey: 'one' }), detail: detail({ m: usage({ inputTokens: 1 }) }, [[1, 'm']]) },
      { summary: summary('x', { projectKey: 'two' }), detail: detail({ m: usage({ inputTokens: 2 }) }, [[1, 'm']]) },
    ])
    expect(Number(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n)).toBe(2)
    expect(total(db, 'input_tokens')).toBe(3)
  })

  it('does not lose a stored name when a later scan has none', () => {
    const db = openHistoryDb(':memory:')
    ingestSessions(db, [entry('a', {}, [])])
    ingestSessions(db, [{ summary: summary('a', { sessionName: null }), detail: null }])
    expect(db.prepare("SELECT session_name FROM sessions WHERE session_id = 'a'").get()).toMatchObject({ session_name: 'name a' })
  })
})
