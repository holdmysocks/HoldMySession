import type { SessionStatus } from '@/lib/status/session-status'

/** The status words and their colours, the same four the map uses. */
const TAG: Record<SessionStatus, { label: string; style: React.CSSProperties }> = {
  'needs-you': { label: 'NEEDS YOU', style: { background: '#FACC15', color: '#3A2C00' } },
  active: { label: 'RUNNING', style: { background: '#3DDC84', color: '#05301A' } },
  completed: { label: 'DONE', style: { background: '#9B8CFF', color: '#17123F' } },
  idle: { label: 'IDLE', style: { background: 'var(--hms-track)', color: 'var(--hms-sub)' } },
}

export function StatusBadge({ status }: { status: SessionStatus }) {
  const tag = TAG[status]
  return (
    <span
      data-status-tag={status}
      className="inline-block rounded-full px-3 py-[3px] text-[11px] font-bold tracking-[0.04em]"
      style={tag.style}
    >
      {tag.label}
    </span>
  )
}
