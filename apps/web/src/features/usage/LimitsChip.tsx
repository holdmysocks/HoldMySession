import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { formatAgo } from '@/lib/utils/format'
import { chipOf, metersOf, paceText, resetAt, resetText, type MeterView } from '@/lib/usage/display'
import { useNow } from '@/features/sessions/useNow'
import { Meter, Ring } from './Meter'
import { SEVERITY_TEXT } from './severity-style'
import { LimitsDrawer } from './LimitsDrawer'
import { usageQuery } from './usage.queries'
import type { UsageOverview } from './usage.api'

const PACE_TONE = { ok: 'bg-[color:var(--hms-chip-bg)] text-[color:var(--hms-chip-ink)]', warn: 'bg-amber-400/15 text-amber-300', danger: 'bg-red-400/15 text-red-300' }

function MeterBlock({ m, now }: { m: MeterView; now: number }) {
  const pace = paceText(m)
  const at = resetAt(m)
  return (
    <section aria-label={m.label} className="mt-5 first:mt-0">
      <div className="flex items-baseline justify-between gap-3 text-[13px] text-[color:var(--hms-mute)]">
        <span>{m.label}</span>
        <span title={at ? `Resets ${at}` : undefined}>{resetText(m, now)}</span>
      </div>
      {m.idle ? (
        <p className="mt-1.5 text-sm text-[color:var(--hms-mute)]">No 5-hour window right now. One starts with your next message.</p>
      ) : (
        <>
          <div className="mb-2.5 mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={`font-display text-[38px] font-extrabold leading-none ${m.estimate ? 'text-gray-300' : SEVERITY_TEXT[m.severity]}`}>
              {m.percentage === null ? '—' : `${m.estimate ? '~' : ''}${Math.round(m.percentage)}%`}
            </span>
            {m.estimate && <span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs text-amber-300">Estimate</span>}
            {pace && <span className={`rounded-full px-2.5 py-0.5 text-xs ${PACE_TONE[m.severity]}`}>{pace}</span>}
          </div>
          <Meter percentage={m.percentage} severity={m.severity} elapsed={m.pace?.elapsed} estimate={m.estimate} label={`${m.label} used`} />
        </>
      )}
    </section>
  )
}

/**
 * The header's limits chip, and what opens from it: both meters, then a drawer of what used them. The 5-hour meter
 * is drawn only for a plan that has a 5-hour limit, so on one that does not, such as Ultra, the chip is the week.
 */
export function LimitsChip() {
  const { data } = useQuery(usageQuery())
  const now = useNow()
  const [open, setOpen] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!data) return null
  const chip = chipOf(data, now)

  if (chip.kind === 'setup') {
    return (
      <Link
        to="/settings"
        search={{ tab: 'claude' }}
        title="Show your usage limits"
        className="flex h-11 items-center rounded-full border border-[color:var(--hms-line)] px-4 text-sm text-[color:var(--hms-mute)] hover:border-gray-500 hover:text-gray-100"
      >
        Show limits
      </Link>
    )
  }

  const border = chip.severity === 'danger' ? 'border-red-400/60 bg-red-950/40' : chip.severity === 'warn' ? 'border-amber-400/50' : 'border-[color:var(--hms-line)]'
  return (
    <>
      <div ref={box} className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={chip.label}
          title={chip.label}
          onClick={() => setOpen((v) => !v)}
          className={`flex h-11 items-center gap-2.5 rounded-full border py-0 pl-2.5 pr-3.5 text-sm font-medium text-gray-100 transition-colors hover:border-gray-500 ${border} ${chip.estimate ? 'border-dashed' : ''}`}
        >
          {chip.kind === 'meter' ? (
            <>
              <Ring percentage={chip.ring} severity={chip.severity} estimate={chip.estimate} />
              <span>{chip.text}</span>
              <span className="font-normal text-[color:var(--hms-mute)]">{chip.sub}</span>
            </>
          ) : (
            <span className="pl-1.5 font-normal text-[color:var(--hms-mute)]">Limits…</span>
          )}
        </button>

        {open && (
          <div role="dialog" aria-label="Your limits" className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(400px,calc(100vw-32px))] rounded-[20px] border border-[color:var(--hms-line)] bg-gray-900 px-[22px] pb-4 pt-5 shadow-2xl">
            <h2 className="mb-4 font-display text-[17px] font-bold text-gray-100">Your limits</h2>
            {metersOf(data).map((m) => (
              <MeterBlock key={m.key} m={m} now={now} />
            ))}
            {metersOf(data).every((m) => m.percentage === null) && (
              <p className="text-sm text-[color:var(--hms-mute)]">
                {data.statusLine.installed ? 'Waiting for Claude Code to report your limits. They arrive with its next answer.' : 'Nothing counted yet.'}
              </p>
            )}
            <Footer data={data} now={now} onDetails={() => { setOpen(false); setDrawer(true) }} onNavigate={() => setOpen(false)} />
          </div>
        )}
      </div>
      {drawer && <LimitsDrawer overview={data} now={now} onClose={() => setDrawer(false)} />}
    </>
  )
}

function Footer({ data, now, onDetails, onNavigate }: { data: UsageOverview; now: number; onDetails: () => void; onNavigate: () => void }) {
  const live = data.real.updatedAt && (data.real.fiveHour || data.real.sevenDay)
  return (
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-[color:var(--hms-rule)] pt-3 text-xs text-[color:var(--hms-mute)]">
      {live ? (
        <span className="flex items-center gap-2">
          <span className="h-[7px] w-[7px] rounded-full bg-emerald-400 shadow-[0_0_7px_#34d399]" />
          Claude Code · {formatAgo(data.real.updatedAt!, now)}
        </span>
      ) : data.statusLine.installed ? (
        <span>Waiting for Claude Code</span>
      ) : (
        <Link to="/settings" search={{ tab: 'claude' }} onClick={onNavigate} className="font-medium text-brand-400 hover:underline">
          Show my real limits →
        </Link>
      )}
      <button type="button" onClick={onDetails} className="font-medium text-brand-400 hover:underline">
        What used it →
      </button>
    </div>
  )
}
