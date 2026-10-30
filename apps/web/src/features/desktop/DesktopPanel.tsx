import { useState } from 'react'
import { useMutation, useQuery, useQueryClient, queryOptions } from '@tanstack/react-query'
import { getDesktopState, setOpenAtLogin } from './desktop.api'

export const desktopStateQuery = queryOptions({
  queryKey: ['desktop-state'],
  queryFn: () => getDesktopState(),
  refetchOnWindowFocus: true,
})

/** Settings for the desktop app. Draws nothing when HoldMySession is run from a browser or the command line. */
export function DesktopPanel() {
  const queryClient = useQueryClient()
  const { data } = useQuery(desktopStateQuery)
  const [refused, setRefused] = useState(false)
  const set = useMutation({
    mutationFn: (enabled: boolean) => setOpenAtLogin({ data: { enabled } }),
    onSuccess: (next, enabled) => {
      queryClient.setQueryData(desktopStateQuery.queryKey, next)
      // The system is asked again after the change, so a refusal shows instead of a switch that quietly does nothing.
      setRefused(next.openAtLogin !== enabled)
    },
  })
  if (!data?.desktop) return null
  const mac = data.platform === 'darwin'
  const on = data.openAtLogin
  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-gray-300">Desktop app</h2>
      <div className="mt-3 space-y-2 rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-xs text-gray-400">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-gray-200">{mac ? 'Open at login' : 'Start with Windows'}</p>
            <p className="mt-0.5 text-gray-500">
              Starts HoldMySession in the {mac ? 'menu bar' : 'tray'} when you sign in, without opening the window.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={mac ? 'Open at login' : 'Start with Windows'}
            disabled={set.isPending}
            onClick={() => set.mutate(!on)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-brand-600' : 'bg-gray-800'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
          </button>
        </div>
        <p className="text-[10px] text-gray-500">The same switch is in the {mac ? 'menu bar' : 'tray'} icon's menu, with a tick when it is on.</p>
        {refused && <p role="alert" className="text-red-400">This system did not accept the change, so it stays {on ? 'on' : 'off'}.</p>}
        {set.error && <p role="alert" className="text-red-400">{set.error.message}</p>}
      </div>
    </div>
  )
}
