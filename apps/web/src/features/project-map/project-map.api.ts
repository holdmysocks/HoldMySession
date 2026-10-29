import * as fs from 'node:fs'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { scanAllSessionsWithPaths } from '@/lib/scanner/session-scanner'
import type { SessionSummaryWithPath } from '@/lib/scanner/session-scanner'
import { parseDetail } from '@/lib/parsers/session-parser'
import type { AgentInvocation, SessionSummary } from '@/lib/parsers/types'
import { findPendingQuestions } from '@/lib/map/pending-requests'
import type { PendingQuestion } from '@/lib/map/pending-requests'
import { buildProjectMap, tokenTotal } from '@/lib/map/project-map'
import type { MapSessionInput, ProjectMap } from '@/lib/map/project-map'
import { latestNotificationBySession, readRecentEvents } from '@/lib/events/event-inbox'
import type { HookEvent } from '@/lib/events/event-inbox'
import { extractProjectName } from '@/lib/utils/claude-path'

export const MAX_SESSIONS_PER_MAP = 25
const HOOK_EVENTS_SHOWN = 100

export interface MapProject {
  projectPath: string
  projectName: string
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

/**
 * Group interactive sessions into projects, most recently active first.
 * Non-interactive (headless) sessions are left out, so every listed project has a map.
 */
export function groupMapProjects(sessions: SessionSummary[]): MapProject[] {
  const byPath = new Map<string, MapProject>()

  for (const session of sessions) {
    if (!session.isInteractive) continue
    const existing = byPath.get(session.projectPath)
    if (existing) {
      existing.sessionCount += 1
      if (session.isActive) existing.activeCount += 1
      if (Date.parse(session.lastActiveAt) > Date.parse(existing.lastActiveAt)) {
        existing.lastActiveAt = session.lastActiveAt
      }
    } else {
      byPath.set(session.projectPath, {
        projectPath: session.projectPath,
        projectName: session.projectName,
        sessionCount: 1,
        activeCount: session.isActive ? 1 : 0,
        lastActiveAt: session.lastActiveAt,
      })
    }
  }

  return [...byPath.values()].sort(
    (a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt),
  )
}

/** The newest interactive sessions for one project, capped for the map. Input is newest first. */
export function selectMapSessions<T extends SessionSummary>(
  sessions: T[],
  projectPath: string,
  limit = MAX_SESSIONS_PER_MAP,
): T[] {
  return sessions
    .filter((s) => s.isInteractive && s.projectPath === projectPath)
    .slice(0, limit)
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

export const getMapProjects = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MapProject[]> => {
    const sessions = await scanAllSessionsWithPaths()
    return groupMapProjects(sessions)
  },
)

const projectMapInputSchema = z.object({
  projectPath: z.string().min(1).max(4096),
})

export const getProjectMap = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => projectMapInputSchema.parse(input))
  .handler(async ({ data }): Promise<ProjectMap> => {
    const all = await scanAllSessionsWithPaths()
    const sessions = selectMapSessions(all, data.projectPath)

    const notifications = latestNotificationBySession(await readRecentEvents())

    const inputs: MapSessionInput[] = []
    for (const session of sessions) {
      const stat = await fs.promises.stat(session.filePath).catch(() => null)
      if (!stat) continue

      const detail = await resolveSessionDetail(detailCache, session, stat.mtimeMs, () =>
        loadSessionDetail(session),
      )

      inputs.push({
        summary: session,
        agents: detail.agents,
        pendingQuestions: detail.pendingQuestions,
        lastNotificationAt: notifications.get(session.sessionId) ?? null,
        totalTokens: detail.totalTokens,
      })
    }

    const projectName = sessions[0]?.projectName ?? extractProjectName(data.projectPath)
    return buildProjectMap(data.projectPath, projectName, inputs)
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
