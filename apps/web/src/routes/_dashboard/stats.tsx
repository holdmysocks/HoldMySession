import { useMemo } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { format } from 'date-fns'
import { addDays } from '@/lib/pricing/price-timeline'
import { statsQueryFor } from '@/features/stats/stats.queries'
import { useMachineScope } from '@/features/link/useMachineScope'
import { projectAnalyticsQueryFor, projectStatsQuery } from '@/features/project-analytics/project-analytics.queries'
import { StatsView } from '@/features/stats/StatsView'
import { LatestSessions } from '@/features/stats/LatestSessions'
import { MapThumb } from '@/features/stats/MapThumb'
import { ProjectsTable } from '@/features/project-analytics/ProjectsTable'
import { costFrom, filterStatsRange, RANGES, rangeStartDay } from '@/features/stats/stats-range'
import { tokenBreakdown } from '@/features/stats/token-breakdown'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { dailyActivityToCSV, dailyTokensToCSV, modelUsageToCSV, statsToJSON, downloadFile } from '@/lib/utils/export-utils'
import { ExportDropdown } from '@/components/ExportDropdown'
import { historyCostQuery } from '@/features/history/price-history.queries'
import { subscriptionQuery } from '@/features/history/subscription.queries'
import { summarizeSubscription } from '@/lib/pricing/subscription'
import { formatAgo } from '@/lib/utils/format'
import type { StatsCache } from '@/lib/parsers/types'

const statsSearchSchema = z.object({
  range: z.enum(RANGES).default('45d').catch('45d'),
  /** A project path, or the unlinked group's key. Without one the page is about everything. */
  project: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/_dashboard/stats')({
  validateSearch: statsSearchSchema,
  component: StatsPage,
})

function exportOptions(stats: StatsCache, prefix: string) {
  return [
    { label: 'Daily Activity (CSV)', onClick: () => downloadFile(dailyActivityToCSV(stats), `${prefix}daily-activity.csv`, 'text/csv') },
    { label: 'Token Usage (CSV)', onClick: () => downloadFile(dailyTokensToCSV(stats), `${prefix}daily-tokens.csv`, 'text/csv') },
    { label: 'Model Usage (CSV)', onClick: () => downloadFile(modelUsageToCSV(stats), `${prefix}model-usage.csv`, 'text/csv') },
    { label: 'Full Stats (JSON)', onClick: () => downloadFile(statsToJSON(stats), `${prefix}stats.json`, 'application/json') },
  ]
}

/** Time sessions were open, counted per day, or null when the stats carry no per-day time. */
function openTimeOf(stats: StatsCache): number | null {
  return stats.dailyActivity.some((d) => d.durationMs !== undefined) ? stats.dailyActivity.reduce((s, d) => s + (d.durationMs ?? 0), 0) : null
}

/** What the last seven days added: tokens, sessions, messages and tool calls. */
function weekOf(stats: StatsCache | null | undefined, weekStart: string) {
  const w = stats ? filterStatsRange(stats, weekStart) : null
  return {
    tokens: w ? tokenBreakdown(w.modelUsage).total : 0,
    sessions: w?.totalSessions ?? 0,
    messages: w?.totalMessages ?? 0,
    toolCalls: w?.dailyActivity.reduce((s, d) => s + d.toolCallCount, 0) ?? 0,
    durationMs: w ? openTimeOf(w) : null,
  }
}

