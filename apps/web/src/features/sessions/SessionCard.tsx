import { useState, useRef, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import type { SessionSummary } from '@/lib/parsers/types'
import type { SessionStatus } from '@/lib/status/session-status'
import { formatDuration, formatRelativeTime, formatBytes } from '@/lib/utils/format'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { STATUS_BORDER, STATUS_PULSE } from '@/components/ui/session-status-style'
import { StatusBadge } from './StatusBadge'
import { RunningTimer } from './RunningTimer'

/** A session of another machine has no transcript here, so its card is not a link and shows where it ran. */
export function SessionCard({
  session,
  status,
}: {
  session: SessionSummary & { machine?: { id: string; name: string } | null }
  status: SessionStatus
}) {
  const { privacyMode, anonymizePath, anonymizeProjectName, anonymizeBranch, anonymizeSessionName } =
    usePrivacy()
  const projectLabel = privacyMode
    ? anonymizeProjectName(session.projectDisplayName)
    : session.projectDisplayName
  const nameLabel = session.sessionName
    ? privacyMode
      ? anonymizeSessionName(session.sessionName)
      : session.sessionName
    : null
  const displayCwd = session.cwd
    ? anonymizePath(session.cwd, session.projectDisplayName)
    : null
  const displayBranch = session.branch ? anonymizeBranch(session.branch) : null

  const cardClass = `group block rounded-xl border-2 bg-gray-900/50 p-4 transition-all hover:bg-gray-900 ${STATUS_BORDER[status]} ${STATUS_PULSE[status]}`

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              className={`truncate text-sm font-semibold ${nameLabel ? 'text-gray-100' : 'italic text-gray-500'}`}
            >
              {nameLabel ?? 'Untitled session'}
            </h3>
            <StatusBadge status={status} />
            {session.machine && (
              <span className="shrink-0 rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-300" title="Ran on this machine">
                {session.machine.name}
              </span>
            )}
            {session.sourceLabel && (
              <SourceBadge sourceLabel={session.sourceLabel} platform={session.sourcePlatform} />
            )}
          </div>

          <p className="mt-1 truncate text-sm text-gray-400">{projectLabel}</p>

          {displayBranch && (
            <p className="mt-0.5 truncate text-xs text-gray-500">
              <span className="font-mono">{displayBranch}</span>
            </p>
          )}

          <SessionIdCopyRow sessionId={session.sessionId} />
        </div>

        <span className="shrink-0 text-xs text-gray-500">
          {formatRelativeTime(session.lastActiveAt)}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
        <span title="Duration">
          {session.isActive ? (
            <RunningTimer startedAt={session.startedAt} />
          ) : (
            formatDuration(session.durationMs)
          )}
        </span>
        <span title="Messages">{session.messageCount} msgs</span>
        {session.toolCallCount > 0 && (
          <span title="Tool calls">{session.toolCallCount} tools</span>
        )}
        {session.model && (
          <span title="Model" className="truncate font-mono text-gray-500">
            {session.model.replace(/^claude-/, '').split('-202')[0]}
          </span>
        )}
        {!session.machine && (
          <span title="File size" className="text-gray-500">
            {formatBytes(session.fileSizeBytes)}
          </span>
        )}
      </div>

      {displayCwd && (
        <p className="mt-2 truncate text-xs font-mono text-gray-600">
          {displayCwd}
        </p>
      )}
    </>
  )

  if (session.machine) {
    return (
      <div className={cardClass} data-status={status} data-machine={session.machine.id}>
        {body}
      </div>
    )
  }

  return (
    <Link
      to="/sessions/$sessionId"
      params={{ sessionId: session.sessionId }}
      search={{ project: session.projectKey }}
      className={cardClass}
      data-status={status}
    >
      {body}
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
      // Clipboard API unavailable — silently fail
    }
  }

  return (
    <div className="group/id mt-1 flex items-center gap-1.5">
      <span className="truncate text-xs text-gray-500 font-mono">
        {sessionId.slice(0, 8)}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="rounded px-1 py-0.5 text-[10px] text-gray-600 opacity-0 transition-opacity hover:bg-gray-800 hover:text-gray-300 group-hover/id:opacity-100 group-hover:opacity-100"
        title="Copy resume command"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}
