import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { SessionDetail, SessionSummary, TokenUsage } from '@/lib/parsers/types'
import { openHistoryDb } from '@/lib/history/history-db'
import { ingestSessions } from '@/lib/history/ingest'
import { DEFAULT_SETTINGS, type Settings } from '@/features/settings/settings.types'
import { acceptPush, reportedIdle } from './receive'
import { selfMachineId } from './machines'
import { pushToMaster, type FetchLike } from './node-sync'
import { buildShared } from './shared'
import { readSettingsFile, writeSettingsFile } from '@/lib/settings-file'

const usage = (o: Partial<TokenUsage>): TokenUsage => ({ inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, ...o })
const at = (d: number) => new Date(2026, 2, d, 12).toISOString()
const summary = (id: string) =>
  ({ sessionId: id, projectKey: 'proj', projectPath: '/w/app', projectName: 'app', projectDisplayName: 'App', sessionName: `n-${id}`,
     cwd: '/w/app', startedAt: at(1), lastActiveAt: at(2), durationMs: 1000, messageCount: 2, toolCallCount: 0 }) as SessionSummary
const detail = (): SessionDetail =>
  ({ turns: [{ uuid: 't', type: 'assistant', timestamp: at(2), model: 'm', toolCalls: [] }], tokensByModel: { m: usage({ inputTokens: 5 }) }, toolFrequency: {} }) as unknown as SessionDetail

describe('the quit-when-idle choice between a node and its master', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-sync-'))
    vi.stubEnv('HOLDMYSESSION_DIR', dir)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const nodeSettings = (idle: Settings['idle']): Settings => ({ ...DEFAULT_SETTINGS, idle, link: { ...DEFAULT_SETTINGS.link, role: 'node', masterUrl: 'http://master:3000', masterToken: 'tok' } })
  const masterWith = (nodeIdle: Settings['link']['nodeIdle'] = {}): Settings => ({ ...DEFAULT_SETTINGS, link: { ...DEFAULT_SETTINGS.link, role: 'master', nodeToken: 'tok', nodeIdle } })

  /** A fetch that hands the push to a master's database and answers as the route does, including its choice for that node. */
  function toMaster(master: ReturnType<typeof openHistoryDb>, settings: Settings): FetchLike {
    return (async (_url: string, init: { body?: string }) => {
      const result = acceptPush(master, JSON.parse(init.body ?? '{}'))
      const self = master.prepare('SELECT name FROM machines WHERE machine_id = ?').get(selfMachineId(master))
      const mine = settings.link.nodeIdle[result.machineId]
      return { ok: true, status: 200, json: async () => ({ ok: true, ...result, masterName: String(self?.name), shared: buildShared(master, settings), nodeSettings: mine ? { idle: mine } : undefined }) }
    }) as unknown as FetchLike
  }

  const setup = () => {
    const master = openHistoryDb(':memory:')
    const node = openHistoryDb(':memory:')
    ingestSessions(node, [{ summary: summary('a'), detail: detail() }])
    return { master, node, nodeId: selfMachineId(node) }
  }

  it('the master learns what the node chose', async () => {
    const { master, node, nodeId } = setup()
    const idle = { quit: false, minutes: 60 as const, updatedAt: '2026-03-02T10:00:00.000Z' }
    await pushToMaster(node, nodeSettings(idle), '1.0', toMaster(master, masterWith()))
    expect(reportedIdle(master, nodeId)).toEqual(idle)
  })

  it('a node that does not report one (an older version) leaves nothing stored', async () => {
    const { master, nodeId } = setup()
    expect(reportedIdle(master, nodeId)).toBeNull()
  })

  it('the node takes the master\'s newer choice for it, and the file says when it was made', async () => {
    const { master, node, nodeId } = setup()
    writeSettingsFile({ ...nodeSettings({ quit: true, minutes: 30, updatedAt: '2026-03-02T10:00:00.000Z' }) })
    const policy = { quit: false, minutes: 120 as const, updatedAt: '2026-03-02T11:00:00.000Z' }
    await pushToMaster(node, readSettingsFile(), '1.0', toMaster(master, masterWith({ [nodeId]: policy })))
    expect(readSettingsFile().idle).toEqual(policy)
  })

  it('does not undo a later change made on the node itself', async () => {
    const { master, node, nodeId } = setup()
    const own = { quit: true, minutes: 10 as const, updatedAt: '2026-03-02T12:00:00.000Z' }
    writeSettingsFile({ ...nodeSettings(own) })
    const old = { quit: false, minutes: 120 as const, updatedAt: '2026-03-02T11:00:00.000Z' }
    await pushToMaster(node, readSettingsFile(), '1.0', toMaster(master, masterWith({ [nodeId]: old })))
    expect(readSettingsFile().idle).toEqual(own)
  })

  it('a choice for another node is not taken', async () => {
    const { master, node } = setup()
    const own = { quit: true, minutes: 30 as const, updatedAt: '2026-03-02T10:00:00.000Z' }
    writeSettingsFile({ ...nodeSettings(own) })
    await pushToMaster(node, readSettingsFile(), '1.0', toMaster(master, masterWith({ 'someone-else-0000': { quit: false, minutes: 120, updatedAt: '2026-03-02T11:00:00.000Z' } })))
    expect(readSettingsFile().idle).toEqual(own)
  })
})
