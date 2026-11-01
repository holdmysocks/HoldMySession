import { Link } from '@tanstack/react-router'
import type { MapNode } from '@/lib/map/project-map'
import { formatDateTime, formatDuration, formatTokenCount } from '@/lib/utils/format'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { useNow } from '@/features/sessions/useNow'
import { kindLabel, shortModelName, statusLabel } from './format-node'
import { askKind, KindTag, waitingFor } from './NeedsYouPanel'

/** The card for the session or subagent picked on the map. One that waits on the user is ringed in white, with a way to the next one. */
export function NodeDetailPanel({
  node,
  projectKey,
  machineId,
  onNext,
}: {
  node: MapNode | null
  projectKey: string
  /** The node the map belongs to, when this master is showing another machine's map. */
  machineId?: string
  /** Picks the next session that waits on the user. Left out when there is none. */
  onNext?: () => void
}) {
  const { privacyMode, anonymizeSessionName, anonymizeProjectName, anonymizeBranch } = usePrivacy()
  const now = useNow()

  if (!node) {
    return (
      <section aria-label="Selected session" className="flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-[28px] border border-[color:var(--hms-line)] bg-gray-900 px-6 py-[22px]">
        <p className="text-sm text-[color:var(--hms-mute)]">Select a session or subagent on the map.</p>
      </section>
    )
  }

  const isSession = node.kind === 'session'
  const heading = isSession && privacyMode ? anonymizeSessionName(node.title) : node.title
  const project =
    isSession && node.projectDisplayName ? (privacyMode ? anonymizeProjectName(node.projectDisplayName) : node.projectDisplayName) : null
  const branch = isSession && node.branch ? (privacyMode ? anonymizeBranch(node.branch) : node.branch) : null
  const model = shortModelName(node.model)
  const messages = node.subtitle.split('·')[1]?.replace('msgs', '').trim()

  return (
    <section
      aria-label="Selected session"
      className={`flex min-w-0 flex-[1_1_340px] flex-col gap-4 rounded-[28px] bg-gray-900 px-6 py-[22px] ${
        node.needsYou ? 'border-2 border-[color:var(--hms-ink)]' : 'border border-[color:var(--hms-line)]'
      }`}
    >
      <div>
        <div className="flex items-center gap-2 text-xs text-[color:var(--hms-mute)]">
          {node.needsYou && <KindTag kind={askKind(node)} />}
          {node.needsYou ? 'Selected' : kindLabel(node)}
        </div>
        <div className="mt-2 font-display text-[26px] font-bold leading-[1.15]">{heading}</div>
        {project && <p className="mt-0.5 truncate text-xs text-[color:var(--hms-mute)]">{project}</p>}
        {!isSession && node.subtitle && <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--hms-mute)]">{node.subtitle}</p>}
        <div className={`mt-1.5 text-sm ${node.needsYou ? 'text-[#FFD25A]' : 'text-[color:var(--hms-mute)]'}`}>
          {node.needsYou ? `${node.waiting?.text ?? 'Waiting on you'} · ${waitingFor(node, now)}` : statusLabel(node.status)}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-[color:var(--hms-rule)] pt-4">
        {isSession && messages && <Stat label="Messages" value={messages} />}
        <Stat label={isSession ? 'Tokens (with subagents)' : 'Tokens'} value={formatTokenCount(node.tokens)} />
        <Stat label="Model" value={model ?? '-'} />
        {branch ? <Stat label="Branch" value={branch} /> : <Stat label="Duration" value={node.durationMs !== null ? formatDuration(node.durationMs) : '-'} />}
        {node.toolCalls !== null && <Stat label="Tool calls" value={String(node.toolCalls)} />}
        <Stat label={isSession ? 'Last active' : 'Dispatched'} value={node.timestamp ? formatDateTime(node.timestamp) : '-'} />
      </dl>

      {node.pendingQuestions.length > 1 && (
        <ul className="space-y-3 border-t border-[color:var(--hms-rule)] pt-3">
          {node.pendingQuestions.flatMap((pending) =>
            pending.questions.map((q, i) => (
              <li key={`${pending.toolUseId}-${i}`}>
                {q.header && <p className="text-xs text-brand-300">{q.header}</p>}
                <p className="text-sm">{q.question || 'Question text unavailable'}</p>
              </li>
            )),
          )}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap gap-2">
        {isSession && (
          <Link
            to="/sessions/$sessionId"
            params={{ sessionId: node.sessionId }}
            search={{ project: projectKey, machine: machineId }}
            className="inline-flex min-h-11 items-center rounded-full bg-brand-400 px-[22px] font-semibold text-gray-950 hover:bg-brand-300"
          >
            Open session
          </Link>
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            className="inline-flex min-h-11 items-center rounded-full border border-[color:var(--hms-line)] px-[18px] font-medium hover:border-gray-500"
          >
            Next one →
          </button>
        )}
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[color:var(--hms-mute)]">{label}</dt>
      <dd className="mt-0.5 truncate font-display text-[22px] font-bold leading-tight">{value}</dd>
    </div>
  )
}
