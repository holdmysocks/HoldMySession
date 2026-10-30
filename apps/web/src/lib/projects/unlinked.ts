/**
 * "Unlinked" sessions are the ones that do not belong to a real project: no working directory was
 * recorded, or they ran in a folder named "scratch". Stats group them into one entry instead of one
 * row per scratch folder. Pure, so the server and the browser agree.
 */

/** Stands in for a project path when asking for the unlinked group. Cannot clash with a real path. */
export const UNLINKED_PROJECT_KEY = '__unlinked__'

export const UNLINKED_PROJECT_NAME = 'Unlinked Sessions'

/** Folder names that mark a session as not being in a project. Compared in lower case. */
const SCRATCH_NAMES = new Set(['scratch'])

export interface UnlinkedCandidate {
  cwd: string | null
  projectName: string
  projectDisplayName?: string
}

export function isUnlinkedSession(session: UnlinkedCandidate): boolean {
  if (typeof session.cwd !== 'string' || session.cwd.trim() === '') return true
  return [session.projectName, session.projectDisplayName].some(
    (name) => typeof name === 'string' && SCRATCH_NAMES.has(name.trim().toLowerCase()),
  )
}

/** The key sessions are grouped under: the unlinked key, or the session's project path. */
export function projectGroupKey(session: UnlinkedCandidate & { projectPath: string }): string {
  return isUnlinkedSession(session) ? UNLINKED_PROJECT_KEY : session.projectPath
}
