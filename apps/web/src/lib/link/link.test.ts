import { describe, it, expect } from 'vitest'
import type { SessionDetail, SessionSummary, TokenUsage } from '@/lib/parsers/types'
import { openHistoryDb, getMeta, setMeta, LATEST_SCHEMA_VERSION } from '@/lib/history/history-db'
import { ingestSessions } from '@/lib/history/ingest'
import { statsFromHistory } from '@/lib/history/history-stats'
import { DEFAULT_SETTINGS, type Settings } from '@/features/settings/settings.types'
import { acceptPush, PushRefused } from './receive'
import { listMachines, removeMachine, renameMachine, selfMachineId, hasOtherMachines } from './machines'
import { pushToMaster, normalizeMasterUrl, resendEverything, linkStatus, type FetchLike } from './node-sync'
import { buildShared, effectiveSettings, isLinkedNode } from './shared'
import { addPriceEntry } from '@/lib/history/price-store'
import { addSubscriptionPeriod } from '@/lib/history/subscription-store'
import { isAuthorizedNode, generateToken } from './auth'

const usage = (o: Partial<TokenUsage>): TokenUsage => ({ inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, ...o })
const at = (d: number) => new Date(2026, 2, d, 12).toISOString()
const summary = (id: string, extra: Partial<SessionSummary> = {}) =>
  ({ sessionId: id, projectKey: 'proj', projectPath: '/w/app', projectName: 'app', projectDisplayName: 'App', sessionName: `n-${id}`,
     cwd: '/w/app', startedAt: at(1), lastActiveAt: at(2), durationMs: 1000, messageCount: 2, toolCallCount: 0, ...extra }) as SessionSummary
const detail = (tokens: number): SessionDetail =>
  ({ turns: [{ uuid: 't', type: 'assistant', timestamp: at(2), model: 'm', toolCalls: [] }], tokensByModel: { m: usage({ inputTokens: tokens }) }, toolFrequency: {} }) as unknown as SessionDetail

const linked = (url = 'http://master:3000'): Settings => ({
  ...DEFAULT_SETTINGS, link: { ...DEFAULT_SETTINGS.link, role: 'node', masterUrl: url, masterToken: 'tok' },
})

/** A fetch that hands the request straight to a master's database, as the route does. */
function toMaster(master: ReturnType<typeof openHistoryDb>, masterSettings: Settings): FetchLike & { calls: number } {
  const fn = (async (_url: string, init: { headers: Record<string, string>; body?: string }) => {
    fn.calls += 1
    if (init.headers.Authorization !== `Bearer ${masterSettings.link.nodeToken}`) return { ok: false, status: 401, json: async () => ({ message: 'The token was refused.' }) }
    try {
      const result = acceptPush(master, JSON.parse(init.body ?? '{}'))
      const self = master.prepare('SELECT name FROM machines WHERE machine_id = ?').get(selfMachineId(master))
      return { ok: true, status: 200, json: async () => ({ ok: true, ...result, masterName: String(self?.name), shared: buildShared(master, masterSettings) }) }
    } catch (error) {
      if (error instanceof PushRefused) return { ok: false, status: error.status, json: async () => ({ message: error.message }) }
      throw error
    }
  }) as unknown as FetchLike & { calls: number }
  fn.calls = 0
  return fn
}

const masterSettings: Settings = { ...DEFAULT_SETTINGS, link: { ...DEFAULT_SETTINGS.link, role: 'master', nodeToken: 'tok' } }

