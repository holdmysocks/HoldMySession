import { useQuery } from '@tanstack/react-query'
import { projectAnalyticsQueryFor } from './project-analytics.queries'
import { useMachineScope } from '@/features/link/useMachineScope'
import { ProjectTable } from './ProjectTable'
import { formatDuration } from '@/lib/utils/format'
import { usePrivacy } from '@/features/privacy/PrivacyContext'

export function ProjectAnalytics() {
  const { anonymizeProjectName } = usePrivacy()
  const scope = useMachineScope()
  const { data, isLoading } = useQuery(projectAnalyticsQueryFor(scope.machineId))

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-gray-900/50"
            />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-gray-900/50" />
      </div>
    )
  }

  const projects = data?.projects ?? []

  if (projects.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-500">
        No projects found. Sessions will appear here once scanned.
      </div>
    )
  }

  const totalSessions = projects.reduce((sum, p) => sum + p.totalSessions, 0)
  const totalDurationMs = projects.reduce((sum, p) => sum + p.totalDurationMs, 0)

  // The unlinked group is not a project: it is left out of the project count and of "most active".
  const linkedProjects = projects.filter((p) => !p.isUnlinked)
  const mostActive =
    linkedProjects.length > 0
      ? linkedProjects.reduce((max, p) => (p.totalSessions > max.totalSessions ? p : max))
      : null

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Total Projects" value={String(linkedProjects.length)} />
        <SummaryCard
          label="Total Sessions"
          value={totalSessions.toLocaleString()}
        />
        <SummaryCard
          label="Total Duration"
          value={formatDuration(totalDurationMs)}
        />
        <SummaryCard
          label="Most Active"
          value={mostActive ? anonymizeProjectName(mostActive.displayName) : '-'}
          sub={mostActive ? `${mostActive.totalSessions} sessions` : undefined}
        />
      </div>

      {/* Project table */}
      <ProjectTable projects={projects} />
    </div>
  )
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 truncate text-xl font-bold text-gray-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}
