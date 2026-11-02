import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { format } from 'date-fns'
import { clockPattern } from '@/lib/utils/time-format'
import { formatAgo, formatTokenCount, formatUSD } from '@/lib/utils/format'
import type { BurnRow, UsageOverview } from '@/lib/usage/overview'
import { metersOf } from '@/lib/usage/display'

type Period = 'five' | 'week'

/** What used the limit: the sessions that spent the most, in this 5-hour window or this week. Opens from the header chip. */
export function LimitsDrawer({ overview, onClose, now }: { overview: UsageOverview; onClose: () => void; now: number }) {
  const meters = metersOf(overview)
  const hasFive = overview.fiveHourShown && !!overview.estimate.block
  const [period, setPeriod] = useState<Period>(hasFive ? 'five' : 'week')
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const shown: 'five' | 'week' = period === 'five' && hasFive ? 'five' : 'week'
  const block = overview.estimate.block
  const rows: BurnRow[] = shown === 'five' && block ? block.burn : overview.estimate.week.burn
  const tokens = shown === 'five' && block ? block.tokens : overview.estimate.week.tokens
  const meter = meters.find((m) => m.key === shown)
  const since = shown === 'five' && block ? `since ${format(new Date(block.start), clockPattern('HH:mm'))}` : 'in the last 7 days'

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="What used your limit">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-black/60" />
      <aside className="relative flex h-full w-full max-w-[720px] flex-col overflow-y-auto border-l border-[color:var(--hms-line)] bg-gray-900 px-6 pb-10 pt-8 shadow-2xl sm:px-9">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-gray-100">What used your limit</h2>
            <p className="mt-1.5 text-[13px] text-[color:var(--hms-mute)]">Counted from this computer's transcripts</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--hms-line)] text-gray-100 hover:border-gray-500"
          >
            ✕
          </button>
        </div>

        {hasFive && (
          <div className="mt-5 inline-flex self-start rounded-full border border-[color:var(--hms-line)] p-1 text-sm" role="group" aria-label="Period">
            {([['five', 'This 5-hour window'], ['week', 'This week']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={shown === id}
                onClick={() => setPeriod(id)}
                className={`rounded-full px-4 py-2 ${shown === id ? 'bg-gray-100 text-gray-950' : 'text-gray-100'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <p className="mt-5 text-[13px] text-[color:var(--hms-mute)]">
          {meter?.percentage != null && <span className="mr-2 rounded-full bg-[color:var(--hms-chip-bg)] px-3 py-1 text-[color:var(--hms-chip-ink)]">{Math.round(meter.percentage)}% used</span>}
          {formatTokenCount(tokens)} tokens counted {since}
        </p>

        {rows.length === 0 ? (
          <p className="mt-8 text-[color:var(--hms-mute)]">Nothing counted yet.</p>
        ) : (
          <table className="mt-5 w-full border-collapse text-left">
            <thead>
              <tr className="text-xs text-[color:var(--hms-mute)]">
                <th className="pb-2.5 font-normal">Session</th>
                <th className="pb-2.5 font-normal">Share</th>
                <th className="pb-2.5 text-right font-normal">Tokens</th>
                <th className="hidden pb-2.5 text-right font-normal sm:table-cell">API price</th>
                <th className="pb-2.5 text-right font-normal">Last active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sessionId} className="border-t border-[color:var(--hms-rule)]">
                  <td className="max-w-[220px] py-3.5 pr-3">
                    <Link to="/sessions/$sessionId" params={{ sessionId: r.sessionId }} onClick={onClose} className="block truncate font-display text-[15px] font-bold text-gray-100 hover:underline">
                      {r.title}
                    </Link>
                    {r.projectName && <div className="truncate text-xs text-[color:var(--hms-mute)]">{r.projectName}</div>}
                  </td>
                  <td className="w-[28%] py-3.5 pr-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-2 flex-1 rounded-full bg-[color:var(--hms-track)]">
                        <div className="h-full rounded-full bg-brand-400 shadow-[0_0_10px_var(--hms-glow-strong)]" style={{ width: `${Math.max(2, r.share * 100)}%` }} />
                      </div>
                      <span className="w-9 text-right text-[13px] tabular-nums">{Math.round(r.share * 100)}%</span>
                    </div>
                  </td>
                  <td className="py-3.5 text-right text-sm tabular-nums">{formatTokenCount(r.tokens)}</td>
                  <td className="hidden py-3.5 text-right text-sm tabular-nums sm:table-cell">{formatUSD(r.usd)}</td>
                  <td className="py-3.5 text-right text-[13px] text-[color:var(--hms-mute)]">{formatAgo(new Date(r.lastAt).toISOString(), now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </aside>
    </div>
  )
}
