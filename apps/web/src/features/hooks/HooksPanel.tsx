import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { setHookEnabled } from './hooks.api'
import { hookStateQuery } from './hook-state.queries'

const ROWS = [
  {
    kind: 'notify' as const,
    title: 'Needs you notifications',
    text: 'Tells HoldMySession when Claude Code is waiting for you or has finished, so the map can show Needs you and recent events.',
  },
  {
    kind: 'start' as const,
    title: 'Start HoldMySession with Claude Code',
    text: 'Starts HoldMySession in the background when a Claude Code session starts, if it is not already running.',
  },
]

export function HooksPanel() {
  const queryClient = useQueryClient()
  const { data: state } = useQuery(hookStateQuery)
  const [error, setError] = useState<string | null>(null)
  const set = useMutation({
    mutationFn: setHookEnabled,
    onSuccess: (next) => {
      setError(null)
      queryClient.setQueryData(hookStateQuery.queryKey, next)
    },
    onError: (e) => setError(e instanceof Error ? e.message : String(e)),
  })

  if (!state) return null
  return (
    <div>
      <p className="max-w-[720px] text-[17px] leading-relaxed text-[color:var(--hms-mute)]">
        Hooks are small commands Claude Code runs on events. Turning one on adds it to Claude Code's settings file, and
        turning it off removes only that entry. Everything else in the file is kept, and a copy is saved in the dashboard's
        own folder first. This is the only thing HoldMySession ever writes under your Claude folder.
      </p>
      <div className="mt-6">
        {ROWS.map((row) => {
          const on = state[row.kind]
          return (
            <div key={row.kind} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{row.title}</h2>
                <p className="text-[13px] text-[color:var(--hms-mute)]">{row.text}</p>
                {state.stale[row.kind] && (
                  <p className="mt-0.5 text-[13px] text-amber-400">
                    This hook is out of date: it points to somewhere else, such as an older copy of the app, or it lacks an event added since. Turn it off and on to fix it.
                  </p>
                )}
                <p className="mt-0.5 truncate font-mono text-[11px] text-[color:var(--hms-mute)] opacity-70" title={state.commands[row.kind]}>
                  {state.commands[row.kind]}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={row.title}
                disabled={!state.readable || set.isPending}
                onClick={() => set.mutate({ data: { kind: row.kind, enabled: !on } })}
                className={`relative inline-flex h-[30px] w-[52px] shrink-0 cursor-pointer items-center rounded-full border-[1.5px] transition-colors disabled:opacity-50 ${
                  on ? 'border-brand-400 bg-brand-400/20' : 'border-[color:var(--hms-line)]'
                }`}
              >
                <span className={`inline-block h-[21px] w-[21px] rounded-full transition-transform ${on ? 'translate-x-[26px] bg-brand-400' : 'translate-x-[3px] bg-gray-400'}`} />
              </button>
            </div>
          )
        })}
        <p className="mt-3 text-[13px] text-[color:var(--hms-mute)]">
          File: <span className="font-mono">{state.settingsPath}</span>. Claude Code reads its hooks when a session starts,
          so sessions that are already open need restarting to pick up a change.
        </p>
        {(state.error || error) && <p role="alert" className="mt-2 text-red-400">{state.error ?? error}</p>}
      </div>
    </div>
  )
}
