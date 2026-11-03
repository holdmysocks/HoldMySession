import { useState } from 'react'
import { useMutation, useQuery, useQueryClient, queryOptions } from '@tanstack/react-query'
import { getDesktopState, setIdleQuit, setNeedsYouAlerts, setOpenAtLogin, setShowWindowOnHookStart } from './desktop.api'
import { PillSelect } from '@/components/ui/PillSelect'
import { hookStateQuery } from '@/features/hooks/hook-state.queries'
import { settingsQuery } from '@/features/settings/settings.queries'
import { setLimitsSettings } from '@/features/usage/usage.api'

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
  const alerts = useMutation({
    mutationFn: (enabled: boolean) => setNeedsYouAlerts({ data: { enabled } }),
    onSuccess: (next) => {
      queryClient.setQueryData(desktopStateQuery.queryKey, next)
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })
  const { data: settings } = useQuery(settingsQuery)
  const limitAlerts = useMutation({
    mutationFn: (enabled: boolean) => setLimitsSettings({ data: { alerts: enabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })
  const { data: hooks } = useQuery(hookStateQuery)
  const hookWindow = useMutation({
    mutationFn: (enabled: boolean) => setShowWindowOnHookStart({ data: { enabled } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })
  const idle = useMutation({
    mutationFn: (change: { quit?: boolean; minutes?: 10 | 30 | 60 | 120 }) => setIdleQuit({ data: change }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })
  if (!data?.desktop) return null
  const isMaster = settings?.link.role === 'master'
  const idleQuit = settings?.idle.quit ?? true
  const showOnHook = settings?.showWindowOnHookStart ?? false
  const idleMinutes = settings?.idle.minutes ?? 30
  const limitsOn = settings?.limits.alerts ?? true
  const mac = data.platform === 'darwin'
  const on = data.openAtLogin
  return (
    <>
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
    <section aria-label="Needs-you alerts" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]">
      <div>
        <h2 className="text-base font-semibold">Alert me when a session needs me</h2>
        <p className="text-[13px] text-[color:var(--hms-mute)]">
          A notification, and a count on the {mac ? 'menu bar' : 'tray'} icon, the moment a session starts waiting on you. It says what it wants, and clicking it opens the Map on that session. No alert while the window is in front of you.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={data.alerts}
        aria-label="Alert me when a session needs me"
        disabled={alerts.isPending}
        onClick={() => alerts.mutate(!data.alerts)}
        className={`relative inline-flex h-[30px] w-[52px] shrink-0 cursor-pointer items-center rounded-full border-[1.5px] transition-colors disabled:opacity-50 ${data.alerts ? 'border-brand-400 bg-brand-400/20' : 'border-[color:var(--hms-line)]'}`}
      >
        <span className={`inline-block h-[21px] w-[21px] rounded-full transition-transform ${data.alerts ? 'translate-x-[26px] bg-brand-400' : 'translate-x-[3px] bg-gray-400'}`} />
      </button>
    </section>
    <section aria-label="Limit alerts" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]">
      <div>
        <h2 className="text-base font-semibold">Alert me about my limits</h2>
        <p className="text-[13px] text-[color:var(--hms-mute)]">
          A notification as a limit passes 75% and 90%, and when it resets. The {mac ? 'menu bar' : 'tray'} icon turns yellow, then red. Needs "Show my real limits" in Settings, under Claude Code.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={limitsOn}
        aria-label="Alert me about my limits"
        disabled={limitAlerts.isPending}
        onClick={() => limitAlerts.mutate(!limitsOn)}
        className={`relative inline-flex h-[30px] w-[52px] shrink-0 cursor-pointer items-center rounded-full border-[1.5px] transition-colors disabled:opacity-50 ${limitsOn ? 'border-brand-400 bg-brand-400/20' : 'border-[color:var(--hms-line)]'}`}
      >
        <span className={`inline-block h-[21px] w-[21px] rounded-full transition-transform ${limitsOn ? 'translate-x-[26px] bg-brand-400' : 'translate-x-[3px] bg-gray-400'}`} />
      </button>
    </section>
 <section aria-label="Window when Claude Code starts the app" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]">
      <div className="min-w-0 max-w-[640px]">
        <h2 className="text-base font-semibold">Open the window when Claude Code starts it</h2>
        <p className="text-[13px] text-[color:var(--hms-mute)]">
          Off: when the Claude Code start hook starts HoldMySession, it goes straight to the {mac ? 'menu bar' : 'tray'} with no window, and the window only opens when you open it. On: it opens its window.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={showOnHook}
        aria-label="Open the window when Claude Code starts it"
        disabled={hookWindow.isPending}
        onClick={() => hookWindow.mutate(!showOnHook)}
        className={`relative inline-flex h-[30px] w-[52px] shrink-0 cursor-pointer items-center rounded-full border-[1.5px] transition-colors disabled:opacity-50 ${showOnHook ? 'border-brand-400 bg-brand-400/20' : 'border-[color:var(--hms-line)]'}`}
      >
        <span className={`inline-block h-[21px] w-[21px] rounded-full transition-transform ${showOnHook ? 'translate-x-[26px] bg-brand-400' : 'translate-x-[3px] bg-gray-400'}`} />
      </button>
    </section>
    <section aria-label="Quit when idle" className="border-b border-[color:var(--hms-rule)] py-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-[640px]">
          <h2 className="text-base font-semibold">Quit when Claude Code is not in use</h2>
          <p className="text-[13px] text-[color:var(--hms-mute)]">
            Uses no memory while you are not working. HoldMySession quits after Claude Code has gone unused, and starts again with your next Claude session or message. It never quits while its window is open or while a session needs you. A node sends its latest sessions to its master before it quits, and its master can change this for it in Settings, Machines. A master stays running so its nodes can reach it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {idleQuit && !isMaster && (
            <PillSelect
              label="Quit after"
              value={String(idleMinutes)}
              onChange={(v) => idle.mutate({ minutes: Number(v) as 10 | 30 | 60 | 120 })}
              options={[
                { value: '10', label: 'After 10 minutes' },
                { value: '30', label: 'After 30 minutes' },
                { value: '60', label: 'After 1 hour' },
                { value: '120', label: 'After 2 hours' },
              ]}
              align="right"
              disabled={idle.isPending}
            />
          )}
          <button
            type="button"
            role="switch"
            aria-checked={idleQuit && !isMaster}
            aria-label="Quit when Claude Code is not in use"
            disabled={idle.isPending || isMaster}
            onClick={() => idle.mutate({ quit: !idleQuit })}
            className={`relative inline-flex h-[30px] w-[52px] shrink-0 cursor-pointer items-center rounded-full border-[1.5px] transition-colors disabled:opacity-50 ${idleQuit && !isMaster ? 'border-brand-400 bg-brand-400/20' : 'border-[color:var(--hms-line)]'}`}
          >
            <span className={`inline-block h-[21px] w-[21px] rounded-full transition-transform ${idleQuit && !isMaster ? 'translate-x-[26px] bg-brand-400' : 'translate-x-[3px] bg-gray-400'}`} />
          </button>
        </div>
      </div>
      {isMaster && <p className="mt-2 text-[13px] text-[color:var(--hms-mute)]">This machine is a master, so it stays running and this does not apply to it.</p>}
      {idleQuit && !isMaster && hooks && (!hooks.start || hooks.stale.start) && (
        <p className="mt-2 text-[13px] text-amber-400">
          This only works with the "Start HoldMySession with Claude Code" hook switched on and up to date, in Settings, Claude Code. Until then it does not quit.
        </p>
      )}
    </section>
    </>
  )
}
