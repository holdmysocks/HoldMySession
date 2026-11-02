import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { scanAllSessions, scanAllSessionsWithPaths } from '@/lib/scanner/session-scanner'
import { computeProjectStats } from '@/lib/projects/project-stats'
import { UNLINKED_PROJECT_KEY, UNLINKED_PROJECT_NAME, projectGroupKey } from '@/lib/projects/unlinked'
import type { SessionSummary, StatsCache } from '@/lib/parsers/types'
import { isUnlinkedSession } from '@/lib/projects/unlinked'
import { hasProject } from '@/lib/map/session-visibility'
import { visibleInLists } from '@/lib/projects/project-prefs'
import type { ScratchMode } from '@/features/settings/settings.types'

export interface ProjectAnalytics {
  /** The project's path, or UNLINKED_PROJECT_KEY for the group of unlinked sessions. */
  projectPath: string
  /** The project's directory name under the Claude config, which the map is keyed by. */
  projectKey: string
  /** The project's folder name. The Sessions list filters on it. */
  projectName: string
  /** What to show: package.json name, git repo name, or the folder name. "Unlinked Sessions" for the group. */
  displayName: string
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
  /** 'group' puts scratch sessions in one entry, 'show' lists each scratch folder, 'hide' leaves them out of the list. */
  scratch: ScratchMode = 'group',
): ProjectAnalyticsResult {
  // Group sessions by project path. Sessions with no project all share one group.
  const projectMap = new Map<string, SessionSummary[]>()
  for (const session of allSessions) {
    if (scratch === 'hide' && isUnlinkedSession(session)) continue
    const key = scratch === 'show' && hasProject(session) ? session.projectPath : projectGroupKey(session)
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
      projectKey: isUnlinked ? '' : (firstSession.projectKey ?? ''),
      projectName: isUnlinked
        ? UNLINKED_PROJECT_NAME
        : (firstSession.projectName ?? projectPath.split('/').pop() ?? 'Unknown'),
      displayName: isUnlinked
        ? UNLINKED_PROJECT_NAME
        : (firstSession.projectDisplayName || firstSession.projectName || projectPath.split('/').pop() || 'Unknown'),
      totalSessions: sessions.length,
      activeSessions: sessions.filter((s) => s.isActive).length,
      totalMessages: sessions.reduce((sum, s) => sum + s.messageCount, 0),
      // Counted once across session files, so a fork's copy of its parent's history is not added again.
      outputTokens: sessions.reduce((sum, s) => sum + (s.uniqueOutputTokens ?? s.outputTokens ?? 0), 0),
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

const analyticsInputSchema = z.object({ machineId: z.string().optional() })

export const getProjectAnalytics = createServerFn({ method: 'GET' })
  .validator((input: unknown) => analyticsInputSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<ProjectAnalyticsResult> => {
    // On a master, projects span the machines chosen: this computer's live sessions, and the others' from the history.
    const { machineView } = await import('@/lib/link/scoped')
    const view = machineView(data.machineId)
    const local = view.includeSelf ? await scanAllSessions() : []
    // Hidden projects and the scratch mode shape this list only. Totals still count every session.
    const { readProjectPrefs } = await import('@/lib/projects/prefs-server')
    const { prefs, selfId } = readProjectPrefs()
    const all = [...local, ...view.remote]
    const shown = visibleInLists(all, { ...prefs, scratch: 'show' }, (s) => (s as { machineId?: string }).machineId ?? selfId)
    return aggregateProjectAnalytics(shown, prefs.scratch)
  })

const projectStatsInputSchema = z.object({ projectPath: z.string().min(1), machineId: z.string().optional() })

export const getProjectStats = createServerFn({ method: 'GET' })
  .validator((input: unknown) => projectStatsInputSchema.parse(input))
  .handler(async ({ data }): Promise<StatsCache | null> => {
    const { loadHistoryStats } = await import('@/lib/history/history-read')
    return (
      (await loadHistoryStats({ projectPath: data.projectPath, machineId: data.machineId })) ??
      (data.machineId ? null : computeProjectStats(await scanAllSessionsWithPaths(), data.projectPath))
    )
  })
