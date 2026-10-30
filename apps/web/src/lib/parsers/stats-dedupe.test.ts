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
        { id: 'fork', startedAt: '2026-01-02T00:00:00Z' },
        { id: 'old', startedAt: '2026-01-01T00:00:00Z' },
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
        { id: 'a', startedAt: '2026-01-01T00:00:00Z' },
        { id: 'b', startedAt: '2026-01-02T00:00:00Z' },
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
        { id: 'a', startedAt: '2026-01-01T00:00:00Z' },
        { id: 'b', startedAt: '2026-01-02T00:00:00Z' },
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

describe('duplicates across folders and subagents', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-dups-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const base = { sessionId: 's', cwd: '/w/app' }
  const asst = (requestId: string, input: number, output: number, cacheRead: number, extra: object = {}) => ({
    ...base, type: 'assistant', uuid: requestId, requestId, timestamp: '2026-03-01T10:01:00.000Z',
    message: {
      role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0 },
      ...extra,
    },
  })

  function write(file: string, records: unknown[]): string {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + '\n')
    return file
  }

  const summary = (id: string, filePath: string, startedAt: string) =>
    ({ sessionId: id, filePath, startedAt, lastActiveAt: startedAt, projectPath: '/w/app', projectName: 'app', projectDisplayName: 'App', cwd: '/w/app', durationMs: 1, messageCount: 1 }) as SessionSummaryWithPath

  it('counts both files when one session ID exists in two folders, and each request once', async () => {
    // The same session ID under two project folders: a resume from another directory.
    const a = write(path.join(dir, 'folder-a', 's.jsonl'), [asst('r1', 10, 5, 1000), asst('r2', 20, 5, 2000)])
    const b = write(path.join(dir, 'folder-b', 's.jsonl'), [asst('r1', 10, 5, 1000), asst('r2', 20, 5, 2000), asst('r3', 40, 5, 4000)])
    const stats = await computeStatsFromSummaries([
      summary('s', a, '2026-03-01T10:00:00.000Z'),
      summary('s', b, '2026-03-02T10:00:00.000Z'),
    ])
    expect(stats!.modelUsage['claude-opus-5-5']).toMatchObject({ inputTokens: 70, outputTokens: 15, cacheReadInputTokens: 7000 })
  })

  it('counts a subagent file copied into a fork once', async () => {
    const subagent = [asst('sub1', 100, 10, 9000), asst('sub2', 200, 20, 8000)]
    const parent = write(path.join(dir, 'parent.jsonl'), [asst('m1', 1, 1, 100)])
    write(path.join(dir, 'parent', 'subagents', 'agent-x.jsonl'), subagent)
    const fork = write(path.join(dir, 'fork.jsonl'), [asst('m1', 1, 1, 100), asst('m2', 2, 2, 200)])
    write(path.join(dir, 'fork', 'subagents', 'agent-x.jsonl'), subagent)
    const stats = await computeStatsFromSummaries([
      summary('parent', parent, '2026-03-01T10:00:00.000Z'),
      summary('fork', fork, '2026-03-02T10:00:00.000Z'),
    ])
    // m1, m2, sub1 and sub2 once each.
    expect(stats!.modelUsage['claude-opus-5-5']).toMatchObject({ inputTokens: 303, outputTokens: 33, cacheReadInputTokens: 17300 })
  })

  // A parent that dispatched a subagent: the main file has progress messages for it, and the
  // subagent's own file holds the same API call with the full usage.
  const dispatch = {
    ...asst('m1', 1, 1, 100),
    message: {
      role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'Task', input: { subagent_type: 'Explore', description: 'look' } }],
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 },
    },
  }
  const progress = (requestId: string, input: number, output: number, cacheRead: number) => ({
    ...base, type: 'progress', parentToolUseID: 'toolu_1', requestId, timestamp: '2026-03-01T10:02:00.000Z',
    data: {
      agentId: 'x',
      message: { message: { model: 'claude-opus-5-5', content: [], usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0 } } },
    },
  })

  it('keeps replacing progress tokens with the subagent file tokens, and still counts them once with a fork', async () => {
    const parent = write(path.join(dir, 'parent.jsonl'), [dispatch, progress('sub1', 5, 1, 50)])
    write(path.join(dir, 'parent', 'subagents', 'agent-x.jsonl'), [asst('sub1', 100, 10, 9000)])
    const alone = await computeStatsFromSummaries([summary('parent', parent, '2026-03-01T10:00:00.000Z')])
    // The main request plus the subagent's own figures, not the smaller progress figures added on top.
    expect(alone!.modelUsage['claude-opus-5-5']).toMatchObject({ inputTokens: 101, outputTokens: 11, cacheReadInputTokens: 9100 })

    // A fork holds the same history. It has the progress messages but not the subagent file.
    const fork = write(path.join(dir, 'fork.jsonl'), [dispatch, progress('sub1', 5, 1, 50)])
    const withFork = await computeStatsFromSummaries([
      summary('parent', parent, '2026-03-01T10:00:00.000Z'),
      summary('fork', fork, '2026-03-02T10:00:00.000Z'),
    ])
    expect(withFork!.modelUsage['claude-opus-5-5']).toMatchObject({ inputTokens: 101, outputTokens: 11, cacheReadInputTokens: 9100 })
  })
})

describe('records without a request ID', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-noreq-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  // A streamed response written three times, each with the same usage and message ID, and no request ID.
  const noRequestId = (messageId: string, output: number, cacheRead: number) => ({
    type: 'assistant', uuid: `${messageId}-${Math.random()}`, sessionId: 's', timestamp: '2026-03-01T10:01:00.000Z', cwd: '/w/app',
    message: {
      id: messageId, role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 2, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0 },
    },
  })

  it('counts a call once, by its message ID, when it was written several times with no request ID', async () => {
    const file = path.join(dir, 's.jsonl')
    fs.writeFileSync(file, [noRequestId('msg_1', 455, 50_000), noRequestId('msg_1', 455, 50_000), noRequestId('msg_1', 455, 50_000), noRequestId('msg_2', 100, 60_000)].map((r) => JSON.stringify(r)).join('\n') + '\n')
    const detail = await parseDetail(file, 's', '/w/app', 'app')
    expect(detail.tokensByModel['claude-opus-5-5']).toMatchObject({ inputTokens: 4, outputTokens: 555, cacheReadInputTokens: 110_000 })
  })

  it('counts such a call once across a parent and a fork', async () => {
    const parent = path.join(dir, 'parent.jsonl')
    const fork = path.join(dir, 'fork.jsonl')
    fs.writeFileSync(parent, [noRequestId('msg_1', 455, 50_000), noRequestId('msg_1', 455, 50_000)].map((r) => JSON.stringify(r)).join('\n') + '\n')
    fs.writeFileSync(fork, [noRequestId('msg_1', 455, 50_000), noRequestId('msg_3', 10, 70_000)].map((r) => JSON.stringify(r)).join('\n') + '\n')
    const summary = (id: string, filePath: string, startedAt: string) =>
      ({ sessionId: id, filePath, startedAt, lastActiveAt: startedAt, projectPath: '/w/app', projectName: 'app', projectDisplayName: 'App', cwd: '/w/app', durationMs: 1, messageCount: 1 }) as SessionSummaryWithPath
    const stats = await computeStatsFromSummaries([
      summary('parent', parent, '2026-03-01T10:00:00.000Z'),
      summary('fork', fork, '2026-03-02T10:00:00.000Z'),
    ])
    expect(stats!.modelUsage['claude-opus-5-5']).toMatchObject({ outputTokens: 465, cacheReadInputTokens: 120_000 })
  })
})
