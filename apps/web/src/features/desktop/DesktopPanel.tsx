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
    <section aria-label="Desktop app" className="border-b border-[color:var(--hms-rule)] py-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="text-base font-semibold">{mac ? 'Open at login' : 'Start with Windows'}</h2>
          <p className="text-[13px] text-[color:var(--hms-mute)]">
            Opens in the {mac ? 'menu bar' : 'tray'} when you sign in, without opening the window.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={mac ? 'Open at login' : 'Start with Windows'}
          disabled={set.isPending}
          onClick={() => set.mutate(!on)}
          className={`relative inline-flex h-[30px] w-[52px] shrink-0 cursor-pointer items-center rounded-full border-[1.5px] transition-colors disabled:opacity-50 ${on ? 'border-brand-400 bg-brand-400/20' : 'border-[color:var(--hms-line)]'}`}
        >
          <span className={`inline-block h-[21px] w-[21px] rounded-full transition-transform ${on ? 'translate-x-[26px] bg-brand-400' : 'translate-x-[3px] bg-gray-400'}`} />
        </button>
      </div>
      {refused && <p role="alert" className="mt-2 text-sm text-red-400">This system did not accept the change, so it stays {on ? 'on' : 'off'}.</p>}
      {set.error && <p role="alert" className="mt-2 text-sm text-red-400">{set.error.message}</p>}
    </section>
  )
}
