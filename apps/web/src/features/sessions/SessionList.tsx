import { useMachineScope } from '@/features/link/useMachineScope'
import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { paginatedSessionListQuery, activeSessionsQuery } from './sessions.queries'
import { SessionCard } from './SessionCard'
import { SessionFilters } from './SessionFilters'
import { PaginationControls } from './PaginationControls'
import { usePageSizePreference } from './usePageSizePreference'
import { useNow } from './useNow'
import { Route } from '@/routes/_dashboard/sessions/index'
import { deriveSessionStatus } from '@/lib/status/session-status'
import { filterVisibleSessions } from '@/lib/map/session-visibility'
import type { SessionListItem } from './sessions.api'

export function SessionList() {
  const navigate = useNavigate()
  const { page, pageSize, search, status, project, sort, sortDir } = Route.useSearch()
  const { storedPageSize, setPageSize } = usePageSizePreference()
  const hasAppliedStoredPreference = useRef(false)

  // On mount, if localStorage has a preference that differs from the URL default,
  // apply it (only once, and only if URL doesn't already have an explicit pageSize).
  // Priority: explicit URL param > localStorage preference > schema default (5)
  useEffect(() => {
    if (
      storedPageSize !== null &&
      !hasAppliedStoredPreference.current &&
      storedPageSize !== pageSize
    ) {
      hasAppliedStoredPreference.current = true
      navigate({
        to: '/sessions',
        search: (prev) => ({ ...prev, pageSize: storedPageSize, page: 1 }),
        replace: true,
      })
    }
  }, [storedPageSize, pageSize, navigate])

  const scope = useMachineScope()
  const { data: paginatedData, isLoading } = useQuery(
    paginatedSessionListQuery({ page, pageSize, search, status, project, sort, sortDir, machineId: scope.machineId }),
  )
  const { data: activeSessions = [] } = useQuery(activeSessionsQuery)
  const now = useNow()

  // Merge active session status from the fast-polling query into current page results
  const mergedSessions: SessionListItem[] = useMemo(() => {
    if (!paginatedData) return []
    const activeIds = new Set(activeSessions.map((s) => s.sessionId))
    return paginatedData.sessions.map((s) => ({
      ...s,
      // This computer's active sessions only apply to its own sessions, never to another machine's.
      isActive: (!s.machine && activeIds.has(s.sessionId)) || s.isActive,
    }))
  }, [paginatedData, activeSessions])

  function handlePageChange(newPage: number) {
    navigate({
      to: '/sessions',
      search: (prev) => ({ ...prev, page: newPage }),
    })
  }

  function handlePageSizeChange(newSize: number) {
    setPageSize(newSize)
    navigate({
      to: '/sessions',
      search: (prev) => ({ ...prev, pageSize: newSize, page: 1 }),
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: pageSize }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-gray-800 bg-gray-900"
          />
        ))}
      </div>
    )
  }

  const totalCount = paginatedData?.totalCount ?? 0
  const totalPages = paginatedData?.totalPages ?? 1
  const projects = paginatedData?.projects ?? []
  // Same rule as the page: sessions with no project are not counted as active here either.
  const activeCount = filterVisibleSessions(activeSessions).length
  const hiddenNoProjectCount = paginatedData?.hiddenNoProjectCount ?? 0
  const hiddenArchivedCount = paginatedData?.hiddenArchivedCount ?? 0

  return (
    <div>
      <SessionFilters projects={projects} activeCount={activeCount} />

      <p className="mt-3 text-xs text-gray-500">
        {hiddenNoProjectCount} hidden (no project)
        <span className="mx-2 text-gray-700">|</span>
        {hiddenArchivedCount} archived hidden
      </p>

      <div className="mt-4 space-y-2">
        {mergedSessions.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            {totalCount === 0 && !search && status === 'all' && !project
              ? 'No sessions found in ~/.claude'
              : 'No sessions match your filters'}
          </div>
        ) : (
          mergedSessions.map((session) => (
            <SessionCard
              key={session.sessionId}
              session={session}
              status={deriveSessionStatus(
                {
                  isActive: session.isActive,
                  lastActiveAt: session.lastActiveAt,
                  lastStopReason: session.lastStopReason,
                  lastNotificationAt: session.lastNotificationAt,
                  hasOpenQuestion: session.hasOpenQuestion,
                },
                now,
              )}
            />
          ))
        )}
      </div>

      <div className="mt-4">
        <PaginationControls
          page={paginatedData?.page ?? page}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>
    </div>
  )
}
