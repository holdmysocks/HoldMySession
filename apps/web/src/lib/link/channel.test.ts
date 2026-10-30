import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { DEFAULT_SETTINGS } from '@/features/settings/settings.types'
import {
  beginSync, callNode, completeCall, endSync, isOnline, onlineMachineIds, pollCommands, recentActivity, resetChannel, touchActivity,
  ONLINE_WITHIN_MS,
} from './channel'
import { answerCommand, type AgentDeps } from './node-agent'
import { masterSyncTick, resetMasterSync, SYNC_EVERY_MS } from './master-sync'

vi.mock('@/lib/settings-file', () => ({ readSettingsFile: vi.fn() }))
import { readSettingsFile } from '@/lib/settings-file'

const NODE = 'node-machine-1'

beforeEach(() => {
  resetChannel()
  resetMasterSync()
  vi.mocked(readSettingsFile).mockReturnValue({ ...DEFAULT_SETTINGS, link: { ...DEFAULT_SETTINGS.link, role: 'master', nodeToken: 'x' } })
})
afterEach(() => vi.useRealTimers())

describe('asking a node', () => {
  it('hands a waiting poll the command at once, and returns the node\'s answer', async () => {
    const poll = pollCommands(NODE, 5_000)
    const call = callNode(NODE, 'session-detail', { sessionId: 's' })
    const [command] = await poll
    expect(command).toMatchObject({ kind: 'session-detail', params: { sessionId: 's' } })
    expect(completeCall(NODE, command.id, { ok: true, data: { hello: 'world' } })).toBe(true)
    await expect(call).resolves.toEqual({ hello: 'world' })
  })

  it('queues a command until the node next polls', async () => {
    const call = callNode(NODE, 'sessions', {})
    const [command] = await pollCommands(NODE, 5_000)
    completeCall(NODE, command.id, { ok: true, data: [1, 2] })
    await expect(call).resolves.toEqual([1, 2])
  })

  it('passes a node\'s problem on as an error', async () => {
    const call = callNode(NODE, 'project-map', {})
    const [command] = await pollCommands(NODE, 5_000)
    completeCall(NODE, command.id, { ok: false, error: 'Session not found' })
    await expect(call).rejects.toThrow('Session not found')
  })

  it('only lets the machine that was asked answer', async () => {
    const call = callNode(NODE, 'sessions', {})
    const [command] = await pollCommands(NODE, 5_000)
    expect(completeCall('someone-else', command.id, { ok: true, data: 'forged' })).toBe(false)
    expect(completeCall(NODE, 'no-such-id', { ok: true })).toBe(false)
    completeCall(NODE, command.id, { ok: true, data: 'real' })
    await expect(call).resolves.toBe('real')
  })

  it('gives up if the node does not answer, and does not leave the command for later', async () => {
    vi.useFakeTimers()
    const call = callNode(NODE, 'sessions', {}, 1_000)
    const rejected = expect(call).rejects.toThrow(/did not answer/)
    await vi.advanceTimersByTimeAsync(1_001)
    await rejected
    const poll = pollCommands(NODE, 100)
    await vi.advanceTimersByTimeAsync(101)
    expect(await poll).toEqual([])
  })

  it('returns nothing from a poll when there is nothing to do', async () => {
    vi.useFakeTimers()
    const poll = pollCommands(NODE, 2_000)
    await vi.advanceTimersByTimeAsync(2_001)
    expect(await poll).toEqual([])
  })
})

describe('who is connected', () => {
  it('counts a node as online for a short while after it last polled', async () => {
    expect(isOnline(NODE)).toBe(false)
    vi.useFakeTimers()
    const poll = pollCommands(NODE, 100)
    await vi.advanceTimersByTimeAsync(101)
    await poll
    expect(isOnline(NODE)).toBe(true)
    expect(onlineMachineIds()).toEqual([NODE])
    expect(isOnline(NODE, Date.now() + ONLINE_WITHIN_MS + 1)).toBe(false)
  })

  it('remembers recent activity for a limited time', () => {
    expect(recentActivity(1_000)).toBe(false)
    touchActivity(10_000)
    expect(recentActivity(1_000, 10_500)).toBe(true)
    expect(recentActivity(1_000, 12_000)).toBe(false)
  })
})

describe('the node answering', () => {
  it('works out the answer and posts it back, and reports a failure instead of throwing', async () => {
    const posted: Array<Record<string, unknown>> = []
    const deps = (run: AgentDeps['run']): AgentDeps => ({
      run,
      fetch: async (_url, init) => {
        posted.push(JSON.parse(init.body ?? '{}'))
        return { ok: true, status: 200, json: async () => ({}) }
      },
    })
    await answerCommand('http://m', 'tok', NODE, { id: 'c1', kind: 'sessions', params: {} }, deps(async () => ({ items: [] })))
    await answerCommand('http://m', 'tok', NODE, { id: 'c2', kind: 'project-map', params: {} }, deps(async () => { throw new Error('boom') }))
    expect(posted[0]).toMatchObject({ machineId: NODE, id: 'c1', ok: true, data: { items: [] } })
    expect(posted[1]).toMatchObject({ id: 'c2', ok: false, error: 'boom' })
  })
})

describe('the master asking for fresh stats', () => {
  async function connect() {
    vi.useFakeTimers()
    const poll = pollCommands(NODE, 100)
    await vi.advanceTimersByTimeAsync(101)
    await poll
  }

  it('asks nothing when nobody is looking', async () => {
    await connect()
    const ask = vi.fn(async () => undefined)
    expect(await masterSyncTick(Date.now(), ask)).toEqual([])
    expect(ask).not.toHaveBeenCalled()
  })

  it('asks a connected node to sync while a page is open, at most once a minute, and not while one is pending', async () => {
    await connect()
    touchActivity()
    let release!: () => void
    const ask = vi.fn(() => new Promise<undefined>((resolve) => { release = () => resolve(undefined) }))
    const now = Date.now()
    expect(await masterSyncTick(now, ask as never)).toEqual([NODE])
    expect(await masterSyncTick(now + SYNC_EVERY_MS + 1, ask as never)).toEqual([]) // still waiting for the first
    release()
    await vi.advanceTimersByTimeAsync(0)
    endSync(NODE)
    expect(await masterSyncTick(now + 1_000, ask as never)).toEqual([]) // under a minute since
    // A minute on, the node has polled again and a page is still open.
    await vi.advanceTimersByTimeAsync(SYNC_EVERY_MS)
    const poll = pollCommands(NODE, 100)
    await vi.advanceTimersByTimeAsync(101)
    await poll
    touchActivity()
    expect(await masterSyncTick(Date.now(), ask as never)).toEqual([NODE])
    expect(beginSync(NODE)).toBe(false)
  })

  it('does nothing on a node', async () => {
    vi.mocked(readSettingsFile).mockReturnValue(DEFAULT_SETTINGS)
    touchActivity()
    const ask = vi.fn(async () => undefined)
    expect(await masterSyncTick(Date.now(), ask)).toEqual([])
  })
})
