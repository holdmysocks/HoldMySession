/**
 * Which sessions the map and the Sessions list show. Every session falls into exactly one group:
 *
 * - visible: has a project (a non-blank `cwd`) and is not archived.
 * - archived: archived in the Claude desktop app. Hidden in total, counted as "archived hidden".
 * - no project: no working directory, and not archived. Counted as "hidden (no project)".
 *
 * Pure, so the server and the browser agree. Stats and project analytics do not use this
 * filter. They still count every session.
 */

export interface HasCwd {
  cwd: string | null
}

export interface HasArchived {
  isArchived?: boolean
}

/** True when the session records a non-blank working directory. */
export function hasProject(session: HasCwd): boolean {
  return typeof session.cwd === 'string' && session.cwd.trim() !== ''
}

/** True when the desktop app has archived the session. */
export function isArchived(session: HasArchived): boolean {
  return session.isArchived === true
}

/** Shown on the map and in the Sessions list: has a project and is not archived. */
export function isVisible(session: HasCwd & HasArchived): boolean {
  return hasProject(session) && !isArchived(session)
}

/** Sessions shown on the map and in the Sessions list, in their original order. */
export function filterVisibleSessions<T extends HasCwd & HasArchived>(sessions: T[]): T[] {
  return sessions.filter(isVisible)
}

/** Sessions with no project that are not archived. Their count is shown as "hidden (no project)". */
export function filterHiddenSessions<T extends HasCwd & HasArchived>(sessions: T[]): T[] {
  return sessions.filter((s) => !isArchived(s) && !hasProject(s))
}

/** Archived sessions. Their count is shown as "archived hidden". */
export function filterArchivedSessions<T extends HasArchived>(sessions: T[]): T[] {
  return sessions.filter(isArchived)
}
