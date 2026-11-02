import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PillSelect } from '@/components/ui/PillSelect'
import { formatAgo } from '@/lib/utils/format'
import { metersOf } from '@/lib/usage/display'
import { settingsQuery } from '@/features/settings/settings.queries'
import type { FiveHourMode } from '@/features/settings/settings.types'
import { setLimitsSettings, setStatusLineEnabled } from './usage.api'
import { statusLineQuery, usageQuery } from './usage.queries'

const FIVE_HOUR_OPTIONS: Array<{ value: FiveHourMode; label: string }> = [
  { value: 'auto', label: 'Only if my plan has one' },
  { value: 'always', label: 'Always show it' },
  { value: 'never', label: 'Never show it' },
]

/** Settings, Claude Code tab: show the real limits by becoming Claude Code's status line, and choose whether the 5-hour limit is drawn. */
export function StatusLinePanel() {
  const queryClient = useQueryClient()
  const { data: state } = useQuery(statusLineQuery)
  const { data: usage } = useQuery(usageQuery())
  const { data: settings } = useQuery(settingsQuery)
  const [error, setError] = useState<string | null>(null)

  const set = useMutation({
    mutationFn: setStatusLineEnabled,
    onSuccess: (next) => {
      setError(null)
      queryClient.setQueryData(statusLineQuery.queryKey, next)
      queryClient.invalidateQueries({ queryKey: ['usage'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })
  const choose = useMutation({
    mutationFn: (fiveHour: FiveHourMode) => setLimitsSettings({ data: { fiveHour } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['usage'] })
    },
  })

  if (!state) return null
  const on = state.installed
  const reported = usage?.real.updatedAt && (usage.real.fiveHour || usage.real.sevenDay) ? usage : null
  const summary = reported
    ? metersOf(reported)
        .filter((m) => !m.estimate && m.percentage !== null)
        .map((m) => `${m.key === 'five' ? '5-hour' : 'weekly'} ${Math.round(m.percentage!)}%`)
        .join(', ')
    : ''
  const mode = settings?.limits.fiveHour ?? 'auto'

  return (
    <section aria-label="Usage limits" className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]">
        <div className="min-w-0 max-w-[640px]">
          <h2 className="text-base font-semibold">Show my real limits</h2>
          <p className="text-[13px] text-[color:var(--hms-mute)]">
            Shows your usage limits as Claude Code reports them, instead of a guess. It makes HoldMySession Claude Code's status line. A status line you already have keeps running and looks the same. Works with Claude Pro, Max and Ultra.
          </p>
          {state.stale && <p className="mt-0.5 text-[13px] text-amber-400">The status line points to somewhere else, such as an older copy of the app. Turn it off and on to fix it.</p>}
          <p className="mt-0.5 truncate font-mono text-[11px] text-[color:var(--hms-mute)] opacity-70" title={state.command}>{state.command}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Show my real limits"
          disabled={!state.readable || set.isPending}
          onClick={() => set.mutate({ data: { enabled: !on } })}
          className={`relative inline-flex h-[30px] w-[52px] shrink-0 cursor-pointer items-center rounded-full border-[1.5px] transition-colors disabled:opacity-50 ${on ? 'border-brand-400 bg-brand-400/20' : 'border-[color:var(--hms-line)]'}`}
        >
          <span className={`inline-block h-[21px] w-[21px] rounded-full transition-transform ${on ? 'translate-x-[26px] bg-brand-400' : 'translate-x-[3px] bg-gray-400'}`} />
        </button>
      </div>

      {on && (
        <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-[color:var(--hms-chip-bg)] px-4 py-3 text-sm text-[color:var(--hms-chip-ink)]">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          {reported && summary
            ? `On. Claude Code last reported ${formatAgo(reported.real.updatedAt!, reported.now)}: ${summary}.`
            : 'On. The first report arrives with the next answer Claude Code gives.'}
        </div>
      )}
      <p className="mt-3 text-[13px] text-[color:var(--hms-mute)]">
        {state.otherStatusLine && !on ? 'You have a status line already. It will be kept and still shown. ' : ''}
        {on ? 'Turning it off puts your old status line back exactly. ' : ''}
        File: <span className="font-mono">{state.settingsPath}</span>. A copy is saved first. Claude Code picks the change up by itself.
      </p>
      {(state.error || error) && <p role="alert" className="mt-2 text-red-400">{state.error ?? error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]">
        <div className="min-w-0 max-w-[640px]">
          <h2 className="text-base font-semibold">5-hour limit</h2>
          <p className="text-[13px] text-[color:var(--hms-mute)]">
            Some plans, such as Ultra, have no 5-hour limit. With the first choice it is drawn only once Claude Code has reported one, so on those plans you only ever see the weekly limit. The last choice hides it everywhere, estimates included.
          </p>
        </div>
        <PillSelect label="5-hour limit" value={mode} onChange={(v) => choose.mutate(v as FiveHourMode)} options={FIVE_HOUR_OPTIONS} disabled={choose.isPending} align="right" />
      </div>
    </section>
  )
}
