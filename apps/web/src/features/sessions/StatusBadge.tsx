import type { SessionStatus } from '@/lib/status/session-status'

const BADGE: Record<SessionStatus, { label: string; pill: string; dot: string; ping: boolean }> = {
  'needs-you': {
    label: 'Needs you',
    pill: 'bg-yellow-400/15 text-yellow-300',
    dot: 'bg-yellow-400',
    ping: true,
  },
  active: {
    label: 'Active',
    pill: 'bg-emerald-500/15 text-emerald-400',
    dot: 'bg-emerald-500',
    ping: true,
  },
  completed: {
    label: 'Completed',
    pill: 'bg-indigo-400/15 text-indigo-300',
    dot: 'bg-indigo-400',
    ping: false,
  },
  idle: {
    label: 'Idle',
    pill: 'bg-gray-500/15 text-gray-400',
    dot: 'bg-gray-500',
    ping: false,
  },
}

/** Status pill. The ping on active and needs-you uses motion-safe, so it stops under reduced motion. */
export function StatusBadge({ status }: { status: SessionStatus }) {
  const style = BADGE[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.pill}`}
    >
      <span className="relative flex h-2 w-2">
        {style.ping && (
          <span
            className={`motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${style.dot}`}
          />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${style.dot}`} />
      </span>
      {style.label}
    </span>
  )
}