function StatsPage() {
  const { range, project } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { anonymizeProjectName, anonymizePath } = usePrivacy()
  const machineId = useMachineScope().machineId

  const today = format(new Date(), 'yyyy-MM-dd')
  const startDay = rangeStartDay(range, today)
  const weekStart = addDays(today, -6)

  const { data: allStats, isLoading } = useQuery(statsQueryFor(machineId))
  const { data: projectData } = useQuery(projectAnalyticsQueryFor(machineId))
  const projects = useMemo(() => projectData?.projects ?? [], [projectData])
  const selected = project ? (projects.find((p) => p.projectPath === project) ?? null) : null

  const { data: projectAllStats } = useQuery({ ...projectStatsQuery(selected?.projectPath ?? '', machineId), enabled: !!selected })
  const baseStats = selected ? projectAllStats : allStats
  const stats = baseStats ? filterStatsRange(baseStats, startDay) : baseStats

  // Priced day by day from the history database, overall and for the project chosen.
  const { data: datedCost } = useQuery(historyCostQuery(undefined, true, machineId))
  const { data: projectCost } = useQuery(historyCostQuery(selected?.projectPath, !!selected, machineId))
  const cost = selected ? projectCost : datedCost
  const apiUSD = cost ? costFrom(cost.byDay, startDay) : null
  const weekUSD = cost ? costFrom(cost.byDay, weekStart) : null

  const { data: subscription } = useQuery(subscriptionQuery)
  const plan = useMemo(() => {
    if (selected || !subscription || !datedCost) return null
    const summary = summarizeSubscription(subscription.periods, datedCost.byDay, today, startDay ?? undefined)
    return summary.firstDay && summary.months.length > 0 ? summary : null
  }, [selected, subscription, datedCost, today, startDay])

  const share = useMemo(() => {
    if (!selected || !stats || !allStats) return undefined
    const whole = filterStatsRange(allStats, startDay)
    const mine = tokenBreakdown(stats.modelUsage).total
    const all = tokenBreakdown(whole.modelUsage).total
    const wholeUSD = datedCost ? costFrom(datedCost.byDay, startDay) : null
    return { tokens: all > 0 ? mine / all : null, usd: wholeUSD && apiUSD !== null ? apiUSD / wholeUSD : null }
  }, [selected, stats, allStats, startDay, datedCost, apiUSD])

  const week = useMemo(() => weekOf(baseStats, weekStart), [baseStats, weekStart])
  // Counted per day when the history has it, so it follows the range. Otherwise all the sessions' time.
  const durationMs = (stats ? openTimeOf(stats) : null) ?? (selected ? selected.totalDurationMs : projects.reduce((sum, p) => sum + p.totalDurationMs, 0))

  const setRange = (r: (typeof RANGES)[number]) => navigate({ search: (prev) => ({ ...prev, range: r }) })

  if (project && projectData && !selected) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">
        That project is not on this machine.{' '}
        <Link to="/stats" search={{ range }} className="text-brand-400">All projects</Link>
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      {selected && (
        <section aria-label="Project" className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <Link to="/stats" search={{ range }} className="inline-flex min-h-11 items-center gap-2 text-sm text-[color:var(--hms-mute)]">
              ← All projects
            </Link>
            <h1 className="m-0 font-display text-[52px] font-bold leading-[1.05]">
              {selected.isUnlinked ? selected.displayName : anonymizeProjectName(selected.displayName)}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-[18px] gap-y-1.5 text-[13px] text-[color:var(--hms-mute)]">
              {!selected.isUnlinked && <span className="font-mono">{anonymizePath(selected.projectPath, selected.displayName)}</span>}
              <span>last active {formatAgo(selected.lastSessionAt)}</span>
            </div>
          </div>
          {!selected.isUnlinked && selected.projectKey && <MapThumb projectKey={selected.projectKey} mapValue={selected.projectKey} machineId={machineId} />}
        </section>
      )}

      {isLoading || !stats ? (
        <div className="h-96 animate-pulse rounded-3xl bg-gray-900" />
      ) : (
        <StatsView
          stats={stats}
          week={week}
          apiUSD={apiUSD}
          weekUSD={weekUSD}
          plan={plan}
          share={share}
          durationMs={durationMs}
          weekDurationMs={week.durationMs}
          range={range}
          onRange={setRange}
          rhythmTitle={selected ? 'Your rhythm here' : 'Your rhythm'}
        >
          {selected ? (
            <LatestSessions projectName={selected.projectName} machineId={machineId} />
          ) : (
            <ProjectsTable projects={projects} byProject={datedCost?.byProject} range={range} />
          )}
        </StatsView>
      )}

      {stats && (
        <div className="flex justify-end">
          <ExportDropdown options={exportOptions(stats, selected ? 'project-' : '')} />
        </div>
      )}
    </div>
  )
}