describe('a node sending to a master', () => {
  it('sends sessions and usage, and the master can show the node apart or together', async () => {
    const master = openHistoryDb(':memory:')
    const node = openHistoryDb(':memory:')
    ingestSessions(master, [{ summary: summary('own'), detail: detail(100) }])
    ingestSessions(node, [{ summary: summary('a'), detail: detail(10) }, { summary: summary('b'), detail: detail(20) }])

    const outcome = await pushToMaster(node, linked(), '1.0', toMaster(master, masterSettings))
    expect(outcome).toMatchObject({ ok: true, sent: 2 })

    const nodeId = selfMachineId(node)
    expect(statsFromHistory(master)!.totalSessions).toBe(3)
    expect(statsFromHistory(master, { machineId: nodeId })!.totalSessions).toBe(2)
    expect(statsFromHistory(master, { machineId: selfMachineId(master) })!.totalSessions).toBe(1)
    expect(hasOtherMachines(master)).toBe(true)
    expect(listMachines(master).map((m) => m.isSelf)).toEqual([true, false])
  })

  it('sends each day\'s messages and tool calls, so the master counts days exactly', async () => {
    const master = openHistoryDb(':memory:')
    const node = openHistoryDb(':memory:')
    ingestSessions(node, [{ summary: summary('a'), detail: detail(10) }])
    const nodeId = selfMachineId(node)
    const sentFrom = node.prepare('SELECT COUNT(*) AS n FROM activity_daily WHERE machine_id = ?').get(nodeId)!.n
    expect(Number(sentFrom)).toBeGreaterThan(0)

    await pushToMaster(node, linked(), '1.0', toMaster(master, masterSettings))
    const got = master.prepare('SELECT SUM(messages) AS m FROM activity_daily WHERE machine_id = ?').get(nodeId)!.m
    const sent = node.prepare('SELECT SUM(messages) AS m FROM activity_daily WHERE machine_id = ?').get(nodeId)!.m
    expect(Number(got)).toBe(Number(sent))
  })

  it('sends only what changed, and still checks in when there is nothing new', async () => {
    const master = openHistoryDb(':memory:')
    const node = openHistoryDb(':memory:')
    ingestSessions(node, [{ summary: summary('a'), detail: detail(10) }, { summary: summary('b'), detail: detail(20) }])
    const fetchImpl = toMaster(master, masterSettings)
    await pushToMaster(node, linked(), '1.0', fetchImpl)

    expect((await pushToMaster(node, linked(), '1.0', fetchImpl)).sent).toBe(0)
    expect(fetchImpl.calls).toBe(2)

    ingestSessions(node, [{ summary: summary('a'), detail: detail(99) }, { summary: summary('b'), detail: detail(20) }])
    expect((await pushToMaster(node, linked(), '1.0', fetchImpl)).sent).toBe(1)
    expect(Number(master.prepare("SELECT SUM(input_tokens) AS n FROM usage_daily WHERE session_key LIKE '%:a'").get()!.n)).toBe(99)
  })

  it('keeps a session after its transcript is gone on the node, marked as not on disk', async () => {
    const master = openHistoryDb(':memory:')
    const node = openHistoryDb(':memory:')
    ingestSessions(node, [{ summary: summary('a'), detail: detail(10) }])
    const fetchImpl = toMaster(master, masterSettings)
    await pushToMaster(node, linked(), '1.0', fetchImpl)
    ingestSessions(node, [])
    expect((await pushToMaster(node, linked(), '1.0', fetchImpl)).sent).toBe(1)
    expect(master.prepare("SELECT on_disk FROM sessions WHERE session_id = 'a'").get()).toMatchObject({ on_disk: 0 })
    expect(statsFromHistory(master)!.totalSessions).toBe(1)
  })

  it('does not move forward when the master refuses, and catches up next time', async () => {
    const master = openHistoryDb(':memory:')
    const node = openHistoryDb(':memory:')
    ingestSessions(node, [{ summary: summary('a'), detail: detail(10) }])
    const wrong = { ...linked(), link: { ...linked().link, masterToken: 'wrong' } }
    const fetchImpl = toMaster(master, masterSettings)

    const failed = await pushToMaster(node, wrong, '1.0', fetchImpl)
    expect(failed).toMatchObject({ ok: false, message: 'The token was refused.' })
    expect(linkStatus(node).lastError).toBe('The token was refused.')
    expect(Number(master.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n)).toBe(0)

    expect(await pushToMaster(node, linked(), '1.0', fetchImpl)).toMatchObject({ ok: true, sent: 1 })
    expect(linkStatus(node).lastError).toBeNull()
  })

  it('reports a master that cannot be reached', async () => {
    const node = openHistoryDb(':memory:')
    const down: FetchLike = async () => { throw new Error('connect ECONNREFUSED') }
    const outcome = await pushToMaster(node, linked(), '1.0', down)
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toMatch(/Could not reach the master/)
  })

  it('does nothing for a node that is not linked', async () => {
    const node = openHistoryDb(':memory:')
    const fetchImpl = toMaster(openHistoryDb(':memory:'), masterSettings)
    expect(await pushToMaster(node, DEFAULT_SETTINGS, '1.0', fetchImpl)).toMatchObject({ skipped: true })
    expect(fetchImpl.calls).toBe(0)
  })

  it('can resend everything', async () => {
    const master = openHistoryDb(':memory:')
    const node = openHistoryDb(':memory:')
    ingestSessions(node, [{ summary: summary('a'), detail: detail(10) }])
    const fetchImpl = toMaster(master, masterSettings)
    await pushToMaster(node, linked(), '1.0', fetchImpl)
    resendEverything(node)
    expect((await pushToMaster(node, linked(), '1.0', fetchImpl)).sent).toBe(1)
    expect(Number(master.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n)).toBe(1)
  })
})

