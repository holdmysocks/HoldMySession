import { ActivityChart } from '@/features/stats/ActivityChart'
import { ContributionHeatmap } from '@/features/stats/ContributionHeatmap'
import { TokenTrendChart } from '@/features/stats/TokenTrendChart'
import { ModelUsageChart } from '@/features/stats/ModelUsageChart'
import { HourlyDistribution } from '@/features/stats/HourlyDistribution'
import { formatDuration, formatUSD } from '@/lib/utils/format'
import type { StatsCache } from '@/lib/parsers/types'
import { tokenBreakdown } from './token-breakdown'
import { TokenCard } from './TokenCard'

interface StatsOverviewProps {
  stats: StatsCache | null | undefined
  isLoading: boolean
  cost: { totalUSD: number } | null
  totalDurationMs: number
  /** The last card of the first row. The overall overview shows the project count there. */
  fourthCard: { label: string; value: string }
  /** Shown when there is no data. */
  emptyMessage: string
}

/**
 * The cards, heatmap and charts of the Stats overview. The overall tab and the by-project tab both
 * render it, from a StatsCache that covers every session or only one project's.
 */
export function StatsOverview({
  stats,
  isLoading,
  cost,
  totalDurationMs,
  fourthCard,
  emptyMessage,
}: StatsOverviewProps) {
  if (isLoading) {
    return (
      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-gray-900/50"
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-gray-900/50"
            />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-xl bg-gray-900/50"
          />
        ))}
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="py-12 text-center text-sm text-gray-500">
        {emptyMessage}
      </div>
    )
  }

  const totalToolCalls = stats.dailyActivity.reduce(
    (sum, d) => sum + d.toolCallCount,
    0,
  )

  return (
    <>
      {/* Row 1 — Key totals */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Sessions" value={String(stats.totalSessions)} />
        <StatCard
          label="Total Messages"
          value={stats.totalMessages.toLocaleString()}
        />
        <StatCard label="Total Time" value={formatDuration(totalDurationMs)} />
        <StatCard label={fourthCard.label} value={fourthCard.value} />
      </div>

      {/* Row 2 — Deeper metrics */}
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <TokenCard breakdown={tokenBreakdown(stats.modelUsage)} />
        <StatCard
          label="Estimated Cost"
          value={cost ? `~${formatUSD(cost.totalUSD)}` : 'N/A'}
        />
        <StatCard
          label="Tool Calls"
          value={totalToolCalls.toLocaleString()}
        />
        <StatCard
          label="Longest Session"
          value={formatDuration(stats.longestSession.duration)}
          sub={`${stats.longestSession.messageCount} messages`}
        />
      </div>

      {/* Contribution heatmap */}
      <div className="mt-6">
        <ContributionHeatmap
          dailyActivity={stats.dailyActivity}
          dailyModelTokens={stats.dailyModelTokens}
        />
      </div>

      {/* Charts */}
      <div className="mt-4">
        <ActivityChart data={stats.dailyActivity} />
      </div>

      <div className="mt-4">
        <TokenTrendChart data={stats.dailyModelTokens} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ModelUsageChart data={stats.modelUsage} />
        <HourlyDistribution hourCounts={stats.hourCounts} />
      </div>
    </>
  )
}

function StatCard({
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
      <p className="mt-1 text-xl font-bold text-gray-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}
