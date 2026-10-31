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

const TONE = { ok: 'text-emerald-400', info: 'text-brand-600', warn: 'text-red-400', muted: 'text-gray-500' }

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

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-gray-300">About and updates</h2>
      <div className="mt-3 space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-4 text-xs text-gray-400">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-gray-200">
              HoldMySession <span className="font-mono">v{info.current}</span>
            </p>
            {message && (
              <p role="status" className={`mt-1 ${TONE[message.tone]}`}>
                {message.text}
              </p>
            )}
            {percent !== null && (
              <div className="mt-2 h-1.5 w-48 overflow-hidden rounded bg-gray-800" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-brand-600 transition-all" style={{ width: `${percent}%` }} />
              </div>
            )}
            {info.available && !info.canInstall && info.cannotInstallReason && <p className="mt-1 text-gray-500">{info.cannotInstallReason}</p>}
            {(install.error || check.error) && <p role="alert" className="mt-1 text-red-400">{(install.error ?? check.error)?.message}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => check.mutate()}
              disabled={check.isPending || busy}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {check.isPending ? 'Checking…' : 'Check for updates'}
            </button>
            {info.available && info.canInstall && (
              <button
                type="button"
                onClick={() => install.mutate()}
                disabled={busy}
                className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? 'Updating…' : 'Update now'}
              </button>
            )}
            {info.available && !info.canInstall && (
              <a href={info.url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-brand-600 hover:bg-gray-800">
                Download
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-gray-800 pt-3">
          <p>Look for new releases now and then. Only the latest version number is read from GitHub.</p>
          <Toggle on={info.checking} onChange={(enabled) => checkSetting.mutate({ data: { enabled } })} label="Check for updates" />
        </div>
        <div className="flex items-center justify-between gap-4">
          <p>
            Install updates automatically: new versions are downloaded in the background and installed when HoldMySession next
            closes. <span className="text-gray-500">Desktop app only.</span>
          </p>
          <Toggle
            on={info.autoUpdate && info.checking && !!info.update}
            onChange={(enabled) => autoSetting.mutate({ data: { enabled } })}
            label="Install updates automatically"
            disabled={!info.checking || !info.canInstall && !info.update}
          />
        </div>
        <p>
          <a href="https://github.com/holdmysocks/HoldMySession/releases" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
            All releases
          </a>
        </p>
      </div>
    </div>
  )
}
