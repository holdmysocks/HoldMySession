import { readSettingsFile } from '@/lib/settings-file'
import { openHistoryDb } from '@/lib/history/history-db'
import { runCommand } from '@/lib/live/handlers'
import { isLinkedNode } from './shared'
import { masterCandidates, noteGoodAddress } from './node-sync'
import { selfMachineId } from './machines'
import type { Command } from './channel'

const POLL_WAIT_SECONDS = 25
const POLL_TIMEOUT_MS = 40_000

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref?.())

export interface AgentDeps {
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
  run: (kind: string, params: unknown) => Promise<unknown>
}

const defaultDeps: AgentDeps = { fetch: fetch as unknown as AgentDeps['fetch'], run: runCommand }

/** Answers one command from the master: works out the answer and posts it back. A failure is reported, never thrown. */
export async function answerCommand(base: string, token: string, machineId: string, command: Command, deps: AgentDeps = defaultDeps): Promise<void> {
  let body: { ok: boolean; data?: unknown; error?: string }
  try {
    body = { ok: true, data: await deps.run(command.kind, command.params) }
  } catch (error) {
    body = { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  await deps.fetch(`${base}/api/link/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ machineId, id: command.id, ...body }),
    signal: AbortSignal.timeout(60_000),
  })
}

/**
 * One round: asks the master whether it wants anything, and answers whatever it says. Returns how
 * long to wait before the next round, in ms. The request is held open by the master, so when it has
 * something the answer arrives at once, and when nobody is looking nothing is sent but this
 * heartbeat.
 */
export async function agentRound(deps: AgentDeps = defaultDeps, failures = { count: 0 }): Promise<number> {
  const settings = readSettingsFile()
  if (!isLinkedNode(settings)) return 10_000
  const candidates = masterCandidates(settings.link)
  if (candidates.length === 0) return 30_000
  // After a failure the next address is tried, so a master that moved between networks is found again.
  const base = candidates[failures.count % candidates.length]

  let machineId: string
  const db = openHistoryDb()
  try {
    machineId = selfMachineId(db)
  } finally {
    db.close()
  }

  try {
    const response = await deps.fetch(`${base}/api/link/poll?machineId=${encodeURIComponent(machineId)}&wait=${POLL_WAIT_SECONDS}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${settings.link.masterToken}` },
      signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    })
    if (!response.ok) {
      failures.count += 1
      return response.status === 401 || response.status === 403 ? 30_000 : Math.min(60_000, 5_000 * 2 ** failures.count)
    }
    failures.count = 0
    noteGoodAddress(base)
    const { commands } = (await response.json()) as { commands: Command[] }
    // Answered in the background, so the next request is open again straight away.
    for (const command of commands) void answerCommand(base, settings.link.masterToken, machineId, command, deps).catch(() => undefined)
    return 0
  } catch {
    failures.count += 1
    return Math.min(60_000, 5_000 * 2 ** failures.count)
  }
}

let started = false

/** Starts the node's loop in this server process. Safe to call any number of times. */
export function startNodeAgent(): void {
  if (started) return
  started = true
  const failures = { count: 0 }
  void (async () => {
    for (;;) {
      const wait = await agentRound(defaultDeps, failures).catch(() => 10_000)
      if (wait > 0) await sleep(wait)
    }
  })()
}
