import { Link } from '@tanstack/react-router'
import type { MapNode } from '@/lib/map/project-map'
import { formatDateTime, formatDuration, formatTokenCount } from '@/lib/utils/format'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { PanelShell } from './PanelShell'
import { kindLabel, shortModelName, statusLabel } from './format-node'

export function NodeDetailPanel({
  node,
  projectPath,
}: {
  node: MapNode | null
  projectPath: string
}) {
  const { privacyMode, anonymizeBranch } = usePrivacy()

  if (!node) {
    return (
      <PanelShell title="Details">
        <p className="text-sm text-gray-500">Select a session or subagent on the map.</p>
      </PanelShell>
    )
  }

  const isSession = node.kind === 'session'
  const heading = isSession && privacyMode ? anonymizeBranch(node.title) : node.title
  const model = shortModelName(node.model)

  return (
    <PanelShell title="Details">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">{kindLabel(node)}</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-gray-100">{heading}</p>
        <p className="mt-0.5 text-xs text-gray-400">
          {statusLabel(node.status)}
          {node.needsYou && <span className="text-brand-300"> · needs you</span>}
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Stat
          label={isSession ? 'Tokens (with subagents)' : 'Tokens'}
          value={formatTokenCount(node.tokens)}
        />
        <Stat label="Duration" value={node.durationMs !== null ? formatDuration(node.durationMs) : '-'} />
        <Stat label="Tool calls" value={node.toolCalls !== null ? String(node.toolCalls) : '-'} />
        <Stat label="Model" value={model ?? '-'} mono />
        <div className="col-span-2">
          <Stat
            label={isSession ? 'Last active' : 'Dispatched'}
            value={node.timestamp ? formatDateTime(node.timestamp) : '-'}
          />
        </div>
      </dl>

      {node.pendingQuestions.length > 0 && (
        <div className="mt-4 border-t border-gray-800 pt-3">
          <p className="text-xs font-medium text-gray-400">Open questions</p>
          <ul className="mt-2 space-y-3">
            {node.pendingQuestions.flatMap((pending) =>
              pending.questions.map((q, i) => (
                <li key={`${pending.toolUseId}-${i}`}>
                  {q.header && <p className="text-xs text-brand-300">{q.header}</p>}
                  <p className="text-sm text-gray-200">{q.question || 'Question text unavailable'}</p>
                </li>
              )),
            )}
          </ul>
        </div>
      )}

      {isSession && (
        <Link
          to="/sessions/$sessionId"
          params={{ sessionId: node.sessionId }}
          search={{ project: projectPath }}
          className="mt-4 inline-block text-sm text-brand-300 hover:underline"
        >
          Open session
        </Link>
      )}
    </PanelShell>
  )
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`truncate text-gray-100 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
