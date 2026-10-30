import { readSettingsFile } from '@/lib/settings-file'
import { openHistoryDb } from '@/lib/history/history-db'
import { selfMachineId } from '@/lib/link/machines'
import type { ProjectPrefs } from './project-prefs'

/** The Projects settings and this computer's machine id, which the hidden projects are keyed by. Server only. */
export function readProjectPrefs(): { prefs: ProjectPrefs; selfId: string } {
  const prefs = readSettingsFile().projects
  const db = openHistoryDb()
  try {
    return { prefs, selfId: selfMachineId(db) }
  } finally {
    db.close()
  }
}
