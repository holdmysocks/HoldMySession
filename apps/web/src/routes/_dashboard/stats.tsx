import { useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { statsQuery } from '@/features/stats/stats.queries'
import {
  projectAnalyticsQuery,
  projectStatsQuery,
} from '@/features/project-analytics/project-analytics.queries'
import { StatsOverview } from '@/features/stats/StatsOverview'
import { tokensByModelOf } from '@/features/stats/stats-tokens'
import { ProjectAnalytics } from '@/features/project-analytics/ProjectAnalytics'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import {
  dailyActivityToCSV,
  dailyTokensToCSV,
  modelUsageToCSV,
  statsToJSON,
  downloadFile,
} from '@/lib/utils/export-utils'
import { ExportDropdown } from '@/components/ExportDropdown'
import { useSessionCost } from '@/features/cost-estimation/useSessionCost'
import type { StatsCache } from '@/lib/parsers/types'

const statsSearchSchema = z.object({
  tab: z.enum(['overview', 'by-project', 'projects']).default('overview').catch('overview'),
  /** The project shown on the by-project tab: a project path, or the unlinked group's key. */
  project: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/_dashboard/stats')({
  validateSearch: statsSearchSchema,
  component: StatsPage,
})

function exportOptions(stats: StatsCache, prefix: string) {
  return [
    {
      label: 'Daily Activity (CSV)',
      onClick: () => downloadFile(dailyActivityToCSV(stats), `${prefix}daily-activity.csv`, 'text/csv'),
    },
    {
      label: 'Token Usage (CSV)',
      onClick: () => downloadFile(dailyTokensToCSV(stats), `${prefix}daily-tokens.csv`, 'text/csv'),
    },
    {
      label: 'Model Usage (CSV)',
      onClick: () => downloadFile(modelUsageToCSV(stats), `${prefix}model-usage.csv`, 'text/csv'),
    },
    {
      label: 'Full Stats (JSON)',
      onClick: () => downloadFile(statsToJSON(stats), `${prefix}stats.json`, 'application/json'),
    },
  ]
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'by-project', label: 'Overview by Project' },
  { id: 'projects', label: 'Projects' },
] as const

function StatsPage() {
  const { tab, project } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { anonymizeProjectName } = usePrivacy()
  const { data: stats, isLoading } = useQuery(statsQuery)
  const { data: projectData } = useQuery(projectAnalyticsQuery)

  // Convert stats.modelUsage to Record<string, TokenUsage> for cost calculation
  // All hooks must be called before any early returns
  const tokensByModel = useMemo(() => tokensByModelOf(stats), [stats])
  const { cost } = useSessionCost(tokensByModel)

  // Projects the by-project tab can show: real projects first, the unlinked group last.
  const projects = useMemo(() => {
    const all = projectData?.projects ?? []
    return [...all.filter((p) => !p.isUnlinked), ...all.filter((p) => p.isUnlinked)]
  }, [projectData])
  const linkedProjectCount = projects.filter((p) => !p.isUnlinked).length
  const selectedProject = projects.find((p) => p.projectPath === project) ?? projects[0] ?? null

  // Only asked for while the tab is open, since it parses every session of the project.
  const projectStatsResult = useQuery(
    projectStatsQuery(tab === 'by-project' ? (selectedProject?.projectPath ?? '') : ''),
  )
  const projectStats = projectStatsResult.data
  const projectTokens = useMemo(() => tokensByModelOf(projectStats), [projectStats])
  const { cost: projectCost } = useSessionCost(projectTokens)

  const exportable = tab === 'overview' ? stats : tab === 'by-project' ? projectStats : null

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Stats</h1>
          <p className="mt-1 text-sm text-gray-400">
            Usage analytics and project insights
          </p>
        </div>
        {exportable && (
          <ExportDropdown options={exportOptions(exportable, tab === 'by-project' ? 'project-' : '')} />
        )}
      </div>

      {/* Tab bar */}
      <div className="mt-4 flex gap-1 border-b border-gray-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate({ search: { tab: t.id, project } })}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t.id
                ? 'border-brand-500 text-gray-100'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' ? (
        <StatsOverview
          stats={stats}
          isLoading={isLoading}
          cost={cost}
          totalDurationMs={projects.reduce((sum, p) => sum + p.totalDurationMs, 0)}
          fourthCard={{ label: 'Projects', value: String(linkedProjectCount) }}
          emptyMessage="No stats data found. Check ~/.claude/stats-cache.json"
        />
      ) : tab === 'by-project' ? (
        <div>
          {projects.length > 0 && selectedProject && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-400">
                <span>Project</span>
                <select
                  value={selectedProject.projectPath}
                  onChange={(e) => navigate({ search: { tab: 'by-project', project: e.target.value } })}
                  className="max-w-xs rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 focus:border-brand-500 focus:outline-none"
                >
                  {projects.map((p) => (
                    <option key={p.projectPath} value={p.projectPath}>
                      {p.isUnlinked ? p.projectName : anonymizeProjectName(p.projectName)} ({p.totalSessions})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {projectData && projects.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              No projects found. Sessions will appear here once scanned.
            </div>
          ) : (
            <StatsOverview
              stats={projectStats}
              isLoading={!projectData || projectStatsResult.isLoading}
              cost={projectCost}
              totalDurationMs={selectedProject?.totalDurationMs ?? 0}
              fourthCard={{ label: 'Active Days', value: String(projectStats?.dailyActivity.length ?? 0) }}
              emptyMessage="No data for this project."
            />
          )}
        </div>
      ) : (
        <div className="mt-6">
          <ProjectAnalytics />
        </div>
      )}
    </div>
  )
}
