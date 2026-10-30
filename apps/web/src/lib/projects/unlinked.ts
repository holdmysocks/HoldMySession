/**
 * "Unlinked" sessions are the ones that do not belong to a real project: no working directory was
 * recorded, or they ran in a folder whose name starts with "scratch" (scratch, scratch-1a2b, ...).
 * Stats group them into one entry instead of one row per scratch folder, and the map's project
 * dropdown leaves them out. Pure, so the server and the browser agree.
 */

/** Stands in for a project path when asking for the unlinked group. Cannot clash with a real path. */
export const UNLINKED_PROJECT_KEY = '__unlinked__'

export const UNLINKED_PROJECT_NAME = 'Unlinked Sessions'

/** A folder name starting with this marks a session as not being in a project. Compared in lower case. */
const SCRATCH_PREFIX = 'scratch'

export interface UnlinkedCandidate {
  cwd: string | null
  projectName: string
  projectDisplayName?: string
}

export function isUnlinkedSession(session: UnlinkedCandidate): boolean {
  if (typeof session.cwd !== 'string' || session.cwd.trim() === '') return true
  return [session.projectName, session.projectDisplayName].some(
    (name) => typeof name === 'string' && name.trim().toLowerCase().startsWith(SCRATCH_PREFIX),
  )
}

/** The key sessions are grouped under: the unlinked key, or the session's project path. */
export function projectGroupKey(session: UnlinkedCandidate & { projectPath: string }): string {
  return isUnlinkedSession(session) ? UNLINKED_PROJECT_KEY : session.projectPath
}
