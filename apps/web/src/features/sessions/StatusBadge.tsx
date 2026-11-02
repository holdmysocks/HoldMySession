import type { SessionStatus } from '@/lib/status/session-status'

/** The status words and their colours, the same four the map uses. */
const TAG: Record<SessionStatus, { label: string; style: React.CSSProperties }> = {
  'needs-you': { label: 'NEEDS YOU', style: { background: '#FACC15', color: '#3A2C00' } },
  active: { label: 'RUNNING', style: { background: '#3DDC84', color: '#05301A' } },
  completed: { label: 'DONE', style: { background: '#9B8CFF', color: '#17123F' } },
  idle: { label: 'IDLE', style: { background: 'var(--hms-track)', color: 'var(--hms-sub)' } },
}

/** The colour of the glowing dot beside the word. Idle sessions have none: nothing is happening. */
const DOT: Partial<Record<SessionStatus, string>> = {
  'needs-you': '#FACC15',
  active: '#3DDC84',
  completed: '#9B8CFF',
}

/** The status word, and a small glowing circle beside it for a session that is running, waiting or done. Running and waiting ones breathe. */
export function StatusBadge({ status }: { status: SessionStatus }) {
  const tag = TAG[status]
  const dot = DOT[status]
  return (
    <span className="inline-flex items-center gap-2">
      {dot && (
        <span
          aria-hidden="true"
          data-status-dot={status}
          className="h-2.5 w-2.5 flex-none rounded-full"
          style={{
            background: dot,
            boxShadow: `0 0 10px ${dot}, 0 0 3px ${dot}`,
            animation: status === 'completed' ? undefined : 'runPulse 1.6s ease-in-out infinite',
          }}
        />
      )}
      <span
        data-status-tag={status}
        className="inline-block rounded-full px-3 py-[3px] text-[11px] font-bold tracking-[0.04em]"
        style={tag.style}
      >
        {tag.label}
      </span>
    </span>
  )
}
