import { readSettingsFile } from '@/lib/settings-file'
import { beginSync, callNode, endSync, onlineMachineIds, recentActivity } from './channel'

/** Nodes are asked for fresh stats this often while someone is looking at this master. */
export const SYNC_EVERY_MS = 60_000
/** Someone counts as looking if a page asked for anything in this long. */
export const ACTIVE_WITHIN_MS = 3 * 60_000

const lastAsked = new Map<string, number>()

/**
 * One look at the clock on a master: if a page has been open recently, asks each connected node to
 * scan and send what changed, at most once a minute. A node that is busy or slow is not asked again
 * until it has answered. When nobody is looking, nothing is asked.
 */
export async function masterSyncTick(now: number = Date.now(), ask = callNode): Promise<string[]> {
  if (readSettingsFile().link.role !== 'master') return []
  if (!recentActivity(ACTIVE_WITHIN_MS, now)) return []
  const asked: string[] = []
  for (const machineId of onlineMachineIds(now)) {
    if (now - (lastAsked.get(machineId) ?? 0) < SYNC_EVERY_MS) continue
    if (!beginSync(machineId)) continue
    lastAsked.set(machineId, now)
    asked.push(machineId)
    void ask(machineId, 'sync', {}, 5 * 60_000)
      .catch(() => undefined)
      .finally(() => endSync(machineId))
  }
  return asked
}

export function resetMasterSync(): void {
  lastAsked.clear()
}
