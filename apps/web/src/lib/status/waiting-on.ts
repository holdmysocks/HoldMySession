/**
 * What a session that has gone quiet is waiting on: subagents it started and background tasks, such as a long shell
 * command, that are still running. The transcript shows neither, so without this a session in that state looks done.
 * Pure, so the Sessions list and the Map say the same thing.
 */

/** A session whose own transcript has been quiet this long is waiting, rather than working alongside them. */
export const QUIET_BEFORE_WAITING_MS = 2 * 60_000

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * "Waiting on 2 agents and 1 background task", or "Working with ..." while the session itself is still busy.
 * `compact` says "task" for the Map's cards, which have little room. Null when there is nothing running.
 */
export function waitingOnText({ agents, tasks, quiet, compact = false }: { agents: number; tasks: number; quiet: boolean; compact?: boolean }): string | null {
  const parts: string[] = []
  if (agents > 0) parts.push(plural(agents, 'agent', 'agents'))
  if (tasks > 0) parts.push(plural(tasks, compact ? 'task' : 'background task', compact ? 'tasks' : 'background tasks'))
  if (parts.length === 0) return null
  return `${quiet ? 'Waiting on' : 'Working with'} ${parts.join(compact ? ', ' : ' and ')}`
}

/** Whether a session's own transcript has been quiet long enough for it to count as waiting. */
export function isQuiet(lastActiveAt: string, nowMs: number): boolean {
  return nowMs - Date.parse(lastActiveAt) > QUIET_BEFORE_WAITING_MS
}
