import { randomUUID } from 'node:crypto'

/**
 * The master's side of asking a node for live data. A node keeps a request to the master open
 * ("polls"); when the master wants something, it answers that request with a command, and the node
 * posts the result back. The node never has to be reachable from the master, and when nobody is
 * looking the master sends nothing. State lives in memory in the server process: a restart simply
 * means nodes reconnect and nothing is lost, since every command is a question about right now.
 */

export interface Command {
  id: string
  kind: string
  params: unknown
}

interface PendingCall {
  machineId: string
  resolve: (data: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface Waiter {
  resolve: (commands: Command[]) => void
  timer: ReturnType<typeof setTimeout>
}

interface ChannelState {
  calls: Map<string, PendingCall>
  queue: Map<string, Command[]>
  waiters: Map<string, Waiter[]>
  lastPoll: Map<string, number>
  /** Machines with a background sync request already waiting, so they are not asked again until it is done. */
  syncing: Set<string>
  activityAt: number
}

// One state for the whole process, even if the bundler loads this module more than once.
const g = globalThis as unknown as { __holdmysessionChannel?: ChannelState }
const state: ChannelState = (g.__holdmysessionChannel ??= {
  calls: new Map(), queue: new Map(), waiters: new Map(), lastPoll: new Map(), syncing: new Set(), activityAt: 0,
})

/** How long after its last poll a node still counts as connected. A poll is held open for about 25 seconds. */
export const ONLINE_WITHIN_MS = 45_000

export class NodeOfflineError extends Error {
  constructor(name: string) {
    super(`${name} is not connected right now, so its live data is not available. It reconnects by itself when it is running and can reach this machine.`)
  }
}

export function isOnline(machineId: string, now: number = Date.now()): boolean {
  const last = state.lastPoll.get(machineId)
  return last !== undefined && now - last <= ONLINE_WITHIN_MS
}

export function onlineMachineIds(now: number = Date.now()): string[] {
  return [...state.lastPoll.keys()].filter((id) => isOnline(id, now))
}

/** Something on this machine is being looked at. Background requests to nodes only run while it is recent. */
export function touchActivity(now: number = Date.now()): void {
  state.activityAt = now
}

export function recentActivity(withinMs: number, now: number = Date.now()): boolean {
  return now - state.activityAt <= withinMs
}

function deliver(machineId: string, command: Command): void {
  const waiting = state.waiters.get(machineId)?.shift()
  if (waiting) {
    clearTimeout(waiting.timer)
    waiting.resolve([command])
    return
  }
  state.queue.set(machineId, [...(state.queue.get(machineId) ?? []), command])
}

/** Asks a node a question and waits for its answer. Rejects if it does not answer in time or reports a problem. */
export function callNode(machineId: string, kind: string, params: unknown, timeoutMs = 20_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const timer = setTimeout(() => {
      state.calls.delete(id)
      // A command nobody picked up is no use to the node later.
      state.queue.set(machineId, (state.queue.get(machineId) ?? []).filter((c) => c.id !== id))
      reject(new Error('The machine did not answer in time.'))
    }, timeoutMs)
    state.calls.set(id, { machineId, resolve, reject, timer })
    deliver(machineId, { id, kind, params })
  })
}

/**
 * A node's open request. Answers at once if something is waiting for it, otherwise holds for up to
 * `waitMs` and answers with whatever arrives, or nothing. Calling it counts as the node being here.
 */
export function pollCommands(machineId: string, waitMs: number): Promise<Command[]> {
  state.lastPoll.set(machineId, Date.now())
  const queued = state.queue.get(machineId) ?? []
  if (queued.length > 0) {
    state.queue.set(machineId, [])
    return Promise.resolve(queued)
  }
  return new Promise((resolve) => {
    const waiter: Waiter = {
      resolve: (commands) => {
        state.lastPoll.set(machineId, Date.now())
        resolve(commands)
      },
      timer: setTimeout(() => {
        const list = state.waiters.get(machineId) ?? []
        state.waiters.set(machineId, list.filter((w) => w !== waiter))
        state.lastPoll.set(machineId, Date.now())
        resolve([])
      }, waitMs),
    }
    state.waiters.set(machineId, [...(state.waiters.get(machineId) ?? []), waiter])
  })
}

/** A node's answer to a command. Only the machine that was asked can answer. */
export function completeCall(machineId: string, id: string, result: { ok: boolean; data?: unknown; error?: string }): boolean {
  const call = state.calls.get(id)
  if (!call || call.machineId !== machineId) return false
  clearTimeout(call.timer)
  state.calls.delete(id)
  if (result.ok) call.resolve(result.data)
  else call.reject(new Error(result.error || 'The machine could not answer.'))
  return true
}

/** Marks a background sync as asked for, or done. Returns false if one is already waiting. */
export function beginSync(machineId: string): boolean {
  if (state.syncing.has(machineId)) return false
  state.syncing.add(machineId)
  return true
}

export function endSync(machineId: string): void {
  state.syncing.delete(machineId)
}

/** For tests: forget everything. */
export function resetChannel(): void {
  for (const call of state.calls.values()) clearTimeout(call.timer)
  for (const list of state.waiters.values()) for (const w of list) clearTimeout(w.timer)
  state.calls.clear(); state.queue.clear(); state.waiters.clear(); state.lastPoll.clear(); state.syncing.clear(); state.activityAt = 0
}
