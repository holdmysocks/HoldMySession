import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { setCheckForUpdates } from './updates.api'
import { updateInfoQuery } from './updates.queries'
import { settingsQuery } from '@/features/settings/settings.queries'

export function UpdatesPanel() {
  const queryClient = useQueryClient()
  const { data: info } = useQuery(updateInfoQuery)
  const { data: settings } = useQuery(settingsQuery)
  const toggle = useMutation({
    mutationFn: setCheckForUpdates,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['update-info'] })
    },
  })
  if (!info || !settings) return null
  const on = settings.checkForUpdates
  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-gray-300">About and updates</h2>
      <div className="mt-3 space-y-2 rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-xs text-gray-400">
        <p className="text-gray-200">
          HoldMySession <span className="font-mono">v{info.current}</span>
          {info.available && info.latest && (
            <>
              {' '}
              <a href={info.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                v{info.latest} is available
              </a>
            </>
          )}
          {on && !info.available && info.latest && <span className="ml-2 text-gray-500">up to date</span>}
        </p>
        <div className="flex items-center justify-between gap-4">
          <p>Check GitHub for new releases now and then. Only the latest version number is read.</p>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Check for updates"
            onClick={() => toggle.mutate({ data: { enabled: !on } })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-gray-800'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
          </button>
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
