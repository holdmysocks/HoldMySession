import { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Route } from '@/routes/_dashboard/sessions/index'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import type { ProjectFilterOption } from './sessions.api'

const SORT_OPTIONS = ['lastActive', 'started', 'duration', 'messages'] as const
type SortOption = typeof SORT_OPTIONS[number]

interface SessionFiltersProps {
  projects: ProjectFilterOption[]
}

export function SessionFilters({ projects }: SessionFiltersProps) {
  const navigate = useNavigate()
  const { search: urlSearch, status, project, sort, sortDir } = Route.useSearch()
  const { privacyMode, anonymizeProjectName } = usePrivacy()

  // Local search state with debounce
  const [localSearch, setLocalSearch] = useState(urlSearch)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Sync local search when URL changes externally (e.g. browser back/forward)
  useEffect(() => {
    setLocalSearch(urlSearch)
  }, [urlSearch])

  function handleSearchChange(value: string) {
    setLocalSearch(value)

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      navigate({
        to: '/sessions',
        search: (prev) => ({ ...prev, search: value, page: 1 }),
      })
    }, 300)
  }

  function handleStatusChange(newStatus: 'all' | 'active' | 'needs-you' | 'done') {
    navigate({
      to: '/sessions',
      search: (prev) => ({ ...prev, status: newStatus, page: 1 }),
    })
  }

  function handleSortChange(newSort: string) {
    if (!SORT_OPTIONS.includes(newSort as SortOption)) return
    navigate({
      to: '/sessions',
      search: (prev) => ({
        ...prev,
        sort: newSort as SortOption,
        page: 1,
      }),
    })
  }

  function handleSortDirToggle() {
    navigate({
      to: '/sessions',
      search: (prev) => ({
        ...prev,
        sortDir: sortDir === 'asc' ? 'desc' : 'asc',
        page: 1,
      }),
    })
  }

  function handleProjectChange(newProject: string) {
    navigate({
      to: '/sessions',
      search: (prev) => ({ ...prev, project: newProject, page: 1 }),
    })
  }

  const STATUS_PILLS = [
    ['all', 'All'],
    ['active', 'Running'],
    ['needs-you', 'Needs you'],
    ['done', 'Done'],
  ] as const
  const selectClass =
    'min-h-[44px] w-full appearance-none rounded-full border border-[color:var(--hms-line)] bg-transparent pl-[18px] pr-9 text-sm font-medium text-gray-100 outline-none focus:border-brand-400'

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="relative flex min-w-[240px] flex-[1_1_320px] items-center">
        <span className="sr-only">Search sessions</span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="pointer-events-none absolute left-[18px] h-[18px] w-[18px] text-[color:var(--hms-mute)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="text"
          placeholder="Search by name, project, branch or id"
          value={localSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="min-h-[44px] w-full rounded-full border border-[color:var(--hms-line)] bg-transparent pl-12 pr-4 text-sm text-gray-100 placeholder-[color:var(--hms-mute)] outline-none focus:border-brand-400"
        />
      </label>

      <div role="group" aria-label="Status" className="flex rounded-[24px] border border-[color:var(--hms-line)] p-1">
        {STATUS_PILLS.map(([value, label]) => {
          const on = status === value || (value === 'done' && status === 'completed')
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => handleStatusChange(value)}
              className="min-h-[40px] rounded-full px-4 text-sm font-medium"
              style={on ? { background: 'var(--hms-ink)', color: 'var(--hms-bg)' } : { color: 'var(--hms-ink)' }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {projects.length > 1 && (
        <label className="relative flex min-w-[150px] items-center">
          <span className="sr-only">Project</span>
          <select value={project} onChange={(e) => handleProjectChange(e.target.value)} className={selectClass}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.name} value={p.name}>
                {privacyMode ? anonymizeProjectName(p.displayName) : p.displayName}
              </option>
            ))}
          </select>
          <span aria-hidden="true" className="pointer-events-none absolute right-4 text-[11px]">▾</span>
        </label>
      )}

      <div className="flex items-center gap-2">
        <label className="relative flex items-center">
          <span className="sr-only">Sort by</span>
          <select value={sort} onChange={(e) => handleSortChange(e.target.value)} className={selectClass}>
            <option value="lastActive">Last active</option>
            <option value="started">Started</option>
            <option value="duration">Duration</option>
            <option value="messages">Messages</option>
          </select>
          <span aria-hidden="true" className="pointer-events-none absolute right-4 text-[11px]">▾</span>
        </label>
        <button
          type="button"
          onClick={handleSortDirToggle}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--hms-line)] text-gray-100 transition-colors hover:border-gray-500"
          title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
          aria-label={sortDir === 'asc' ? 'Ascending' : 'Descending'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-[18px] w-[18px] ${sortDir === 'asc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
