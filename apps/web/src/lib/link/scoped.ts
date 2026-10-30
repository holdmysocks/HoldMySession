import { readSettingsFile } from '@/lib/settings-file'
import { openHistoryDb } from '@/lib/history/history-db'
import { includesSelf, remoteSessions, type RemoteSession } from './scope'

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
