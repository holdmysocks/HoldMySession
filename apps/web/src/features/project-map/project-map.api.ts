import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { AgentInvocation, SessionSummary } from '@/lib/parsers/types'
import type { PendingQuestion } from '@/lib/map/pending-requests'
import type { ProjectMap } from '@/lib/map/project-map'
import { filterVisibleSessions } from '@/lib/map/session-visibility'
import type { HookEvent } from '@/lib/events/event-inbox'
import { isUnlinkedSession } from '@/lib/projects/unlinked'
import { isProjectHidden, type ProjectPrefs } from '@/lib/projects/project-prefs'

export interface MapProject {
  /** Directory name under projects/. Addresses the project in the URL. */
  projectKey: string
  /** Working directory from the transcripts, shown as the project's path. */
  projectPath: string
  projectDisplayName: string
  sessionCount: number
  activeCount: number
  lastActiveAt: string
  /** A scratch folder, which the Projects settings can hide. Missing from an older node, which already left them out. */
  unlinked?: boolean
  /** Set when the project is on another machine, and so is read from that machine. Left out for this computer's. */
  machineId?: string
  /** The machine's name, set on a master that has other machines linked. */
  machineName?: string
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
        unlinked: isUnlinkedSession(session),
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
export function dropdownSessions<T extends SessionSummary>(sessions: T[], includeScratch = false): T[] {
  const visible = filterVisibleSessions(sessions)
  return includeScratch ? visible : visible.filter((session) => !isUnlinkedSession(session))
}

/**
 * The projects the map's dropdown lists, from the Projects settings: scratch folders only when they
 * are listed as they are, and not the projects the user hid. `selfId` is this computer's machine id.
 */
export function filterMapProjects(projects: MapProject[], prefs: ProjectPrefs, selfId: string): MapProject[] {
  return projects.filter(
    (p) =>
      (prefs.scratch === 'show' || !p.unlinked) && !isProjectHidden(prefs, p.machineId ?? selfId, p.projectPath),
  )
}

/** The value a dropdown option and the URL use for a project: the folder name, with the machine in front for another machine's. */
export function mapProjectValue(p: Pick<MapProject, 'projectKey' | 'machineId'>): string {
  return p.machineId ? `${p.machineId}~${p.projectKey}` : p.projectKey
}

/** The map for one project, plus how many of its sessions were left out (no project, or archived). */
export interface ProjectMapResponse extends ProjectMap {
  hiddenNoProjectCount: number
  hiddenArchivedCount: number
}

const machineSchema = z.object({ machineId: z.string().optional() })

/**
 * The project dropdown. On a master with no machine chosen it lists this computer's projects and
 * those of every connected node, each marked with its machine. The Projects settings decide which
 * are listed. Scratch folders and hidden projects are left out here, so every machine follows this computer's choices.
 */
export const getMapProjects = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => machineSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<MapProject[]> => {
    const { readProjectPrefs } = await import('@/lib/projects/prefs-server')
    const { prefs, selfId } = readProjectPrefs()
    const { remoteCallFor } = await import('@/lib/link/remote-call')
    const remote = await remoteCallFor<MapProject[]>(data.machineId, 'map-projects', {})
    if (remote.used) {
      return filterMapProjects(remote.data.map((p) => ({ ...p, machineId: data.machineId })), prefs, selfId)
    }
    const { computeMapProjects } = await import('@/lib/live/project-map')
    const own = await computeMapProjects()
    const { nodeMapProjects } = await import('@/lib/link/scoped')
    const others = data.machineId ? { hasNodes: false, selfName: '', projects: [] } : await nodeMapProjects()
    // Only a master with nodes marks machines. A computer on its own lists its projects plainly.
    const named = others.hasNodes ? own.map((p) => ({ ...p, machineName: others.selfName })) : own
    return filterMapProjects([...named, ...others.projects], prefs, selfId)
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