describe('what the master refuses', () => {
  const payload = (over: object = {}) => ({
    machine: { machineId: 'node-machine-id-1', name: 'Laptop', nameUpdatedAt: at(1), appVersion: '1', schemaVersion: LATEST_SCHEMA_VERSION },
    sessions: [],
    ...over,
  })

  it('refuses a payload that is not in the expected form', () => {
    expect(() => acceptPush(openHistoryDb(':memory:'), { nonsense: true })).toThrow(PushRefused)
  })

  it('refuses a node with the master\'s own id, such as a copied database', () => {
    const master = openHistoryDb(':memory:')
    expect(() => acceptPush(master, payload({ machine: { ...payload().machine, machineId: selfMachineId(master) } }))).toThrow(/same id/)
  })

  it('refuses a node on a different database version', () => {
    const master = openHistoryDb(':memory:')
    expect(() => acceptPush(master, payload({ machine: { ...payload().machine, schemaVersion: LATEST_SCHEMA_VERSION - 1 } }))).toThrow(/different versions/)
  })

  it('never lets a node write another machine\'s rows', () => {
    const master = openHistoryDb(':memory:')
    ingestSessions(master, [{ summary: summary('own'), detail: detail(5) }])
    const row = { session_key: 'proj:own', session_id: 'own', project_key: 'proj', project_path: '/p', project_display_name: 'P', session_name: null,
      started_at: at(1), last_active_at: at(1), duration_ms: 0, message_count: 0, tool_call_count: 0, on_disk: 1, first_seen_at: at(1), cwd: '/p', project_name: 'p',
      usage: [{ day: '2026-03-01', model: 'm', input_tokens: 777, output_tokens: 0, thinking_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }], activity: [] }
    acceptPush(master, payload({ sessions: [row] }))
    // Same session key, different machine: two rows, and the master's own tokens are untouched.
    expect(Number(master.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n)).toBe(2)
    expect(Number(master.prepare('SELECT SUM(input_tokens) AS n FROM usage_daily WHERE machine_id = ?').get(selfMachineId(master))!.n)).toBe(5)
  })
})

describe('machine names', () => {
  it('starts as the computer name, and a node renames itself', async () => {
    const master = openHistoryDb(':memory:')
    const node = openHistoryDb(':memory:')
    const fetchImpl = toMaster(master, masterSettings)
    await pushToMaster(node, linked(), '1.0', fetchImpl)
    renameMachine(node, selfMachineId(node), 'Work laptop', new Date(Date.now() + 1000))
    await pushToMaster(node, linked(), '1.0', fetchImpl)
    expect(listMachines(master).find((m) => !m.isSelf)!.name).toBe('Work laptop')
  })

  it('lets the master rename a node, and the node takes the new name', async () => {
    const master = openHistoryDb(':memory:')
    const node = openHistoryDb(':memory:')
    const fetchImpl = toMaster(master, masterSettings)
    await pushToMaster(node, linked(), '1.0', fetchImpl)
    const nodeId = selfMachineId(node)
    renameMachine(master, nodeId, 'Desk PC', new Date(Date.now() + 5000))
    await pushToMaster(node, linked(), '1.0', fetchImpl)
    expect(listMachines(node).find((m) => m.isSelf)!.name).toBe('Desk PC')
    expect(listMachines(master).find((m) => !m.isSelf)!.name).toBe('Desk PC')
  })

  it('refuses an empty or very long name, and an unknown machine', () => {
    const db = openHistoryDb(':memory:')
    const id = selfMachineId(db)
    expect(() => renameMachine(db, id, '   ')).toThrow(/needs a name/)
    expect(() => renameMachine(db, id, 'x'.repeat(61))).toThrow(/at most/)
    expect(() => renameMachine(db, 'nobody', 'x')).toThrow(/No such machine/)
  })
})

