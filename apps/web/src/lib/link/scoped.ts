import { readSettingsFile } from '@/lib/settings-file'
import { openHistoryDb } from '@/lib/history/history-db'
import { includesSelf, remoteSessions, type RemoteSession } from './scope'
import { callNode, isOnline, touchActivity } from './channel'
import { selfMachineId } from './machines'
import type { LiveSessions } from '@/lib/live/sessions'
import type { MapProject } from '@/features/project-map/project-map.api'

export interface MachineView {
  /** This computer's own sessions belong in the view. */
  includeSelf: boolean
  /** Sessions of other machines that belong in the view. */
  remote: RemoteSession[]
}

/**
 * What a machine choice covers. Only a master has other machines' sessions, so for anything else the
 * choice is ignored and the view is this computer's sessions alone. Server only.
 */
export function machineView(machineId?: string): MachineView {
  if (readSettingsFile().link.role !== 'master') return { includeSelf: true, remote: [] }
  const db = openHistoryDb()
  try {
    return { includeSelf: includesSelf(db, machineId), remote: remoteSessions(db, machineId) }
  } finally {
    db.close()
  }
}

export interface LiveRemote extends LiveSessions {
  machine: { id: string; name: string }
}

export interface LiveMachineView {
  includeSelf: boolean
  /** Sessions of machines that are connected, as they are right now. */
  live: LiveRemote[]
  /** Sessions of machines that are not connected, or did not answer, as of their last push. Never active. */
  remote: RemoteSession[]
}

/**
 * Like `machineView`, but asks each connected node for its sessions as they are now, so status,
 * branch and model are live. A node that is not connected, or does not answer in time, falls back to
 * what it last sent. Looking at a node's sessions counts as activity, which keeps its sync going.
 */
export async function machineViewLive(machineId?: string): Promise<LiveMachineView> {
  if (readSettingsFile().link.role !== 'master') return { includeSelf: true, live: [], remote: [] }
  const db = openHistoryDb()
  let includeSelf: boolean
  let machines: Array<{ id: string; name: string }>
  try {
    includeSelf = includesSelf(db, machineId)
    const self = selfMachineId(db)
    machines = db
      .prepare('SELECT machine_id, name FROM machines WHERE machine_id != ?')
      .all(self)
      .map((r) => ({ id: String(r.machine_id), name: String(r.name) }))
      .filter((m) => !machineId || m.id === machineId)
  } finally {
    db.close()
  }
  if (machines.length > 0) touchActivity()

  const live: LiveRemote[] = []
  const fallbackIds: string[] = []
  await Promise.all(
    machines.map(async (m) => {
      if (!isOnline(m.id)) return void fallbackIds.push(m.id)
      try {
        const answer = (await callNode(m.id, 'sessions', {}, 8_000)) as LiveSessions
        live.push({ machine: m, ...answer })
      } catch {
        fallbackIds.push(m.id)
      }
    }),
  )
  const dbCopy = openHistoryDb()
  try {
    const remote = fallbackIds.flatMap((id) => remoteSessions(dbCopy, id))
    return { includeSelf, live, remote }
  } finally {
    dbCopy.close()
  }
}

/**
 * The map projects of every connected node, for a master's "all machines" map. A node that is
 * offline or does not answer is left out. `selfName` is this computer's name, to mark its own
 * projects. Looking counts as activity, which keeps the nodes' sync going. Server only.
 */
export async function nodeMapProjects(): Promise<{ hasNodes: boolean; selfName: string; projects: MapProject[] }> {
  if (readSettingsFile().link.role !== 'master') return { hasNodes: false, selfName: '', projects: [] }
  const db = openHistoryDb()
  let machines: Array<{ id: string; name: string }>
  let selfName = ''
  try {
    const self = selfMachineId(db)
    const rows = db.prepare('SELECT machine_id, name FROM machines').all()
    selfName = String(rows.find((r) => r.machine_id === self)?.name ?? '')
    machines = rows.filter((r) => r.machine_id !== self).map((r) => ({ id: String(r.machine_id), name: String(r.name) }))
  } finally {
    db.close()
  }
  if (machines.length === 0) return { hasNodes: false, selfName, projects: [] }
  touchActivity()
  const lists = await Promise.all(
    machines.map(async (m) => {
      if (!isOnline(m.id)) return []
      try {
        const answer = (await callNode(m.id, 'map-projects', {}, 8_000)) as MapProject[]
        return answer.map((p) => ({ ...p, machineId: m.id, machineName: m.name }))
      } catch {
        return []
      }
    }),
  )
  return { hasNodes: true, selfName, projects: lists.flat() }
}
