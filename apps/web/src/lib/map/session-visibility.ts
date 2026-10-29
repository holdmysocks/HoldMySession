/**
 * Which sessions the map and the Sessions list show. A session has a project when its
 * transcript records a working directory (`cwd`). A session without one has no project, so
 * the map and the Sessions list hide it. Pure, so the server and the browser agree.
 *
 * Stats and project analytics do not use this filter. They still count every session.
 */

export interface HasCwd {
  cwd: string | null
}

/** True when the session records a non-blank working directory. */
export function hasProject(session: HasCwd): boolean {
  return typeof session.cwd === 'string' && session.cwd.trim() !== ''
}

/** Sessions with a project, in their original order. */
export function filterVisibleSessions<T extends HasCwd>(sessions: T[]): T[] {
  return sessions.filter(hasProject)
}

/** Sessions with no project, in their original order. Their count is shown as "hidden (no project)". */
export function filterHiddenSessions<T extends HasCwd>(sessions: T[]): T[] {
  return sessions.filter((s) => !hasProject(s))
}
