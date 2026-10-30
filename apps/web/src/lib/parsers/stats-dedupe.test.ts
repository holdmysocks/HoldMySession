import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { computeStatsFromSummaries, removeDuplicateRequests } from './stats-parser'
import { parseDetail, type RequestUsageSink } from './session-parser'
import type { SessionSummaryWithPath } from '@/lib/scanner/session-scanner'

const usage = (input: number, output: number, cacheRead: number, cacheWrite: number) => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadInputTokens: cacheRead,
  cacheCreationInputTokens: cacheWrite,
})

describe('removeDuplicateRequests', () => {
  const detailOf = (u: ReturnType<typeof usage>) => ({
    totalTokens: { ...u },
    tokensByModel: { 'claude-x': { ...u } },
  })

  it('keeps a shared request in the session that started first and removes it from later ones', () => {
    const shared = usage(10, 5, 1000, 100)
    const details = new Map([
      ['old', detailOf(usage(30, 15, 3000, 300))],
      ['fork', detailOf(usage(20, 10, 2500, 200))],
    ])
    const sinks = new Map<string, RequestUsageSink>([
      ['old', new Map([['req_shared', { model: 'claude-x', usage: shared }], ['req_a', { model: 'claude-x', usage: usage(20, 10, 2000, 200) }]])],
      ['fork', new Map([['req_shared', { model: 'claude-x', usage: shared }], ['req_b', { model: 'claude-x', usage: usage(10, 5, 1500, 100) }]])],
    ])
    // The fork is listed first, to show the order comes from the start times, not the list.
    removeDuplicateRequests(
      [
        { sessionId: 'fork', startedAt: '2026-01-02T00:00:00Z' },
        { sessionId: 'old', startedAt: '2026-01-01T00:00:00Z' },
      ],
      details,
      sinks,
    )
    expect(details.get('old')!.totalTokens).toEqual(usage(30, 15, 3000, 300))
    expect(details.get('fork')!.totalTokens).toEqual(usage(10, 5, 1500, 100))
    expect(details.get('fork')!.tokensByModel['claude-x']).toEqual(usage(10, 5, 1500, 100))
  })

  it('does nothing when no request is shared', () => {
    const details = new Map([
      ['a', detailOf(usage(1, 1, 1, 1))],
      ['b', detailOf(usage(2, 2, 2, 2))],
    ])
    const sinks = new Map<string, RequestUsageSink>([
      ['a', new Map([['r1', { model: 'claude-x', usage: usage(1, 1, 1, 1) }]])],
      ['b', new Map([['r2', { model: 'claude-x', usage: usage(2, 2, 2, 2) }]])],
    ])
    removeDuplicateRequests(
      [
        { sessionId: 'a', startedAt: '2026-01-01T00:00:00Z' },
        { sessionId: 'b', startedAt: '2026-01-02T00:00:00Z' },
      ],
      details,
      sinks,
    )
    expect(details.get('a')!.totalTokens).toEqual(usage(1, 1, 1, 1))
    expect(details.get('b')!.totalTokens).toEqual(usage(2, 2, 2, 2))
  })

  it('never takes a total below zero', () => {
    const details = new Map([
      ['a', detailOf(usage(5, 5, 5, 5))],
      ['b', detailOf(usage(1, 1, 1, 1))],
    ])
    const sinks = new Map<string, RequestUsageSink>([
      ['a', new Map([['r', { model: 'claude-x', usage: usage(5, 5, 5, 5) }]])],
      ['b', new Map([['r', { model: 'claude-x', usage: usage(5, 5, 5, 5) }]])],
    ])
    removeDuplicateRequests(
      [
        { sessionId: 'a', startedAt: '2026-01-01T00:00:00Z' },
        { sessionId: 'b', startedAt: '2026-01-02T00:00:00Z' },
      ],
      details,
      sinks,
    )
    expect(details.get('b')!.totalTokens).toEqual(usage(0, 0, 0, 0))
  })
})

