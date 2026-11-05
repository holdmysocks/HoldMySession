import { describe, it, expect } from 'vitest'
import type { SessionDetail, SessionSummary, TokenUsage } from '@/lib/parsers/types'
import { openHistoryDb } from './history-db'
import { activityByDay, ingestSessions, usageByDay, type IngestEntry } from './ingest'
import { statsFromHistory } from './history-stats'

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

  it('leaves another machine\'s sessions alone when marking missing ones', () => {
    const db = openHistoryDb(':memory:')
    ingestSessions(db, [entry('mine', { m: usage({ inputTokens: 1 }) }, [[1, 'm']])])
    db.prepare(
      `INSERT INTO sessions (machine_id, session_key, session_id, project_key, project_path, project_display_name, session_name, started_at, last_active_at, duration_ms, message_count, tool_call_count, on_disk, first_seen_at, last_seen_at) VALUES ('other-machine', 'proj:theirs', 'theirs', 'proj', '/p', 'P', 'n', 'a', 'b', 1, 1, 1, 1, 'x', 'y')`,
    ).run()
    const result = ingestSessions(db, [entry('mine', { m: usage({ inputTokens: 1 }) }, [[1, 'm']])])
    expect(result.missing).toBe(0)
    expect(db.prepare("SELECT on_disk FROM sessions WHERE machine_id = 'other-machine'").get()).toMatchObject({ on_disk: 1 })
  })
})

describe('activityByDay', () => {
  const turns = (days: number[], tools: number[] = []) =>
    ({
      turns: days.map((day, i) => ({ uuid: `t${i}`, type: 'user', timestamp: at(day), toolCalls: new Array(tools[i] ?? 0).fill({ toolName: 'Bash', toolUseId: 'x' }) })),
      tokensByModel: {}, toolFrequency: {},
    }) as unknown as SessionDetail

  it('counts messages and tool calls on the days they happened, and keeps the totals exact', () => {
    const rows = activityByDay(summary('s'), turns([1, 1, 3], [1, 0, 2]), { messages: 3, toolCalls: 3 })
    expect([...rows.keys()].sort()).toEqual(['2026-03-01', '2026-03-03'])
    expect(rows.get('2026-03-01')).toEqual({ messages: 2, tool_calls: 1 })
    expect(rows.get('2026-03-03')).toEqual({ messages: 1, tool_calls: 2 })
  })

  it('scales to the session totals when they differ from what the turns show', () => {
    const rows = activityByDay(summary('s'), turns([1, 3]), { messages: 10, toolCalls: 0 })
    expect([...rows.values()].reduce((a, r) => a + r.messages, 0)).toBe(10)
  })

  it('puts everything on the last active day when no turn has a time', () => {
    const rows = activityByDay(summary('s'), { turns: [], tokensByModel: {}, toolFrequency: {} } as unknown as SessionDetail, { messages: 4, toolCalls: 0 })
    expect([...rows]).toEqual([['2026-03-03', { messages: 4, tool_calls: 0 }]])
  })
})

describe('stats from the per-day rows', () => {
  it('counts a session on the day it started and its messages on the days they happened', () => {
    const db = openHistoryDb(':memory:')
    ingestSessions(db, [
      { summary: summary('s', { messageCount: 3, startedAt: at(1), lastActiveAt: at(3), durationMs: 2 * 86_400_000 }), detail: turns3() },
    ])
    const stats = statsFromHistory(db)!
    const day = (d: string) => stats.dailyActivity.find((a) => a.date === d)!
    expect(day('2026-03-01').sessionCount).toBe(1)
    expect(day('2026-03-03').sessionCount).toBe(0)
    expect(day('2026-03-01').messageCount).toBe(2)
    expect(day('2026-03-03').messageCount).toBe(1)
    // The turns are a day apart, so no time was spent working.
    expect(stats.dailyActivity.reduce((s, a) => s + (a.durationMs ?? 0), 0)).toBe(0)
  })

  it('spreads the totals of a session whose transcript is gone, with nothing lost', () => {
    const db = openHistoryDb(':memory:')
    ingestSessions(db, [{ summary: summary('old', { messageCount: 10, toolCallCount: 4, startedAt: at(1), lastActiveAt: at(3) }), detail: null }])
    const stats = statsFromHistory(db)!
    expect(stats.dailyActivity.reduce((s, a) => s + a.messageCount, 0)).toBe(10)
    expect(stats.dailyActivity.reduce((s, a) => s + a.toolCallCount, 0)).toBe(4)
    expect(stats.dailyActivity.find((a) => a.date === '2026-03-01')!.sessionCount).toBe(1)
  })
})

function turns3(): SessionDetail {
  return {
    turns: [1, 1, 3].map((day, i) => ({ uuid: `t${i}`, type: 'user', timestamp: at(day), toolCalls: [] })),
    tokensByModel: {}, toolFrequency: {},
  } as unknown as SessionDetail
}

describe('active time in the history', () => {
  const close = (): SessionDetail =>
    ({
      turns: [0, 4, 8, 60].map((min, i) => ({ uuid: `c${i}`, type: 'user', timestamp: new Date(2026, 2, 1, 12, min).toISOString(), toolCalls: [] })),
      tokensByModel: {}, toolFrequency: {},
    }) as unknown as SessionDetail

  it('counts the minutes between messages that are close together, and not the long pause', () => {
    const db = openHistoryDb(':memory:')
    ingestSessions(db, [{ summary: summary('s', { messageCount: 4, startedAt: at(1), lastActiveAt: at(1, 13), durationMs: 3_600_000 }), detail: close() }])
    expect(db.prepare('SELECT active_ms FROM sessions').get()!.active_ms).toBe(8 * 60_000)
    const stats = statsFromHistory(db)!
    expect(stats.dailyActivity.reduce((s, a) => s + (a.durationMs ?? 0), 0)).toBe(8 * 60_000)
  })

  it('estimates from the message count for a session whose messages are gone', () => {
    const db = openHistoryDb(':memory:')
    ingestSessions(db, [{ summary: summary('s', { messageCount: 4, durationMs: 86_400_000 }), detail: null }])
    expect(db.prepare('SELECT active_ms FROM sessions').get()!.active_ms).toBeNull()
    const stats = statsFromHistory(db)!
    expect(stats.dailyActivity.reduce((s, a) => s + (a.durationMs ?? 0), 0)).toBe(4 * 45_000)
  })
})
