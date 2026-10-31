import { useMutation, useQuery, useQueryClient, queryOptions } from '@tanstack/react-query'
import { format } from 'date-fns'
import { settingsQuery } from '@/features/settings/settings.queries'
import { AUTO_SCAN_INTERVALS } from '@/features/settings/settings.types'
import { checkHistory, getHistoryStatus, rescanHistory, setAutoScan } from './history.api'
import { clockPattern } from '@/lib/utils/time-format'

const intervalLabel = (m: number) => (m < 60 ? `${m} minutes` : m === 60 ? '1 hour' : `${m / 60} hours`)

export const historyStatusQuery = queryOptions({
  queryKey: ['history-status'],
  queryFn: () => getHistoryStatus(),
  refetchOnWindowFocus: false,
  // Quick while a scan runs, so its end shows without a refresh, and slow otherwise so a scan that starts by itself shows too.
  refetchInterval: (query) => (query.state.data?.scanning ? 2_000 : 10_000),
})

export function HistoryPanel() {
  const queryClient = useQueryClient()
  const { data: status } = useQuery(historyStatusQuery)
  const rescan = useMutation({
    mutationFn: () => rescanHistory(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history-status'] }),
  })

  const check = useMutation({ mutationFn: () => checkHistory() })
  const { data: settings } = useQuery(settingsQuery)
  const autoScan = settings?.autoScan
  const saveAutoScan = useMutation({
    mutationFn: setAutoScan,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })

  const scan = status?.lastScan
  const scanning = !!status?.scanning || rescan.isPending
  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-gray-300">History database</h2>
      <p className="mt-1 text-[10px] text-gray-500">
        A copy of your usage kept by the dashboard, so it survives the Claude folder being cleared. Copy the file to
        move your history to another machine.
      </p>
      <div className="mt-3 rounded-2xl border border-gray-800 bg-gray-900 p-4 text-xs text-gray-400">
        {!status ? (
          <p>Loading…</p>
        ) : status.error ? (
          <p role="alert" className="text-red-400">Could not open the history database: {status.error}</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-gray-500">File</dt>
            <dd className="truncate font-mono text-gray-300" title={status.path}>{status.path}</dd>
            <dt className="text-gray-500">Sessions</dt>
            <dd className="text-gray-300">
              {status.sessions}
              {status.sessionsNotOnDisk > 0 && ` (${status.sessionsNotOnDisk} no longer on disk)`}
            </dd>
            <dt className="text-gray-500">Days covered</dt>
            <dd className="text-gray-300">
              {status.firstDay && status.lastDay ? `${status.firstDay} to ${status.lastDay}` : 'None yet'}
            </dd>
            <dt className="text-gray-500">Last scan</dt>
            <dd className="text-gray-300">
              {scanning && (
                <span className="mr-2 inline-flex items-center gap-1.5 text-brand-600">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" aria-hidden="true" />
                  Scanning…
                </span>
              )}
              {scan
                ? `${format(new Date(scan.startedAt), clockPattern('MMM d, HH:mm'))}: ${scan.status}, ${scan.sessionsSeen} sessions seen, ${scan.sessionsAdded} new`
                : scanning ? '' : 'Never'}
              {scan?.message && <span className="block text-amber-400">{scan.message}</span>}
            </dd>
          </dl>
        )}
        {autoScan && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-800 pt-3">
            <span className="text-gray-300">Scan automatically</span>
            <button
              type="button"
              role="switch"
              aria-checked={autoScan.enabled}
              aria-label="Scan automatically"
              onClick={() => saveAutoScan.mutate({ data: { ...autoScan, enabled: !autoScan.enabled } })}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                autoScan.enabled ? 'bg-brand-600' : 'bg-gray-800'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  autoScan.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
            <label className="flex items-center gap-1.5">
              every
              <select
                value={autoScan.intervalMinutes}
                disabled={!autoScan.enabled}
                onChange={(e) => saveAutoScan.mutate({ data: { ...autoScan, intervalMinutes: Number(e.target.value) } })}
                className="rounded border border-gray-800 bg-gray-950 px-2 py-1 text-xs text-gray-100 disabled:opacity-50"
              >
                {AUTO_SCAN_INTERVALS.map((m) => <option key={m} value={m}>{intervalLabel(m)}</option>)}
              </select>
            </label>
            <span className="text-gray-500">
              {scanning
                ? 'Scanning now'
                : !autoScan.enabled
                ? 'Off. Use Rescan now to refresh.'
                : scan?.finishedAt
                  ? `Next around ${format(new Date(new Date(scan.finishedAt).getTime() + autoScan.intervalMinutes * 60_000), clockPattern('HH:mm'))}`
                  : 'Runs when the server starts'}
            </span>
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => rescan.mutate()}
            disabled={scanning}
            className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-300 hover:text-gray-100 disabled:opacity-50"
          >
            {scanning ? 'Scanning…' : 'Rescan now'}
          </button>
          <button
            type="button"
            onClick={() => check.mutate()}
            disabled={check.isPending}
            className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-300 hover:text-gray-100 disabled:opacity-50"
          >
            {check.isPending ? 'Checking…' : 'Check against session files'}
          </button>
          {rescan.data && !rescan.data.ok && (
            <span role="alert" className="text-red-400">Scan failed: {rescan.data.message}</span>
          )}
        </div>
        {check.data === null && <p className="mt-3 text-amber-400">Nothing to compare yet.</p>}
        {check.data && check.data.changedWhileChecking > 0 && (
          <p className="mt-3 text-amber-400">
            {check.data.changedWhileChecking} session{check.data.changedWhileChecking === 1 ? ' was' : 's were'} still being written while this ran, so small differences are expected. Run it again when nothing is active for an exact match.
          </p>
        )}
        {check.data && (
          <table className="mt-3 w-full text-left">
            <thead>
              <tr className="text-gray-500">
                <th className="py-1 font-normal">Total</th>
                <th className="py-1 text-right font-normal">Session files</th>
                <th className="py-1 text-right font-normal">History database</th>
                <th className="py-1 pl-3 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {check.data.rows.map((row) => (
                <tr key={row.label} className="border-t border-gray-800">
                  <td className="py-1 text-gray-300">{row.label}</td>
                  <td className="py-1 text-right font-mono">{row.live.toLocaleString()}</td>
                  <td className="py-1 text-right font-mono">{row.history.toLocaleString()}</td>
                  <td className={`py-1 pl-3 ${row.same ? 'text-emerald-500' : 'text-red-400'}`}>
                    {row.same ? 'same' : `differs by ${(row.history - row.live).toLocaleString()}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
