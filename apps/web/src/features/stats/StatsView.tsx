import { useState, type ReactNode } from 'react'
import type { StatsCache } from '@/lib/parsers/types'
import { formatDuration, formatTokenCount } from '@/lib/utils/format'
import { ModelsArea } from './ModelsArea'
import { ModelShare } from './ModelShare'
import { RhythmGrid } from './RhythmGrid'
import { StartHours } from './StartHours'
import { tokenBreakdown } from './token-breakdown'
import { RANGES, type StatsRange } from './stats-range'
import { formatMoney } from '@/features/project-analytics/ProjectsTable'

const RANGE_NAME: Record<StatsRange, string> = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  '45d': 'last 45 days',
  '90d': 'last 90 days',
  '180d': 'last 180 days',
  '1y': 'last year',
  all: 'all time',
}

export function Chip({ children, neutral }: { children: ReactNode; neutral?: boolean }) {
  return (
    <span
      className="rounded-full px-3.5 py-[5px] text-[13px] font-semibold"
      style={neutral ? { background: 'var(--hms-track)', color: 'var(--hms-sub)' } : { background: 'var(--hms-chip-bg)', color: 'var(--hms-chip-ink)' }}
    >
      {children}
    </span>
  )
}

export interface StatsViewProps {
  /** For the range chosen. */
  stats: StatsCache
  /** Tokens, sessions, messages and tool calls in the last seven days. */
  week: { tokens: number; sessions: number; messages: number; toolCalls: number }
  /** The API price of the range, and of the last seven days. */
  apiUSD: number | null
  weekUSD: number | null
  /** The plan compared with API prices, when there is one. Overall only. */
  plan?: { paidUSD: number; savedUSD: number; apiUSD: number } | null
  /** On a project's page, its share of the whole. */
  share?: { tokens: number | null; usd: number | null }
  durationMs: number
  weekDurationMs?: number | null
  range: StatsRange
  onRange: (range: StatsRange) => void
  /** Heading of the rhythm grid. */
  rhythmTitle?: string
  children?: ReactNode
}

