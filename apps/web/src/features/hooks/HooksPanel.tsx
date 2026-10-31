import { useState } from 'react'
import { useMutation, useQuery, useQueryClient, queryOptions } from '@tanstack/react-query'
import { getHookState, setHookEnabled } from './hooks.api'

export const hookStateQuery = queryOptions({
  queryKey: ['hook-state'],
  queryFn: () => getHookState(),
  refetchOnWindowFocus: true,
})

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
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-gray-300">Claude Code hooks</h2>
      <p className="mt-1 text-[10px] text-gray-500">
        Hooks are small commands Claude Code runs on events. Turning one on adds it to Claude Code's settings file, and
        turning it off removes only that entry. Everything else in the file is kept, and a copy is saved in the dashboard's
        own folder first. This is the only thing HoldMySession ever writes under your Claude folder.
      </p>
      <div className="mt-3 space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-4 text-xs text-gray-400">
        {ROWS.map((row) => {
          const on = state[row.kind]
          return (
            <div key={row.kind} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-gray-200">{row.title}</p>
                <p className="mt-0.5 text-gray-500">{row.text}</p>
                {state.stale[row.kind] && (
                  <p className="mt-0.5 text-amber-400">
                    This hook points to somewhere else, such as an older copy of the app. Turn it off and on to fix it.
                  </p>
                )}
                <p className="mt-0.5 truncate font-mono text-[10px] text-gray-600" title={state.commands[row.kind]}>
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
                className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
                  on ? 'bg-brand-600' : 'bg-gray-800'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                    on ? 'translate-x-[18px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>
            </div>
          )
        })}
        <p className="border-t border-gray-800 pt-2 text-[10px] text-gray-500">
          File: <span className="font-mono">{state.settingsPath}</span>. Claude Code reads its hooks when a session starts,
          so sessions that are already open need restarting to pick up a change.
        </p>
        {(state.error || error) && <p role="alert" className="text-red-400">{state.error ?? error}</p>}
      </div>
    </div>
  )
}
