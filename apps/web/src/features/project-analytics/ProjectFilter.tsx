import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMachineScope } from '@/features/link/useMachineScope'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { projectAnalyticsQueryFor } from './project-analytics.queries'

/** The project pill in the top bar of Stats. "All projects", or the one the page is about, outlined in the accent. */
export function ProjectFilter() {
  const navigate = useNavigate()
  const { anonymizeProjectName } = usePrivacy()
  const search = useSearch({ strict: false }) as { project?: string; range?: string }
  const machineId = useMachineScope().machineId
  const { data } = useQuery(projectAnalyticsQueryFor(machineId))
  const projects = data?.projects ?? []
  if (projects.length === 0) return null
  const value = projects.some((p) => p.projectPath === search.project) ? search.project! : ''
  return (
    <label className="relative flex items-center text-sm">
      <span className="sr-only">Project</span>
      <select
        value={value}
        onChange={(e) =>
          navigate({ to: '/stats', search: (prev: Record<string, unknown>) => ({ ...prev, project: e.target.value || undefined }) })
        }
        className={`min-h-[44px] max-w-[220px] appearance-none rounded-full border bg-transparent pl-[18px] pr-9 text-sm font-medium focus:outline-none ${
          value ? 'border-[1.5px] border-brand-400 font-semibold text-brand-400' : 'border-gray-700 text-gray-100'
        }`}
      >
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.projectPath} value={p.projectPath}>
            {p.isUnlinked ? p.displayName : anonymizeProjectName(p.displayName)}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute right-4 text-[11px]">▾</span>
    </label>
  )
}
