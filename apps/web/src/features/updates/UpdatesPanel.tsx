import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { checkForUpdatesNow, setAutoUpdate, setCheckForUpdates, updateNow, type UpdateState } from './updates.api'
import { updateInfoQuery } from './updates.queries'
import { Toggle } from '@/features/settings/Toggle'

function describe(info: UpdateState, checkedByHand: boolean): { text: string; tone: 'ok' | 'info' | 'warn' | 'muted' } | null {
  const u = info.update
  if (u?.phase === 'downloading') return { text: `Downloading v${u.version}${u.percent !== null ? ` (${u.percent}%)` : ''}…`, tone: 'info' }
  if (u?.phase === 'installing') return { text: `Installing v${u.version}. HoldMySession will restart.`, tone: 'info' }
  if (u?.phase === 'error') return { text: `The update failed: ${u.error ?? 'unknown error'}`, tone: 'warn' }
  if (u?.phase === 'ready') return { text: `v${u.version} is downloaded and installs when HoldMySession next closes, or press Update now.`, tone: 'ok' }
  if (info.available && info.latest) return { text: `v${info.latest} is available.`, tone: 'info' }
  if (info.latest) return { text: checkedByHand ? `You are up to date (v${info.current}).` : 'Up to date.', tone: 'muted' }
  if (checkedByHand) return { text: 'Could not find out the latest version. Check your connection, or that the releases page is public.', tone: 'warn' }
  return null
}

const TONE = { ok: 'text-[color:var(--hms-chip-ink)]', info: 'text-brand-400', warn: 'text-red-400', muted: 'text-[color:var(--hms-chip-ink)]' }

export function UpdatesPanel() {
  const queryClient = useQueryClient()
  const { data: info } = useQuery(updateInfoQuery)
  const publish = (next: UpdateState) => queryClient.setQueryData(updateInfoQuery.queryKey, next)
  const refresh = () => queryClient.invalidateQueries({ queryKey: updateInfoQuery.queryKey })
  const check = useMutation({ mutationFn: () => checkForUpdatesNow(), onSuccess: publish })
  const install = useMutation({ mutationFn: () => updateNow(), onSuccess: publish })
  const checkSetting = useMutation({ mutationFn: setCheckForUpdates, onSuccess: refresh })
  const autoSetting = useMutation({ mutationFn: setAutoUpdate, onSuccess: refresh })
  if (!info) return null

  const busy = info.update?.phase === 'downloading' || info.update?.phase === 'installing' || install.isPending
  const message = describe(info, check.isSuccess)
  const percent = info.update?.phase === 'downloading' ? info.update.percent : null

  const row = 'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]'
  const button =
    'min-h-11 rounded-full border border-[color:var(--hms-line)] bg-transparent px-[18px] text-sm font-medium text-gray-100 hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <div>
      <section aria-label="About" className={row}>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            HoldMySession <span className="font-mono">v{info.current}</span>
          </h2>
          {message && (
            <p role="status" className={`text-[13px] ${TONE[message.tone]}`}>
              {message.text}
            </p>
          )}
          {percent !== null && (
            <div className="mt-2 h-1.5 w-48 overflow-hidden rounded bg-[color:var(--hms-track)]" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-brand-400 transition-all" style={{ width: `${percent}%` }} />
            </div>
          )}
          {info.available && !info.canInstall && info.cannotInstallReason && <p className="text-[13px] text-[color:var(--hms-mute)]">{info.cannotInstallReason}</p>}
          {(install.error || check.error) && <p role="alert" className="text-[13px] text-red-400">{(install.error ?? check.error)?.message}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => check.mutate()} disabled={check.isPending || busy} className={button}>
            {check.isPending ? 'Checking…' : 'Check for updates'}
          </button>
          {info.available && info.canInstall ? (
            <button
              type="button"
              onClick={() => install.mutate()}
              disabled={busy}
              className="min-h-11 rounded-full bg-brand-400 px-5 text-sm font-semibold text-gray-950 transition-colors hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Updating…' : 'Update now'}
            </button>
          ) : info.available && !info.canInstall ? (
            <a href={info.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center ${button} text-brand-400`}>
              Download
            </a>
          ) : (
            <button type="button" disabled className="min-h-11 rounded-full border border-[color:var(--hms-rule)] bg-transparent px-[18px] text-sm font-medium text-[color:var(--hms-mute)] opacity-60">
              Update now
            </button>
          )}
        </div>
      </section>

      <section aria-label="Look for new releases" className={row}>
        <div>
          <h2 className="text-base font-semibold">Look for new releases</h2>
          <p className="text-[13px] text-[color:var(--hms-mute)]">Only the latest version number is read from GitHub.</p>
        </div>
        <Toggle on={info.checking} onChange={(enabled) => checkSetting.mutate({ data: { enabled } })} label="Check for updates" />
      </section>
      <section aria-label="Install updates automatically" className={row}>
        <div>
          <h2 className="text-base font-semibold">Install updates automatically</h2>
          <p className="text-[13px] text-[color:var(--hms-mute)]">
            New versions download in the background and install when HoldMySession next closes. Desktop app only.
          </p>
        </div>
        <Toggle
          on={info.autoUpdate && info.checking && !!info.update}
          onChange={(enabled) => autoSetting.mutate({ data: { enabled } })}
          label="Install updates automatically"
          disabled={!info.checking || (!info.canInstall && !info.update)}
        />
      </section>
      <p className="mt-4">
        <a href="https://github.com/holdmysocks/HoldMySession/releases" target="_blank" rel="noopener noreferrer" className="text-sm text-brand-400 hover:underline">
          All releases
        </a>
      </p>
    </div>
  )
}
