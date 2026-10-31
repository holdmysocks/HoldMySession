import { PillSelect } from '@/components/ui/PillSelect'
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
  const days =
    status && !status.error && status.firstDay && status.lastDay
      ? Math.max(1, Math.round((Date.parse(status.lastDay) - Date.parse(status.firstDay)) / 86_400_000) + 1)
      : 0
  const lastScanText = scanning
    ? 'scanning now'
    : scan
      ? `last scan ${format(new Date(scan.startedAt), clockPattern('MMM d, HH:mm'))}: ${scan.status}, ${scan.sessionsSeen} sessions seen, ${scan.sessionsAdded} new`
      : 'never scanned'

  return (
    <div className="flex flex-col">
      <section aria-label="History database" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">History database</h2>
          {!status ? (
            <p className="text-[13px] text-[color:var(--hms-mute)]">Loading…</p>
          ) : status.error ? (
            <p role="alert" className="text-[13px] text-red-400">Could not open the history database: {status.error}</p>
          ) : (
            <p className="text-[13px] text-[color:var(--hms-mute)]">
              <span className="font-mono" title={status.path}>{status.path}</span> · {status.sessions} sessions
              {status.sessionsNotOnDisk > 0 && ` (${status.sessionsNotOnDisk} no longer on disk)`}
              {days > 0 && ` · ${days} days`} · {lastScanText}
              {scan?.message && <span className="block text-amber-400">{scan.message}</span>}
            </p>
          )}
          {rescan.data && !rescan.data.ok && <p role="alert" className="text-[13px] text-red-400">Scan failed: {rescan.data.message}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => rescan.mutate()} disabled={scanning} className="min-h-11 rounded-full border border-[color:var(--hms-line)] bg-transparent px-[18px] text-sm font-medium text-gray-100 hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-50">
            {scanning ? 'Scanning…' : 'Rescan now'}
          </button>
          <button type="button" onClick={() => check.mutate()} disabled={check.isPending} className="min-h-11 rounded-full border border-[color:var(--hms-line)] bg-transparent px-[18px] text-sm font-medium text-gray-100 hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-50">
            {check.isPending ? 'Checking…' : 'Check against session files'}
          </button>
        </div>
      </section>

      {check.data === null && <p className="mt-3 text-amber-400">Nothing to compare yet.</p>}
      {check.data && check.data.changedWhileChecking > 0 && (
        <p className="mt-3 text-amber-400">
          {check.data.changedWhileChecking} session{check.data.changedWhileChecking === 1 ? ' was' : 's were'} still being written while this ran, so small differences are expected. Run it again when nothing is active for an exact match.
        </p>
      )}
      {check.data && (
        <table className="mt-3 w-full text-left text-sm">
          <thead>
            <tr className="text-[color:var(--hms-mute)]">
              <th className="py-1 font-normal">Total</th>
              <th className="py-1 text-right font-normal">Session files</th>
              <th className="py-1 text-right font-normal">History database</th>
              <th className="py-1 pl-3 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {check.data.rows.map((row) => (
              <tr key={row.label} className="border-t border-[color:var(--hms-rule)]">
                <td className="py-2">{row.label}</td>
                <td className="py-2 text-right font-mono">{row.live.toLocaleString()}</td>
                <td className="py-2 text-right font-mono">{row.history.toLocaleString()}</td>
                <td className={`py-2 pl-3 ${row.same ? 'text-[color:var(--hms-chip-ink)]' : 'text-red-400'}`}>
                  {row.same ? 'same' : `differs by ${(row.history - row.live).toLocaleString()}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {autoScan && (
        <section aria-label="Scan interval" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]">
          <div>
            <h2 className="text-base font-semibold">Scan automatically</h2>
            <p className="text-[13px] text-[color:var(--hms-mute)]">
              Keeps Stats up to date between your visits.{' '}
              {scanning
                ? 'Scanning now.'
                : !autoScan.enabled
                  ? 'Off. Use Rescan now to refresh.'
                  : scan?.finishedAt
                    ? `Next around ${format(new Date(new Date(scan.finishedAt).getTime() + autoScan.intervalMinutes * 60_000), clockPattern('HH:mm'))}.`
                    : 'Runs when the server starts.'}
            </p>
          </div>
          <div className="flex items-center gap-3.5">
            <PillSelect
              label="Scan interval"
              value={String(autoScan.intervalMinutes)}
              disabled={!autoScan.enabled}
              align="right"
              onChange={(v) => saveAutoScan.mutate({ data: { ...autoScan, intervalMinutes: Number(v) } })}
              options={AUTO_SCAN_INTERVALS.map((m) => ({ value: String(m), label: `Every ${intervalLabel(m)}` }))}
            />
            <button
              type="button"
              role="switch"
              aria-checked={autoScan.enabled}
              aria-label="Scan automatically"
              onClick={() => saveAutoScan.mutate({ data: { ...autoScan, enabled: !autoScan.enabled } })}
              className={`relative inline-flex h-[30px] w-[52px] shrink-0 cursor-pointer items-center rounded-full border-[1.5px] transition-colors ${
                autoScan.enabled ? 'border-brand-400 bg-brand-400/20' : 'border-[color:var(--hms-line)]'
              }`}
            >
              <span className={`inline-block h-[21px] w-[21px] rounded-full transition-transform ${autoScan.enabled ? 'translate-x-[26px] bg-brand-400' : 'translate-x-[3px] bg-gray-400'}`} />
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
