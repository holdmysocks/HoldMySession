import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { AgentInvocation, SessionSummary } from '@/lib/parsers/types'
import type { PendingQuestion } from '@/lib/map/pending-requests'
import type { ProjectMap } from '@/lib/map/project-map'
import { filterVisibleSessions } from '@/lib/map/session-visibility'
import type { HookEvent } from '@/lib/events/event-inbox'
import { isUnlinkedSession } from '@/lib/projects/unlinked'

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
export const detailCache = new Map<string, CachedSessionDetail>()

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

/**
 * Newest first by when the desktop app last saw activity in the session, falling back to the
 * transcript's last record. This is the order the map shows top-level sessions in.
 */
export function orderByActivity<T extends SessionSummary>(sessions: T[]): T[] {
  const time = (s: SessionSummary) => Date.parse(s.desktopActivityAt ?? s.lastActiveAt)
  return [...sessions].sort((a, b) => time(b) - time(a))
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

/**
 * The sessions the project dropdown is built from: visible ones (a working directory, not archived),
 * without the unlinked ones, since a scratch folder is not a project worth picking.
 */
export function dropdownSessions<T extends SessionSummary>(sessions: T[]): T[] {
  return filterVisibleSessions(sessions).filter((session) => !isUnlinkedSession(session))
}

/** The map for one project, plus how many of its sessions were left out (no project, or archived). */
export interface ProjectMapResponse extends ProjectMap {
  hiddenNoProjectCount: number
  hiddenArchivedCount: number
}

const machineSchema = z.object({ machineId: z.string().optional() })

/** The project dropdown lists projects with at least one real session: a working directory, and not scratch. */
export const getMapProjects = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => machineSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<MapProject[]> => {
    const { remoteCallFor } = await import('@/lib/link/remote-call')
    const remote = await remoteCallFor<MapProject[]>(data.machineId, 'map-projects', {})
    if (remote.used) return remote.data
    const { computeMapProjects } = await import('@/lib/live/project-map')
    return computeMapProjects()
  })

const projectMapInputSchema = z.object({
  projectKey: z.string().min(1).max(512),
  machineId: z.string().optional(),
})

export const getProjectMap = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => projectMapInputSchema.parse(input))
  .handler(async ({ data }): Promise<ProjectMapResponse> => {
    const { remoteCallFor } = await import('@/lib/link/remote-call')
    const remote = await remoteCallFor<ProjectMapResponse>(data.machineId, 'project-map', { projectKey: data.projectKey })
    if (remote.used) return remote.data
    const { computeProjectMap } = await import('@/lib/live/project-map')
    return computeProjectMap(data.projectKey)
  })

export const getHookEvents = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => machineSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<HookEvent[]> => {
    const { remoteCallFor } = await import('@/lib/link/remote-call')
    const remote = await remoteCallFor<HookEvent[]>(data.machineId, 'hook-events', {})
    if (remote.used) return remote.data
    const { computeHookEvents } = await import('@/lib/live/project-map')
    return computeHookEvents()
  })