/** The whole Stats page body, for everything or for one project: headline, chart, totals, rhythm, models and hours. */
export function StatsView({
  stats,
  week,
  apiUSD,
  weekUSD,
  plan,
  share,
  durationMs,
  weekDurationMs,
  range,
  onRange,
  rhythmTitle = 'Your rhythm',
  children,
}: StatsViewProps) {
  const breakdown = tokenBreakdown(stats.modelUsage)
  const [open, setOpen] = useState(false)
  const multiple = plan && plan.paidUSD > 0 ? plan.apiUSD / plan.paidUSD : null
  const toolCalls = stats.dailyActivity.reduce((s, d) => s + d.toolCallCount, 0)
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 100))

  const kpis = [
    { label: 'Sessions', value: stats.totalSessions.toLocaleString(), delta: week.sessions > 0 ? `+${week.sessions.toLocaleString()} this week` : '' },
    { label: 'Messages', value: stats.totalMessages.toLocaleString(), delta: week.messages > 0 ? `+${week.messages.toLocaleString()} this week` : '' },
    {
      label: 'Time with Claude',
      value: durationMs >= 3_600_000 ? `${Math.round(durationMs / 3_600_000).toLocaleString()} h` : formatDuration(durationMs),
      delta: weekDurationMs && weekDurationMs > 0 ? `+${Math.max(1, Math.round(weekDurationMs / 3_600_000))} h this week` : '',
    },
    { label: 'Tool calls', value: toolCalls.toLocaleString(), delta: week.toolCalls > 0 ? `+${week.toolCalls.toLocaleString()} this week` : '' },
  ]

  return (
    <>
      <section aria-label="Headline" className="flex flex-wrap items-end justify-between gap-x-16 gap-y-6">
        <div className="min-w-0 flex-[1_1_360px]">
          <div className="text-base font-medium text-[color:var(--hms-mute)]">Tokens, {RANGE_NAME[range]}</div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            title="Show the breakdown"
            className="mt-1.5 block text-left font-display text-[64px] font-bold leading-none text-brand-400 sm:text-[96px] lg:text-[132px]"
            style={{ textShadow: '0 0 56px var(--hms-glow-strong)' }}
          >
            {formatTokenCount(breakdown.total)}
          </button>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {week.tokens > 0 && <Chip>+{formatTokenCount(week.tokens)} tokens this week</Chip>}
            {pct(share?.tokens) !== null && <Chip neutral>{pct(share?.tokens)}% of all your tokens</Chip>}
          </div>
          {open && (
            <dl className="mt-3 grid max-w-sm grid-cols-2 gap-x-6 gap-y-1 text-sm text-[color:var(--hms-mute)]">
              <dt>Input (prompt)</dt><dd className="text-right font-mono text-gray-200">{formatTokenCount(breakdown.input)}</dd>
              <dt className="pl-3">new</dt><dd className="text-right font-mono">{formatTokenCount(breakdown.uncachedInput)}</dd>
              <dt className="pl-3">cache read</dt><dd className="text-right font-mono">{formatTokenCount(breakdown.cacheRead)}</dd>
              <dt className="pl-3">cache write</dt><dd className="text-right font-mono">{formatTokenCount(breakdown.cacheWrite)}</dd>
              <dt>Output (answer)</dt><dd className="text-right font-mono text-gray-200">{formatTokenCount(breakdown.output)}</dd>
              <dt title="Internal reasoning before the answer. Billed as output.">Reasoning</dt><dd className="text-right font-mono text-gray-200">{formatTokenCount(breakdown.reasoning)}</dd>
            </dl>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-end gap-x-14 gap-y-3">
            <div>
              <div className="text-base font-medium text-[color:var(--hms-mute)]">At API prices</div>
              <div className="mt-1.5 font-display text-[56px] font-bold leading-none sm:text-[72px] lg:text-[96px]">
                {apiUSD !== null ? `~${formatMoney(apiUSD)}` : 'N/A'}
              </div>
            </div>
            {plan && (
              <div className="pb-2.5">
                <div className="text-base font-medium text-[color:var(--hms-mute)]">You spent</div>
                <div className="mt-1.5 font-display text-[40px] font-bold leading-none lg:text-5xl">~{formatMoney(plan.paidUSD)}</div>
              </div>
            )}
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {(weekUSD ?? 0) > 0.005 && <Chip>+{formatMoney(weekUSD!)} this week</Chip>}
            {plan && multiple !== null && multiple >= 1.05 && (
              <Chip>About {multiple >= 10 ? Math.round(multiple) : multiple.toFixed(1)}x what you paid</Chip>
            )}
            {plan && plan.savedUSD > 0.005 && <Chip>You saved ~{formatMoney(plan.savedUSD)}</Chip>}
            {pct(share?.usd) !== null && <Chip neutral>{pct(share?.usd)}% of your API total</Chip>}
          </div>
        </div>
      </section>

      <section aria-label="Tokens over time">
        <ModelsArea
          data={stats.dailyModelTokens}
          controls={
          <div role="group" aria-label="Range" className="flex w-full rounded-[20px] border border-[color:var(--hms-line)] p-1 sm:w-auto">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => onRange(r)}
                className="min-h-10 flex-1 rounded-full px-1 text-[13.33px] font-medium sm:min-w-11 sm:flex-none sm:px-3.5"
                style={range === r ? { background: 'var(--hms-ink)', color: 'var(--hms-bg)' } : { color: 'var(--hms-ink)' }}
              >
                {r === 'all' ? 'All' : r}
              </button>
            ))}
          </div>
          }
        />
      </section>

      <section aria-label="Totals" className="grid grid-cols-2 border-y border-[color:var(--hms-rule)] lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="py-[22px] pr-6">
            <div className="text-[color:var(--hms-mute)]">{k.label}</div>
            <div className="font-display text-[44px] font-bold leading-[1.1]">{k.value}</div>
            <div className="min-h-[20px] text-[13px] font-semibold" style={{ color: 'var(--hms-chip-ink)' }}>{k.delta}</div>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-10">
        <section aria-label="Rhythm" className="flex min-w-0 flex-[2_1_460px] flex-col">
          <h2 className="mb-3.5 font-display text-xl font-semibold">{rhythmTitle}</h2>
          <RhythmGrid dailyActivity={stats.dailyActivity} dailyModelTokens={stats.dailyModelTokens} />
        </section>
        <section aria-label="Models" className="min-w-0 flex-[1_1_280px]">
          <h2 className="mb-3.5 font-display text-xl font-semibold">Models</h2>
          <ModelShare data={stats.dailyModelTokens} />
        </section>
      </div>

      <StartHours hourCounts={stats.hourCounts} />
      {children}
    </>
  )
}
