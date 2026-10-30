/** The header the page sends on requests that change data. A page on another site cannot add it without a preflight the server refuses. */
export const GUARD_HEADER = 'x-holdmysession'

/**
 * A request is accepted when it carries the guard header and, if the browser says where it came from,
 * that is this same server. The dashboard has no login, so this keeps other websites open in the
 * same browser from replacing the history through localhost.
 */
export function isSameOriginRequest(request: { url: string; headers: { get(name: string): string | null } }): boolean {
  if (request.headers.get(GUARD_HEADER) !== '1') return false
  const origin = request.headers.get('origin')
  if (origin === null) return true
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}