describe('stats across forked sessions', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-dedupe-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function record(sessionId: string, requestId: string, day: string, input: number, output: number, cacheRead: number) {
    return [
      { type: 'user', uuid: `${requestId}-u`, sessionId, timestamp: `2026-03-${day}T10:00:00.000Z`, cwd: '/w/app', message: { role: 'user', content: 'go' } },
      {
        type: 'assistant', uuid: `${requestId}-a`, sessionId, requestId, timestamp: `2026-03-${day}T10:01:00.000Z`, cwd: '/w/app',
        message: {
          role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0 },
        },
      },
    ]
  }

  function write(name: string, records: unknown[]): string {
    const file = path.join(dir, `${name}.jsonl`)
    fs.writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + '\n')
    return file
  }

  function summary(sessionId: string, filePath: string, startedAt: string): SessionSummaryWithPath {
    return {
      sessionId, filePath, startedAt, lastActiveAt: startedAt, projectPath: '/w/app', projectName: 'app',
      projectDisplayName: 'App', cwd: '/w/app', durationMs: 1, messageCount: 2,
    } as SessionSummaryWithPath
  }

  // The parent made req_1 and req_2. The fork starts later, holds copies of both, and adds req_3.
  const parentRecords = [...record('parent', 'req_1', '01', 100, 10, 5000), ...record('parent', 'req_2', '01', 200, 20, 6000)]
  const forkRecords = [
    ...record('fork', 'req_1', '01', 100, 10, 5000),
    ...record('fork', 'req_2', '01', 200, 20, 6000),
    ...record('fork', 'req_3', '02', 50, 5, 7000),
  ]

  it('records the requests a parse counted', async () => {
    const sink: RequestUsageSink = new Map()
    await parseDetail(write('parent', parentRecords), 'parent', '/w/app', 'app', sink)
    expect([...sink.keys()].sort()).toEqual(['req_1', 'req_2'])
    expect(sink.get('req_2')).toEqual({ model: 'claude-haiku-5-5', usage: { ...usage(200, 20, 6000, 0), thinkingTokens: 0 } })
  })

  it('counts a request that sits in a parent and a fork once', async () => {
    const stats = await computeStatsFromSummaries([
      summary('parent', write('parent', parentRecords), '2026-03-01T10:00:00.000Z'),
      summary('fork', write('fork', forkRecords), '2026-03-02T10:00:00.000Z'),
    ])
    // req_1, req_2 and req_3 once each.
    expect(stats!.modelUsage['claude-haiku-5-5']).toMatchObject({
      inputTokens: 350,
      outputTokens: 35,
      cacheReadInputTokens: 18000,
    })
  })

  it('gives the same totals whichever order the sessions are listed in', async () => {
    const parent = summary('parent', write('parent', parentRecords), '2026-03-01T10:00:00.000Z')
    const fork = summary('fork', write('fork', forkRecords), '2026-03-02T10:00:00.000Z')
    const one = await computeStatsFromSummaries([parent, fork])
    const other = await computeStatsFromSummaries([fork, parent])
    expect(other!.modelUsage).toEqual(one!.modelUsage)
  })
})

describe('reasoning tokens', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-thinking-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const assistant = (requestId: string, output: number, thinking: number | undefined) => ({
    type: 'assistant', uuid: requestId, sessionId: 's', requestId, timestamp: '2026-03-01T10:01:00.000Z', cwd: '/w/app',
    message: {
      role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }],
      usage: {
        input_tokens: 1, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
        ...(thinking === undefined ? {} : { output_tokens_details: { thinking_tokens: thinking } }),
      },
    },
  })

  it('adds up thinking tokens per model, once per request, from the transcript', async () => {
    const file = path.join(dir, 's.jsonl')
    // req_1 is written twice, as a streamed response is, and must count once.
    fs.writeFileSync(
      file,
      [assistant('req_1', 455, 307), assistant('req_1', 455, 307), assistant('req_2', 100, 40), assistant('req_3', 50, undefined)]
        .map((r) => JSON.stringify(r)).join('\n') + '\n',
    )
    const detail = await parseDetail(file, 's', '/w/app', 'app')
    expect(detail.tokensByModel['claude-opus-5-5'].outputTokens).toBe(605)
    expect(detail.tokensByModel['claude-opus-5-5'].thinkingTokens).toBe(347)
    expect(detail.totalTokens.thinkingTokens).toBe(347)
  })

  it('carries thinking tokens into the stats model usage, and a shared request does not add them twice', async () => {
    const parent = path.join(dir, 'parent.jsonl')
    const fork = path.join(dir, 'fork.jsonl')
    fs.writeFileSync(parent, [assistant('req_1', 100, 60)].map((r) => JSON.stringify(r)).join('\n') + '\n')
    fs.writeFileSync(fork, [assistant('req_1', 100, 60), assistant('req_2', 200, 20)].map((r) => JSON.stringify(r)).join('\n') + '\n')
    const summary = (id: string, file: string, start: string) =>
      ({ sessionId: id, filePath: file, startedAt: start, lastActiveAt: start, projectPath: '/w/app', projectName: 'app', projectDisplayName: 'App', cwd: '/w/app', durationMs: 1, messageCount: 1 }) as SessionSummaryWithPath
    const stats = await computeStatsFromSummaries([
      summary('parent', parent, '2026-03-01T10:00:00.000Z'),
      summary('fork', fork, '2026-03-02T10:00:00.000Z'),
    ])
    expect(stats!.modelUsage['claude-opus-5-5']).toMatchObject({ outputTokens: 300, thinkingTokens: 80 })
  })
})
