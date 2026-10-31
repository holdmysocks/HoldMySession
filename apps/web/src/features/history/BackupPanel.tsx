import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient, queryOptions } from '@tanstack/react-query'
import { format } from 'date-fns'
import { clockPattern } from '@/lib/utils/time-format'
import { GUARD_HEADER } from '@/lib/history/request-guard'
import { backUpNow, getBackups, removeBackup } from './history.api'

const backupsQuery = queryOptions({
  queryKey: ['history-backups'],
  queryFn: () => getBackups(),
  refetchOnWindowFocus: false,
})

const size = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

export function BackupPanel() {
  const queryClient = useQueryClient()
  const { data: backups = [] } = useQuery(backupsQuery)
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const backUp = useMutation({
    mutationFn: () => backUpNow(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history-backups'] }),
  })

  const remove = useMutation({
    mutationFn: (name: string) => removeBackup({ data: { name } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history-backups'] }),
  })

  function confirmDelete(name: string, when: string) {
    if (window.confirm(`Delete the backup from ${when}?\n\nThis cannot be undone.`)) remove.mutate(name)
  }

  const restore = useMutation({
    mutationFn: async (file: File) => {
      const response = await fetch('/api/history-restore', {
        method: 'POST',
        headers: { [GUARD_HEADER]: '1', 'Content-Type': 'application/octet-stream' },
        body: file,
      })
      return (await response.json()) as { ok: boolean; message?: string; sessions?: number; savedAs?: string }
    },
    onSuccess: (result) => {
      if (result.ok) {
        setMessage({
          ok: true,
          text: `Restored ${result.sessions} sessions. What was here before is saved as ${result.savedAs}.`,
        })
        // Everything on screen came from the old database.
        queryClient.invalidateQueries()
      } else {
        setMessage({ ok: false, text: result.message ?? 'The restore failed.' })
      }
    },
    onError: () => setMessage({ ok: false, text: 'The restore failed.' }),
  })

  function choose(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = ''
    if (!file) return
    setMessage(null)
    const sure = window.confirm(
      `Replace the history database with "${file.name}"?\n\nThe current one is saved to the backups list first, so this can be undone.`,
    )
    if (sure) restore.mutate(file)
  }

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-gray-300">Backup and restore</h2>
      <p className="mt-1 text-[10px] text-gray-500">
        Save a copy of the history database, or restore one, for example to carry your history to a new machine. The
        newest 10 backups are kept. A restore keeps this machine's identity from the backup, so a copied database carries on
        as the same machine.
      </p>
      <div className="mt-3 space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-4 text-xs text-gray-400">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => backUp.mutate()}
            disabled={backUp.isPending}
            className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-300 hover:text-gray-100 disabled:opacity-50"
          >
            {backUp.isPending ? 'Saving…' : 'Back up now'}
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={restore.isPending}
            className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-300 hover:text-gray-100 disabled:opacity-50"
          >
            {restore.isPending ? 'Restoring…' : 'Restore from file…'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".db,application/octet-stream"
            className="hidden"
            aria-label="Backup file to restore"
            onChange={(e) => choose(e.target.files?.[0])}
          />
          {message && (
            <span role={message.ok ? 'status' : 'alert'} className={message.ok ? 'text-emerald-500' : 'text-red-400'}>
              {message.text}
            </span>
          )}
        </div>
        {backups.length === 0 ? (
          <p>No backups yet.</p>
        ) : (
          <ul className="space-y-1">
            {backups.map((b) => (
              <li key={b.name} className="flex flex-wrap items-center gap-x-3 border-t border-gray-800 pt-1">
                <span className="w-44 text-gray-300">{format(new Date(b.createdAt), clockPattern('MMM d, yyyy HH:mm'))}</span>
                <span className="font-mono text-gray-500">{size(b.sizeBytes)}</span>
                <span className="truncate font-mono text-gray-600" title={b.name}>{b.name}</span>
                <a
                  href={`/api/history-backup?name=${encodeURIComponent(b.name)}`}
                  download={b.name}
                  className="ml-auto text-brand-600 hover:underline"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => confirmDelete(b.name, format(new Date(b.createdAt), clockPattern('MMM d, yyyy HH:mm')))}
                  disabled={remove.isPending}
                  className="text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
