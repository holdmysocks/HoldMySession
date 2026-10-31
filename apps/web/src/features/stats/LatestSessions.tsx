import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { paginatedSessionListQuery } from '@/features/sessions/sessions.queries'
import { deriveSessionStatus, type SessionStatus } from '@/lib/status/session-status'
import { formatAgo, formatTokenCount } from '@/lib/utils/format'
import { useNow } from '@/features/sessions/useNow'
import { usePrivacy } from '@/features/privacy/PrivacyContext'

const TAG: Record<SessionStatus, { word: string; style: React.CSSProperties }> = {
  'needs-you': { word: 'NEEDS YOU', style: { background: '#5C4A0E', color: '#FACC15' } },
  active: { word: 'RUNNING', style: { background: '#1F7A4D', color: '#C9F7DD' } },
  completed: { word: 'DONE', style: { background: '#3B3380', color: '#CFC8FF' } },
  idle: { word: 'IDLE', style: { background: 'var(--hms-track)', color: 'var(--hms-sub)' } },
}

/** The newest sessions of one project, and a link to all of them. */
export function LatestSessions({ projectName, machineId }: { projectName: string; machineId?: string }) {
  const { privacyMode, anonymizeSessionName } = usePrivacy()
  const { data } = useQuery(
    paginatedSessionListQuery({ page: 1, pageSize: 5, search: '', status: 'all', project: projectName, sort: 'lastActive', sortDir: 'desc', machineId }),
  )
  const total = data?.totalCount ?? 0
  const now = useNow()
  return (
    <section aria-label="Sessions in this project" className="border-t border-[color:var(--hms-rule)] pt-7">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="font-display text-xl font-semibold">Latest sessions</h2>
        <Link
          to="/sessions"
          search={{ project: projectName, page: 1, pageSize: 5, search: '', status: 'all', sort: 'lastActive', sortDir: 'desc' }}
          className="text-[13px] font-semibold text-brand-400"
        >
          All {total} sessions →
        </Link>
      </div>
      {(data?.sessions ?? []).map((s) => {
        const status = deriveSessionStatus(
          { isActive: s.isActive, lastActiveAt: s.lastActiveAt, lastStopReason: s.lastStopReason, lastNotificationAt: s.lastNotificationAt, hasOpenQuestion: s.hasOpenQuestion },
          now,
        )
        const tag = TAG[status]
        const title = s.sessionName ? (privacyMode ? anonymizeSessionName(s.sessionName) : s.sessionName) : 'Untitled session'
        const model = s.model ? s.model.replace(/^claude-/, '').split('-202')[0] : ''
        return (
          <Link
            key={s.sessionId}
            to="/sessions/$sessionId"
            params={{ sessionId: s.sessionId }}
            search={{ project: s.projectKey, machine: s.machine?.id }}
            className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-[color:var(--hms-rule)] py-4"
          >
            <span className="min-w-0 flex-[1_1_240px]">
              <b className="font-display text-[17px] font-semibold">{title}</b>
              <span className="block text-xs text-[color:var(--hms-mute)]">{[model, s.branch].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="rounded-full px-3 py-[3px] text-[11px] font-bold tracking-wide" style={tag.style}>{tag.word}</span>
            <span className="w-20 text-right tabular-nums">{formatTokenCount(s.uniqueOutputTokens ?? s.outputTokens ?? 0)}</span>
            <span className="w-[100px] text-right text-[color:var(--hms-mute)]">{formatAgo(s.lastActiveAt, now)}</span>
          </Link>
        )
      })}
    </section>
  )
}
