import { computeStatsFromSummaries } from '@/lib/parsers/stats-parser'
import { addOpenTime } from '@/lib/stats/open-time'
import { projectGroupKey } from './unlinked'
import type { StatsCache } from '@/lib/parsers/types'
import type { SessionSummaryWithPath } from '@/lib/scanner/session-scanner'

/**
 * Stats for the sessions of one project, in the same shape as the overall stats. `projectPath` is
 * a project's path or UNLINKED_PROJECT_KEY. It only selects sessions that were already scanned,
 * and is never read as a file path. Null when no session belongs to it.
 *
 * Server only: it reads session files. Import it from a server function's handler, not from code
 * that also runs in the browser.
 */
export async function computeProjectStats(
  sessions: SessionSummaryWithPath[],
  projectPath: string,
): Promise<StatsCache | null> {
  const inProject = sessions.filter((session) => projectGroupKey(session) === projectPath || session.projectPath === projectPath)
  if (inProject.length === 0) return null
  const stats = await computeStatsFromSummaries(inProject)
  return stats ? addOpenTime(stats, inProject) : null
}
