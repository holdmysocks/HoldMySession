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
    <section aria-label="Backups" className="mt-2">
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 className="font-display text-[22px] font-semibold">Backups</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} disabled={restore.isPending} className="min-h-11 rounded-full border border-[color:var(--hms-line)] bg-transparent px-[18px] text-sm font-medium text-gray-100 hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-50">
            {restore.isPending ? 'Restoring…' : 'Restore from file…'}
          </button>
          <button type="button" onClick={() => backUp.mutate()} disabled={backUp.isPending} className="min-h-11 rounded-full bg-brand-400 px-5 text-sm font-semibold text-gray-950 hover:bg-brand-300 disabled:cursor-not-allowed disabled:opacity-50">
            {backUp.isPending ? 'Saving…' : 'Back up now'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".db,application/octet-stream"
            className="hidden"
            aria-label="Backup file to restore"
            onChange={(e) => choose(e.target.files?.[0])}
          />
        </div>
      </div>
      <p className="mt-1 text-[13px] text-[color:var(--hms-mute)]">
        The newest 10 backups are kept. A restore keeps this machine's identity from the backup, so a copied database carries on as the same machine.
      </p>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${message.ok ? 'text-[color:var(--hms-chip-ink)]' : 'text-red-400'}`}>
          {message.text}
        </p>
      )}
      {backups.length === 0 ? (
        <p className="border-b border-[color:var(--hms-rule)] py-4 text-sm text-[color:var(--hms-mute)]">No backups yet.</p>
      ) : (
        backups.map((b) => {
          const when = format(new Date(b.createdAt), clockPattern('MMM d, HH:mm'))
          return (
            <div key={b.name} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]">
              <div className="min-w-0">
                <div className="truncate font-semibold" title={b.name}>{b.name}</div>
                <div className="text-[13px] text-[color:var(--hms-mute)]">{when} · {size(b.sizeBytes)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={`/api/history-backup?name=${encodeURIComponent(b.name)}`} download={b.name} className="inline-flex min-h-11 rounded-full border border-[color:var(--hms-line)] bg-transparent px-[18px] text-sm font-medium text-gray-100 hover:border-gray-500 items-center">
                  Download
                </a>
                <button type="button" onClick={() => confirmDelete(b.name, format(new Date(b.createdAt), clockPattern('MMM d, yyyy HH:mm')))} disabled={remove.isPending} className="min-h-11 rounded-full border border-[#E5645455] bg-transparent px-[18px] text-sm font-medium text-[#E56454] hover:border-[#E56454] disabled:opacity-50">
                  Delete
                </button>
              </div>
            </div>
          )
        })
      )}
    </section>
  )
}
