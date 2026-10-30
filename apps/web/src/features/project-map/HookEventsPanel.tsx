import type { HookEvent } from '@/lib/events/event-inbox'
import { formatRelativeTime } from '@/lib/utils/format'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { PanelShell } from './PanelShell'
import { truncateLabel } from './format-node'

export function HookEventsPanel({ events }: { events: HookEvent[] | undefined }) {
  const { privacyMode, anonymizeProjectName } = usePrivacy()
  const list = events ?? []

  return (
    <PanelShell title="Recent hook events" count={list.length}>
      {list.length === 0 ? (
        <div className="space-y-2 text-sm text-gray-500">
          <p>No hook events yet.</p>
          <p>
            Run <code className="font-mono text-xs text-gray-300">holdmysession --print-hook-config</code> to
            get a snippet for <code className="font-mono text-xs text-gray-300">settings.json</code> in your Claude config directory.
          </p>
        </div>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {list.map((event, index) => {
            const folder = event.cwd ? event.cwd.split(/[\\/]/).filter(Boolean).pop() ?? null : null
            const folderLabel = folder && privacyMode ? anonymizeProjectName(folder) : folder
            return (
              <li
                key={`${event.ts}-${event.sessionId}-${index}`}
                className="rounded-lg border border-gray-800 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className={
                      event.event === 'Notification'
                        ? 'font-medium text-brand-300'
                        : 'font-medium text-gray-300'
                    }
                  >
                    {event.event}
                    {event.notificationType && (
                      <span className="font-normal text-gray-500"> · {event.notificationType}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-gray-500" title={event.ts}>
                    {Number.isNaN(Date.parse(event.ts)) ? event.ts : formatRelativeTime(event.ts)}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[11px] text-gray-500">
                  {event.sessionId.slice(0, 8)}
                  {folderLabel && <span className="text-gray-600"> · {folderLabel}</span>}
                </p>
                {event.message && (
                  <p className="mt-1 text-xs text-gray-300">{truncateLabel(event.message, 200)}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </PanelShell>
  )
}
