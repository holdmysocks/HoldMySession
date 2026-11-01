import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { scanAllSessions, scanAllSessionsWithPaths, getActiveSessions } from '@/lib/scanner/session-scanner'
import type { SessionSummary } from '@/lib/parsers/types'
import { findPendingQuestions } from '@/lib/map/pending-requests'
import { filterArchivedSessions, filterHiddenSessions, filterVisibleSessions } from '@/lib/map/session-visibility'
import { dropdownKey, labelScratch, visibleInLists } from '@/lib/projects/project-prefs'
import { UNLINKED_PROJECT_KEY, UNLINKED_PROJECT_NAME } from '@/lib/projects/unlinked'
import type { ScratchMode } from '@/features/settings/settings.types'
import { deriveSessionStatus } from '@/lib/status/session-status'
import { latestNotificationBySession, latestNotificationDetails, readRecentEvents } from '@/lib/events/event-inbox'

export const getSessionList = createServerFn({ method: 'GET' }).handler(
  async () => {
    return scanAllSessions()
  },
)

export const getActiveSessionList = createServerFn({ method: 'GET' }).handler(
  async () => {
    return getActiveSessions()
  },
)

const paginatedSessionsInputSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(5).max(100),
  search: z.string(),
  status: z.enum(['all', 'active', 'completed', 'needs-you', 'done']),
  project: z.string(),
  sort: z.enum(['lastActive', 'started', 'duration', 'messages']).default('lastActive'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  /** On a master: one machine's sessions. Left out for every machine. */
  machineId: z.string().optional(),
})

type PaginatedSessionsInput = z.infer<typeof paginatedSessionsInputSchema>

/** What the server adds to each listed session so the client can derive its status. */
export interface SessionStatusSignals {
  /** Latest Notification hook event for the session, ISO timestamp, or null. */
  lastNotificationAt: string | null
  /** What the latest Notification said, so a waiting session can show what it waits for. */
  notification?: { message: string | null; type: string | null } | null
  /** True only for active sessions with an unanswered AskUserQuestion. */
  hasOpenQuestion: boolean
  /** Set for a session of another machine, which has no transcript here: no detail page, no live status. */
  machine?: { id: string; name: string } | null
}

export type SessionListItem = SessionSummary & SessionStatusSignals

export interface ProjectFilterOption {
  /** Folder name. The `project` filter matches on this. */
  name: string
  displayName: string
}

export interface PaginatedSessionsResult<T extends SessionSummary = SessionSummary> {
  sessions: T[]
  totalCount: number
  totalPages: number
  page: number
  pageSize: number
  projects: ProjectFilterOption[]
}

/**
 * Pure business logic for paginating and filtering sessions.
 * Exported for testing purposes.
 */
export async function paginateAndFilterSessions<T extends SessionSummary>(
  allSessions: T[],
  input: PaginatedSessionsInput,
  /** With 'group', scratch sessions are one "Unlinked Sessions" entry in the project filter. */
  scratch: ScratchMode = 'show',
): Promise<PaginatedSessionsResult<T>> {
  const { page, pageSize, search, status, project, sort = 'lastActive', sortDir = 'desc' } = input

  // Distinct projects from the full unfiltered set, labelled by display name
  const projectLabels = new Map<string, string>()
  for (const s of allSessions) {
    const key = dropdownKey(s, scratch)
    if (!projectLabels.has(key)) projectLabels.set(key, key === UNLINKED_PROJECT_KEY ? UNLINKED_PROJECT_NAME : s.projectDisplayName)
  }
  const projects = Array.from(projectLabels, ([name, displayName]) => ({ name, displayName })).sort(
    (a, b) => a.displayName.localeCompare(b.displayName) || a.name.localeCompare(b.name),
  )

  // Apply filters
  let filtered = allSessions

  // Search filter: case-insensitive substring on names, branch, id and cwd
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(
      (s) =>
        s.projectName.toLowerCase().includes(q) ||
        s.projectDisplayName.toLowerCase().includes(q) ||
        s.sessionName?.toLowerCase().includes(q) ||
        s.branch?.toLowerCase().includes(q) ||
        s.sessionId.toLowerCase().includes(q) ||
        s.cwd?.toLowerCase().includes(q),
    )
  }

  // Status filter
  if (status === 'active') {
    filtered = filtered.filter((s) => s.isActive)
  } else if (status === 'completed') {
    filtered = filtered.filter((s) => !s.isActive)
  }

  // Project filter: exact match
  if (project) {
    filtered = filtered.filter((s) => dropdownKey(s, scratch) === project)
  }

  // Sort after filtering
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    switch (sort) {
      case 'lastActive':
        cmp = a.lastActiveAt.localeCompare(b.lastActiveAt)
        break
      case 'started':
        cmp = a.startedAt.localeCompare(b.startedAt)
        break
      case 'duration':
        cmp = a.durationMs - b.durationMs
        break
      case 'messages':
        cmp = a.messageCount - b.messageCount
        break
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalCount = sorted.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  // Clamp page to valid range
  const clampedPage = Math.min(Math.max(1, page), totalPages)

  // Slice to page
  const start = (clampedPage - 1) * pageSize
  const end = start + pageSize
  const sessions = sorted.slice(start, end)

  return {
    sessions,
    totalCount,
    totalPages,
    page: clampedPage,
    pageSize,
    projects,
  }
}