describe('shared prices and plans', () => {
  it('a node takes the master\'s price entries, plans and overrides, and uses the overrides', async () => {
    const master = openHistoryDb(':memory:')
    const node = openHistoryDb(':memory:')
    addPriceEntry(master, { modelId: 'claude-opus-5-5', kind: 'from', startDay: '2026-03-01', endDay: null, inputPerMTok: 9, outputPerMTok: 9, cacheReadPerMTok: 9, cacheWritePerMTok: 9, note: 'x' })
    addSubscriptionPeriod(master, { tier: 'pro', monthlyUSD: 20, startDay: '2026-01-01', note: null })
    const ms: Settings = { ...masterSettings, pricingOverrides: { 'claude-opus-5-5': { inputPerMTok: 1, outputPerMTok: 2, cacheReadPerMTok: 3, cacheWritePerMTok: 4 } } }
    await pushToMaster(node, linked(), '1.0', toMaster(master, ms))

    expect(Number(node.prepare('SELECT COUNT(*) AS n FROM price_entries').get()!.n)).toBe(1)
    expect(Number(node.prepare('SELECT COUNT(*) AS n FROM subscription_periods').get()!.n)).toBe(1)
    expect(effectiveSettings(node, linked()).pricingOverrides['claude-opus-5-5'].inputPerMTok).toBe(1)
    expect(effectiveSettings(node, DEFAULT_SETTINGS).pricingOverrides).toEqual({})
  })

  it('knows whether it is a linked node', () => {
    expect(isLinkedNode(linked())).toBe(true)
    expect(isLinkedNode(DEFAULT_SETTINGS)).toBe(false)
    expect(isLinkedNode(masterSettings)).toBe(false)
  })
})

describe('removing a machine', () => {
  it('removes a node, with or without its data, and never this machine', async () => {
    const master = openHistoryDb(':memory:')
    const node = openHistoryDb(':memory:')
    ingestSessions(node, [{ summary: summary('a'), detail: detail(10) }])
    await pushToMaster(node, linked(), '1.0', toMaster(master, masterSettings))
    const nodeId = selfMachineId(node)
    removeMachine(master, nodeId, true)
    expect(listMachines(master)).toHaveLength(1)
    expect(Number(master.prepare('SELECT COUNT(*) AS n FROM sessions').get()!.n)).toBe(0)
    expect(() => removeMachine(master, selfMachineId(master), true)).toThrow(/cannot be removed/)
  })
})

describe('the token and address', () => {
  const headers = (v: string | null) => ({ get: () => v })
  it('accepts only the master\'s token, as a bearer token', () => {
    expect(isAuthorizedNode(headers('Bearer tok'), masterSettings)).toBe(true)
    expect(isAuthorizedNode(headers('Bearer nope'), masterSettings)).toBe(false)
    expect(isAuthorizedNode(headers('tok'), masterSettings)).toBe(false)
    expect(isAuthorizedNode(headers(null), masterSettings)).toBe(false)
    expect(isAuthorizedNode(headers('Bearer tok'), DEFAULT_SETTINGS)).toBe(false)
    expect(isAuthorizedNode(headers('Bearer '), { ...masterSettings, link: { ...masterSettings.link, nodeToken: '' } })).toBe(false)
  })
  it('makes long random tokens', () => {
    expect(generateToken()).toMatch(/^[0-9a-f]{48}$/)
    expect(generateToken()).not.toBe(generateToken())
  })
  it('takes a local address or a tailnet one, with or without a trailing slash', () => {
    expect(normalizeMasterUrl('http://192.168.1.20:3000/')).toBe('http://192.168.1.20:3000')
    expect(normalizeMasterUrl(' http://100.101.102.103:3000 ')).toBe('http://100.101.102.103:3000')
    expect(normalizeMasterUrl('http://my-pc.tail1234.ts.net:3000')).toBe('http://my-pc.tail1234.ts.net:3000')
    expect(normalizeMasterUrl('ftp://x')).toBeNull()
    expect(normalizeMasterUrl('not a url')).toBeNull()
  })
})

describe('the machine id', () => {
  it('is stable and is in the machines list', () => {
    const db = openHistoryDb(':memory:')
    expect(getMeta(db, 'machine_id')).toBe(selfMachineId(db))
    setMeta(db, 'x', 'y')
    expect(listMachines(db)[0]).toMatchObject({ isSelf: true, machineId: selfMachineId(db) })
  })
})
