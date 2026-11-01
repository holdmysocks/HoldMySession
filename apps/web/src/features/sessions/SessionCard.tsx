import { useState, useRef, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import type { SessionSummary } from '@/lib/parsers/types'
import type { SessionStatus } from '@/lib/status/session-status'
import { formatAgo, formatDuration, formatTokenCount } from '@/lib/utils/format'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { STATUS_PULSE } from '@/components/ui/session-status-style'
import { describeWaiting } from '@/lib/map/waiting'
import { StatusBadge } from './StatusBadge'
import { RunningTimer } from './RunningTimer'

/** The columns of a session row, shared with the list's header so they line up. */
export const SESSION_COLUMNS = 'md:grid md:grid-cols-[110px_minmax(0,1fr)_150px_70px_80px_90px_100px] md:items-center md:gap-x-5'

/** One session as a ruled row. A session of another machine shows where it ran. A session waiting on the user is outlined in amber. */
export function SessionCard({
  session,
  status,
  now,
}: {
  session: SessionSummary & { machine?: { id: string; name: string } | null; hasOpenQuestion?: boolean; notification?: { message: string | null; type: string | null } | null }
  status: SessionStatus
  now: number
}) {
  const { privacyMode, anonymizeProjectName, anonymizeBranch, anonymizeSessionName } = usePrivacy()
  const projectLabel = privacyMode ? anonymizeProjectName(session.projectDisplayName) : session.projectDisplayName
  const nameLabel = session.sessionName ? (privacyMode ? anonymizeSessionName(session.sessionName) : session.sessionName) : null
  const displayBranch = session.branch ? anonymizeBranch(session.branch) : null
  const waiting = status === 'needs-you'
  const waitingText = session.hasOpenQuestion
    ? 'Asked you a question'
    : describeWaiting({ notification: session.notification }).text

  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: session.sessionId }}
      search={{ project: session.projectKey, machine: session.machine?.id }}
      className={`group block gap-y-2 border-b border-[color:var(--hms-rule)] px-3.5 py-4 transition-colors hover:bg-[color:var(--hms-track)] ${SESSION_COLUMNS} ${
        waiting ? 'status-pulse-needs-you rounded-2xl border border-yellow-400 bg-yellow-400/10' : ''
      } ${STATUS_PULSE[status] && !waiting ? STATUS_PULSE[status] : ''}`}
      data-status={status}
      data-machine={session.machine?.id}
    >
      <span className="mb-2 flex items-center justify-between md:mb-0 md:block">
        <StatusBadge status={status} />
        <span className="text-xs text-[color:var(--hms-mute)] md:hidden">{formatAgo(session.lastActiveAt, now)}</span>
      </span>

      <span className="min-w-0">
        <h3 className={`truncate font-display text-[17px] font-semibold ${nameLabel ? '' : 'italic text-[color:var(--hms-mute)]'}`}>
          {nameLabel ?? 'Untitled session'}
        </h3>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[color:var(--hms-mute)]">
          <p className="truncate">{projectLabel}</p>
          {displayBranch && <span className="font-mono">{displayBranch}</span>}
          <SessionIdCopyRow sessionId={session.sessionId} />
          {session.machine && (
            <span className="rounded-full border border-[color:var(--hms-line)] px-2 py-px text-[11px] text-[color:var(--hms-sub)]" title="Ran on this machine">
              {session.machine.name}
            </span>
          )}
          {session.sourceLabel && <SourceBadge sourceLabel={session.sourceLabel} platform={session.sourcePlatform} />}
        </span>
        {waiting && (
          <span className="mt-1 block text-xs text-yellow-400">
            {waitingText} · waiting {formatDuration(Math.max(0, now - new Date(session.lastActiveAt).getTime()))}
          </span>
        )}
      </span>

      <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--hms-mute)] md:contents">
        <span className="truncate text-[13px] md:text-sm" title="Model">
          {session.model ? session.model.replace(/^claude-/, '').split('-202')[0] : ''}
        </span>
        <span className="md:text-right md:text-[15px] md:text-[color:var(--hms-ink)]" title="Messages">
          {session.messageCount}<span className="md:hidden"> msgs</span>
        </span>
        <span className="md:text-right md:text-[15px] md:text-[color:var(--hms-ink)]" title="Tokens">
          {formatTokenCount(session.uniqueOutputTokens ?? session.outputTokens ?? 0)}<span className="md:hidden"> tokens</span>
        </span>
        <span className="md:text-right md:text-[15px] md:text-[color:var(--hms-ink)]" title="Duration">
          {session.isActive ? <RunningTimer startedAt={session.startedAt} /> : formatDuration(session.durationMs)}
        </span>
        <span className="hidden md:block md:text-right md:text-[15px]" title="Last active">{formatAgo(session.lastActiveAt, now)}</span>
      </span>
    </Link>
  )
}

function SessionIdCopyRow({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(`claude --resume ${sessionId}`)
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable: silently fail
    }
  }

  return (
    <span className="group/id flex items-center gap-1.5">
      <span className="truncate font-mono">{sessionId.slice(0, 8)}</span>
      <button
        type="button"
        onClick={handleCopy}
        className="rounded px-1 py-0.5 text-[10px] opacity-0 transition-opacity hover:text-gray-100 group-hover/id:opacity-100 group-hover:opacity-100"
        title="Copy resume command"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </span>
  )
}
