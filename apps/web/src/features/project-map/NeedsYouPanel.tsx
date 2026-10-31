import type { MapNode } from '@/lib/map/project-map'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { PanelShell } from './PanelShell'
import { truncateLabel } from './format-node'

export function NeedsYouPanel({
  nodes,
  onSelect,
}: {
  nodes: MapNode[]
  onSelect: (nodeId: string) => void
}) {
  const { privacyMode, anonymizeSessionName } = usePrivacy()
  const waiting = nodes.filter((n) => n.kind === 'session' && n.needsYou)

  return (
    <PanelShell title="Needs you" count={waiting.length}>
      {waiting.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing is waiting on you.</p>
      ) : (
        <ul className="space-y-2">
          {waiting.map((node) => {
            const title = privacyMode ? anonymizeSessionName(node.title) : node.title
            const question = node.pendingQuestions[0]?.questions[0]
            return (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => onSelect(node.id)}
                  className="w-full rounded-xl border border-gray-800 px-3 py-2 text-left transition-colors hover:border-brand-500/60 hover:bg-gray-900"
                >
                  <span className="block truncate text-sm font-medium text-gray-100">{title}</span>
                  {question ? (
                    <span className="mt-1 block text-xs text-gray-300">
                      {truncateLabel(question.question, 160)}
                    </span>
                  ) : (
                    <span className="mt-1 block text-xs text-gray-400">Notification since last write</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-gray-600">
        Permission prompts are not written to transcripts, so they only appear here when a Notification hook is set up.
      </p>
    </PanelShell>
  )
}