export interface PaginatedSessionsResponse extends PaginatedSessionsResult<SessionListItem> {
  /** Sessions left out because they record no working directory. Shown as "hidden (no project)". */
  hiddenNoProjectCount: number
  /** Sessions left out because the desktop app archived them. Shown as "archived hidden". */
  hiddenArchivedCount: number
  /** Every session the list could show, how many are running, and how many of those wait on the user. */
  totalAll: number
  runningCount: number
  needsYouCount: number
}

export const getPaginatedSessions = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => paginatedSessionsInputSchema.parse(input))
  .handler(async ({ data }): Promise<PaginatedSessionsResponse> => {
    // Sessions with no project, and archived sessions, are left out of the list, the page and the project dropdown.
    // On a master the list covers the machine chosen: this computer's live sessions, and the others' from the history.
    const { machineViewLive } = await import('@/lib/link/scoped')
    const view = await machineViewLive(data.machineId)
    // A connected node's sessions come as they are now. Their status is already worked out, and they have no file here.
    const liveRemote = view.live.flatMap((l) =>
      l.items.map((item) => ({ ...item, filePath: '' as const, machineId: l.machine.id, machineName: l.machine.name })),
    )
    const all = [...(view.includeSelf ? await scanAllSessionsWithPaths() : []), ...view.remote, ...liveRemote]
    // The Projects settings shape the list and the dropdown only. Totals elsewhere still count every session.
    const { readProjectPrefs } = await import('@/lib/projects/prefs-server')
    const { prefs, selfId } = readProjectPrefs()
    const allSessions = labelScratch(
      visibleInLists(filterVisibleSessions(all), prefs, (s) => (s as { machineId?: string }).machineId ?? selfId),
      prefs,
    )
    const hiddenNoProjectCount = filterHiddenSessions(all).length + view.live.reduce((n, l) => n + l.hiddenNoProjectCount, 0)
    const hiddenArchivedCount = filterArchivedSessions(all).length + view.live.reduce((n, l) => n + l.hiddenArchivedCount, 0)
    const events = await readRecentEvents()
    const notifications = latestNotificationBySession(events)
    const details = latestNotificationDetails(events)

    // "Needs you" and "Done" depend on signals, so those are worked out before the list is cut into pages.
    // Only a running session has an open question to look for, so the scan stays small.
    let candidates = allSessions
    let input = data
    if (data.status === 'needs-you' || data.status === 'done') {
      const want = data.status === 'needs-you' ? 'needs-you' : 'completed'
      const now = Date.now()
      const keep = await Promise.all(
        allSessions.map(async (s) => {
          const x = s as typeof s & { machineId?: string; lastNotificationAt?: string | null; hasOpenQuestion?: boolean }
          const lastNotificationAt = x.machineId ? (x.lastNotificationAt ?? null) : (notifications.get(s.sessionId) ?? null)
          const hasOpenQuestion = x.machineId ? (x.hasOpenQuestion ?? false) : s.isActive && (await findPendingQuestions(s.filePath)).length > 0
          return deriveSessionStatus(
            { isActive: s.isActive, lastActiveAt: s.lastActiveAt, lastStopReason: s.lastStopReason, lastNotificationAt, hasOpenQuestion },
            now,
          ) === want
        }),
      )
      candidates = allSessions.filter((_, i) => keep[i])
      input = { ...data, status: 'all' }
    }
    const page = await paginateAndFilterSessions(candidates, input, prefs.scratch)

    // Signals are computed for the page only. The file scan for open questions runs for active sessions.
    const sessions = await Promise.all(
      page.sessions.map(async (item): Promise<SessionListItem> => {
        // Sessions of other machines carry the machine they came from, and have no file here.
        const { filePath, machineId, machineName, ...summary } = item as typeof item & {
          machineId?: string
          machineName?: string
          lastNotificationAt?: string | null
          hasOpenQuestion?: boolean
        }
        if (machineId) {
          return {
            ...summary,
            machine: { id: machineId, name: machineName ?? '' },
            lastNotificationAt: summary.lastNotificationAt ?? null,
            notification: (summary as { notification?: { message: string | null; type: string | null } | null }).notification ?? null,
            hasOpenQuestion: summary.hasOpenQuestion ?? false,
          }
        }
        return {
          ...summary,
          machine: null,
          lastNotificationAt: notifications.get(summary.sessionId) ?? null,
          notification: details.has(summary.sessionId)
            ? { message: details.get(summary.sessionId)!.message, type: details.get(summary.sessionId)!.notificationType }
            : null,
          hasOpenQuestion: summary.isActive && (await findPendingQuestions(filePath)).length > 0,
        }
      }),
    )

    const running = allSessions.filter((s) => s.isActive)
    const waiting = await Promise.all(
      running.map(async (s) => {
        const x = s as typeof s & { machineId?: string; lastNotificationAt?: string | null; hasOpenQuestion?: boolean }
        const lastNotificationAt = x.machineId ? (x.lastNotificationAt ?? null) : (notifications.get(s.sessionId) ?? null)
        const hasOpenQuestion = x.machineId ? (x.hasOpenQuestion ?? false) : (await findPendingQuestions(s.filePath)).length > 0
        return deriveSessionStatus(
          { isActive: true, lastActiveAt: s.lastActiveAt, lastStopReason: s.lastStopReason, lastNotificationAt, hasOpenQuestion },
          Date.now(),
        ) === 'needs-you'
      }),
    )

    return {
      ...page,
      sessions,
      hiddenNoProjectCount,
      hiddenArchivedCount,
      totalAll: allSessions.length,
      runningCount: running.length,
      needsYouCount: waiting.filter(Boolean).length,
    }
  })
