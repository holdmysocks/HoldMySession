import { readSettingsFile } from '@/lib/settings-file'
import { openHistoryDb } from '@/lib/history/history-db'
import { callNode, isOnline, NodeOfflineError, touchActivity } from './channel'
import { selfMachineId } from './machines'

export type RemoteResult<T> = { used: false } | { used: true; data: T }

/**
 * For a server function that can answer from another machine. If a node was chosen on a master,
 * this asks that node and returns its answer. Otherwise `used` is false and the caller answers from
 * this computer. Looking at a node's data counts as activity, which keeps its background sync going.
 */
export async function remoteCallFor<T>(machineId: string | undefined, kind: string, params: unknown): Promise<RemoteResult<T>> {
  if (!machineId) return { used: false }
  if (readSettingsFile().link.role !== 'master') return { used: false }
  const db = openHistoryDb()
  let name: string
  try {
    if (machineId === selfMachineId(db)) return { used: false }
    const row = db.prepare('SELECT name FROM machines WHERE machine_id = ?').get(machineId)
    if (!row) throw new Error('That machine is not linked.')
    name = String(row.name)
  } finally {
    db.close()
  }
  touchActivity()
  if (!isOnline(machineId)) throw new NodeOfflineError(name)
  return { used: true, data: (await callNode(machineId, kind, params)) as T }
}
