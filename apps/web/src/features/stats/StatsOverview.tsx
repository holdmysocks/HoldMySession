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
  /** Shown under the cost: what the subscription cost against API prices. Overall stats only. */
  costNote?: string | null
  /** The plan compared with API prices. Overall stats only. */
  /** API-price cost of the last seven days. */
  weekUSD?: number | null
  plan?: { apiUSD: number; paidUSD: number; savedUSD: number } | null
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
  costNote,
  plan,
  weekUSD,
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
              className="h-20 animate-pulse rounded-2xl bg-gray-900"
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl bg-gray-900"
            />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-2xl bg-gray-900"
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

  const breakdown = tokenBreakdown(stats.modelUsage)
  const apiUSD = plan ? plan.apiUSD : (cost?.totalUSD ?? null)
  const multiple = plan && plan.paidUSD > 0 ? plan.apiUSD / plan.paidUSD : null

  return (
    <>
      {/* Headline: tokens, and what they would have cost at API prices against what was paid */}
      <div className="mt-6 grid grid-cols-1 gap-8 rounded-2xl border border-gray-800 bg-gray-900 p-6 md:grid-cols-2">
        <TokenCard breakdown={breakdown} hero />
        <div className="md:text-right">
          <p className="text-xs text-gray-400">At API prices</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 md:justify-end">
            <p className="font-display text-5xl font-extrabold leading-none text-gray-100 sm:text-6xl">
              {apiUSD !== null ? `~${formatUSD(apiUSD)}` : 'N/A'}
            </p>
            {plan && (
              <p className="text-sm text-gray-400">
                You spent <span className="font-semibold text-gray-200">{formatUSD(plan.paidUSD)}</span>
              </p>
            )}
          </div>
          {(plan || (weekUSD ?? 0) > 0.005) && (
            <div className="mt-4 flex flex-wrap gap-2 md:justify-end">
              {(weekUSD ?? 0) > 0.005 && <Chip>+{formatUSD(weekUSD!)} this week</Chip>}
              {plan && multiple !== null && multiple >= 1.05 && (
                <Chip>About {multiple >= 10 ? Math.round(multiple) : multiple.toFixed(1)}x what you paid</Chip>
              )}
              {plan && plan.savedUSD > 0.005 && <Chip accent>You saved ~{formatUSD(plan.savedUSD)}</Chip>}
            </div>
          )}
          {!plan && costNote && <p className="mt-3 text-xs text-gray-500">{costNote}</p>}
        </div>
      </div>

      {/* Totals */}
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Sessions" value={String(stats.totalSessions)} />
        <StatCard label="Messages" value={stats.totalMessages.toLocaleString()} />
        <StatCard label="Time" value={formatDuration(totalDurationMs)} />
        <StatCard label={fourthCard.label} value={fourthCard.value} />
        <StatCard label="Tool calls" value={totalToolCalls.toLocaleString()} />
        <StatCard
          label="Longest session"
          value={formatDuration(stats.longestSession.duration)}
          sub={`${stats.longestSession.messageCount} messages`}
        />
      </div>

      <div className="mt-4">
        <TokenTrendChart data={stats.dailyModelTokens} />
      </div>

      {/* Rhythm and models side by side */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <ContributionHeatmap
          dailyActivity={stats.dailyActivity}
          dailyModelTokens={stats.dailyModelTokens}
        />
        <ModelUsageChart data={stats.modelUsage} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <HourlyDistribution hourCounts={stats.hourCounts} />
        <ActivityChart data={stats.dailyActivity} />
      </div>
    </>
  )
}

function Chip({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs ${
        accent ? 'border-brand-400 text-brand-400' : 'border-gray-700 text-gray-300'
      }`}
    >
      {children}
    </span>
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
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}
