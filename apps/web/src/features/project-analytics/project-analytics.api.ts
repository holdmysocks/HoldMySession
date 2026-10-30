import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { scanAllSessions, scanAllSessionsWithPaths } from '@/lib/scanner/session-scanner'
import { computeProjectStats } from '@/lib/projects/project-stats'
import { UNLINKED_PROJECT_KEY, UNLINKED_PROJECT_NAME, projectGroupKey } from '@/lib/projects/unlinked'
import type { SessionSummary, StatsCache } from '@/lib/parsers/types'

export interface ProjectAnalytics {
  /** The project's path, or UNLINKED_PROJECT_KEY for the group of unlinked sessions. */
  projectPath: string
  projectName: string
  /** True for the one entry that groups sessions with no project (and scratch folders). */
  isUnlinked: boolean
  totalSessions: number
  activeSessions: number
  totalMessages: number
  outputTokens: number
  totalDurationMs: number
  firstSessionAt: string
  lastSessionAt: string
}

export interface ProjectAnalyticsResult {
  projects: ProjectAnalytics[]
}

/**
 * Pure business logic for aggregating project analytics from sessions.
 * Exported for testing purposes.
 */
export function aggregateProjectAnalytics(
  allSessions: SessionSummary[],
): ProjectAnalyticsResult {
  // Group sessions by project path. Sessions with no project all share one group.
  const projectMap = new Map<string, SessionSummary[]>()
  for (const session of allSessions) {
    const key = projectGroupKey(session)
    const existing = projectMap.get(key) ?? []
    existing.push(session)
    projectMap.set(key, existing)
  }

  // Aggregate per project
  const projects: ProjectAnalytics[] = []
  for (const [projectPath, sessions] of projectMap) {
    if (sessions.length === 0) continue

    const firstSession = sessions[0]
    const isUnlinked = projectPath === UNLINKED_PROJECT_KEY
    projects.push({
      projectPath,
      isUnlinked,
      projectName: isUnlinked
        ? UNLINKED_PROJECT_NAME
        : (firstSession.projectName ?? projectPath.split('/').pop() ?? 'Unknown'),
      totalSessions: sessions.length,
      activeSessions: sessions.filter((s) => s.isActive).length,
      totalMessages: sessions.reduce((sum, s) => sum + s.messageCount, 0),
      outputTokens: sessions.reduce((sum, s) => sum + (s.outputTokens ?? 0), 0),
      totalDurationMs: sessions.reduce((sum, s) => sum + s.durationMs, 0),
      firstSessionAt: sessions.reduce(
        (min, s) => (s.startedAt < min ? s.startedAt : min),
        firstSession.startedAt,
      ),
      lastSessionAt: sessions.reduce(
        (max, s) => (s.lastActiveAt > max ? s.lastActiveAt : max),
        firstSession.lastActiveAt,
      ),
    })
  }

  // Sort by most recently active first
  projects.sort((a, b) => b.lastSessionAt.localeCompare(a.lastSessionAt))

  return { projects }
}

export const getProjectAnalytics = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ProjectAnalyticsResult> => {
    const allSessions = await scanAllSessions()
    return aggregateProjectAnalytics(allSessions)
  },
)

const projectStatsInputSchema = z.object({ projectPath: z.string().min(1) })

export const getProjectStats = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => projectStatsInputSchema.parse(input))
  .handler(async ({ data }): Promise<StatsCache | null> => {
    return computeProjectStats(await scanAllSessionsWithPaths(), data.projectPath)
  })
