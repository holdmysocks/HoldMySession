import * as fs from 'node:fs'
import * as path from 'node:path'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { scanAllSessionsWithPaths } from '@/lib/scanner/session-scanner'
import type { SessionSummaryWithPath } from '@/lib/scanner/session-scanner'
import { parseDetail } from '@/lib/parsers/session-parser'
import { readSubagentWriteTimes } from '@/lib/parsers/subagent-discovery'
import type { AgentInvocation, SessionSummary } from '@/lib/parsers/types'
import { findPendingQuestions } from '@/lib/map/pending-requests'
import type { PendingQuestion } from '@/lib/map/pending-requests'
import { buildProjectMap, tokenTotal } from '@/lib/map/project-map'
import type { MapSessionInput, ProjectMap } from '@/lib/map/project-map'
import { latestNotificationBySession, readRecentEvents } from '@/lib/events/event-inbox'
import type { HookEvent } from '@/lib/events/event-inbox'
import { filterHiddenSessions, filterVisibleSessions } from '@/lib/map/session-visibility'

const HOOK_EVENTS_SHOWN = 100

export interface MapProject {
  /** Directory name under projects/. Addresses the project in the URL. */
  projectKey: string
  /** Working directory from the transcripts, shown as the project's path. */
  projectPath: string
  projectDisplayName: string
  sessionCount: number
  activeCount: number
  lastActiveAt: string
}

/** The per-session data that comes from parsing the JSONL file. Cached by file mtime. */
export interface SessionDetailInput {
  agents: AgentInvocation[]
  totalTokens: number
  pendingQuestions: PendingQuestion[]
}

export interface CachedSessionDetail extends SessionDetailInput {
  mtimeMs: number
}

/** Keyed by absolute file path. Server-side only; file paths never reach the client. */
const detailCache = new Map<string, CachedSessionDetail>()

/** Group sessions into projects by directory, most recently active first. Every session is counted. */
export function groupMapProjects(sessions: SessionSummary[]): MapProject[] {
  const byKey = new Map<string, MapProject>()

  for (const session of sessions) {
    const existing = byKey.get(session.projectKey)
    if (existing) {
      existing.sessionCount += 1
      if (session.isActive) existing.activeCount += 1
      if (Date.parse(session.lastActiveAt) > Date.parse(existing.lastActiveAt)) {
        existing.lastActiveAt = session.lastActiveAt
      }
    } else {
      byKey.set(session.projectKey, {
        projectKey: session.projectKey,
        projectPath: session.projectPath,
        projectDisplayName: session.projectDisplayName,
        sessionCount: 1,
        activeCount: session.isActive ? 1 : 0,
        lastActiveAt: session.lastActiveAt,
      })
    }
  }

  return [...byKey.values()].sort(
    (a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt),
  )
}

/** Every session in one project, in the order given (newest first). No cap: the map shows them all. */
export function selectMapSessions<T extends SessionSummary>(sessions: T[], projectKey: string): T[] {
  return sessions.filter((s) => s.projectKey === projectKey)
}

/**
 * Return parsed detail for a session, reusing the cached copy only when the session
 * is not active and the file mtime is unchanged. Active sessions are always re-parsed.
 * `load` is injected so the cache rules can be tested without the filesystem.
 */
export async function resolveSessionDetail(
  cache: Map<string, CachedSessionDetail>,
  session: { filePath: string; isActive: boolean },
  mtimeMs: number,
  load: () => Promise<SessionDetailInput>,
): Promise<SessionDetailInput> {
  const cached = cache.get(session.filePath)
  if (!session.isActive && cached && cached.mtimeMs === mtimeMs) {
    return cached
  }

  const detail = await load()
  cache.set(session.filePath, { mtimeMs, ...detail })
  return detail
}

/** The project dropdown lists only projects with at least one session that has a working directory. */
export const getMapProjects = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MapProject[]> => {
    const sessions = await scanAllSessionsWithPaths()
    return groupMapProjects(filterVisibleSessions(sessions))
  },
)

/** The map for one project, plus how many of its sessions were left out for having no project. */
export interface ProjectMapResponse extends ProjectMap {
  hiddenNoProjectCount: number
}

const projectMapInputSchema = z.object({
  projectKey: z.string().min(1).max(512),
})

export const getProjectMap = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => projectMapInputSchema.parse(input))
  .handler(async ({ data }): Promise<ProjectMapResponse> => {
    const all = await scanAllSessionsWithPaths()
    const inProject = selectMapSessions(all, data.projectKey)
    // Sessions with no project are not drawn, and their subagents go with them.
    const sessions = filterVisibleSessions(inProject)
    const hiddenNoProjectCount = filterHiddenSessions(inProject).length

    const notifications = latestNotificationBySession(await readRecentEvents())

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
        subagentWriteTimes: await readSubagentWriteTimes(sessionDir),
        pendingQuestions: detail.pendingQuestions,
        lastNotificationAt: notifications.get(session.sessionId) ?? null,
        totalTokens: detail.totalTokens,
      })
    }

    const projectDisplayName = sessions[0]?.projectDisplayName ?? data.projectKey
    const projectPath = sessions[0]?.projectPath ?? data.projectKey
    return {
      ...buildProjectMap(data.projectKey, projectPath, projectDisplayName, inputs),
      hiddenNoProjectCount,
    }
  })

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

export const getHookEvents = createServerFn({ method: 'GET' }).handler(
  async (): Promise<HookEvent[]> => {
    const events = await readRecentEvents(HOOK_EVENTS_SHOWN)
    return events.reverse()
  },
)
