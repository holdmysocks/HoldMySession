import * as fs from 'node:fs'
import * as path from 'node:path'
import { scanAllSessionsWithPaths } from '@/lib/scanner/session-scanner'
import type { SessionSummaryWithPath } from '@/lib/scanner/session-scanner'
import { parseDetail } from '@/lib/parsers/session-parser'
import { readSubagentLastActivity } from '@/lib/parsers/subagent-discovery'
import { backgroundTaskDir, countRunningBackgroundTasks } from '@/lib/scanner/background-tasks'
import { findPendingQuestions } from '@/lib/map/pending-requests'
import { buildProjectMap, tokenTotal } from '@/lib/map/project-map'
import type { MapSessionInput } from '@/lib/map/project-map'
import { latestNotificationBySession, latestNotificationDetails, readRecentEvents } from '@/lib/events/event-inbox'
import type { HookEvent } from '@/lib/events/event-inbox'
import { filterArchivedSessions, filterHiddenSessions, filterVisibleSessions } from '@/lib/map/session-visibility'
import {
  detailCache, dropdownSessions, groupMapProjects, orderByActivity, resolveSessionDetail, selectMapSessions,
} from '@/features/project-map/project-map.api'
import type { MapProject, ProjectMapResponse, SessionDetailInput } from '@/features/project-map/project-map.api'

const HOOK_EVENTS_SHOWN = 100

const notificationInfo = (d: { message: string | null; notificationType: string | null } | undefined) => (d ? { message: d.message, type: d.notificationType } : null)

/** The projects on this computer's map dropdown. Server only. */
export async function computeMapProjects(): Promise<MapProject[]> {
  const sessions = await scanAllSessionsWithPaths()
  // Scratch folders are included, marked as such: whoever shows the list decides whether to list them.
  return groupMapProjects(dropdownSessions(sessions, true))
}

/** The map of one project's live sessions on this computer. Server only. */
export async function computeProjectMap(projectKey: string): Promise<ProjectMapResponse> {
  const data = { projectKey }
  const all = await scanAllSessionsWithPaths()
  const inProject = selectMapSessions(all, data.projectKey)
  // Sessions with no project, and archived sessions, are not drawn, and their subagents go with them.
  const sessions = orderByActivity(filterVisibleSessions(inProject))
  const hiddenNoProjectCount = filterHiddenSessions(inProject).length
  const hiddenArchivedCount = filterArchivedSessions(inProject).length

  const events = await readRecentEvents()
  const notifications = latestNotificationBySession(events)
  const notificationDetails = latestNotificationDetails(events)

  const inputs: MapSessionInput[] = []
  for (const session of sessions) {
    const stat = await fs.promises.stat(session.filePath).catch(() => null)
    if (!stat) continue

    const detail = await resolveSessionDetail(detailCache, session, stat.mtimeMs, () =>
      loadSessionDetail(session),
    )

    // Read every time, not cached: a subagent is running while its file keeps growing.
    const sessionDir = path.join(path.dirname(session.filePath), session.sessionId)
    inputs.push({
      summary: session,
      agents: detail.agents,
      subagentLastActivity: await readSubagentLastActivity(sessionDir),
      backgroundTaskCount: await countRunningBackgroundTasks(backgroundTaskDir(session.projectKey, session.sessionId)),
      pendingQuestions: detail.pendingQuestions,
      lastNotificationAt: notifications.get(session.sessionId) ?? null,
      notification: notificationInfo(notificationDetails.get(session.sessionId)),
      totalTokens: detail.totalTokens,
    })
  }

  const projectDisplayName = sessions[0]?.projectDisplayName ?? data.projectKey
  const projectPath = sessions[0]?.projectPath ?? data.projectKey
  return {
    ...buildProjectMap(data.projectKey, projectPath, projectDisplayName, inputs),
    hiddenNoProjectCount,
    hiddenArchivedCount,
  }
}

async function loadSessionDetail(session: SessionSummaryWithPath): Promise<SessionDetailInput> {
  const detail = await parseDetail(
    session.filePath,
    session.sessionId,
    session.projectPath,
    session.projectName,
  )
  return {
    agents: detail.agents,
    totalTokens: tokenTotal(detail.totalTokens),
    pendingQuestions: await findPendingQuestions(session.filePath),
  }
}


/** The newest hook events on this computer, newest first. Server only. */
export async function computeHookEvents(): Promise<HookEvent[]> {
  const events = await readRecentEvents(HOOK_EVENTS_SHOWN)
  return events.reverse()
}
