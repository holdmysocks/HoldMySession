import type { MapNode } from '@/lib/map/project-map'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { useNow } from '@/features/sessions/useNow'
import { formatDuration } from '@/lib/utils/format'
import { WAITING_TAG } from '@/lib/map/waiting'

/** The tag for what a session waits for: a question, a permission, a plan, or just a wait. */
export function askKind(node: MapNode): string {
  return WAITING_TAG[node.waiting?.kind ?? 'other']
}

/** The sessions that wait on the user, longest wait first. */
export function waitingNodes(nodes: MapNode[]): MapNode[] {
  return nodes
    .filter((n) => n.kind === 'session' && n.needsYou)
    .sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''))
}

export function KindTag({ kind }: { kind: string }) {
  return (
    <span className="flex-none rounded-full bg-[#FFC83D] px-2.5 py-[3px] text-[10px] font-bold tracking-[0.06em] text-[#241600]">{kind}</span>
  )
}

export function waitingFor(node: MapNode, now: number): string {
  const since = node.timestamp ? Math.max(0, now - new Date(node.timestamp).getTime()) : 0
  return `waiting ${since < 60_000 ? `${Math.max(1, Math.round(since / 1000))}s` : formatDuration(since).replace(/ \d+s$/, '')}`
}

export function NeedsYouPanel({
  nodes,
  onSelect,
  selectedId,
}: {
  nodes: MapNode[]
  onSelect: (nodeId: string) => void
  selectedId?: string | null
}) {
  const { privacyMode, anonymizeSessionName } = usePrivacy()
  const now = useNow()
  const waiting = waitingNodes(nodes)

  return (
    <section aria-label="Needs you" className="min-w-0 flex-[1.15_1_420px]">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2 className="m-0 font-display text-2xl font-bold" style={{ color: waiting.length > 0 ? '#FFC83D' : undefined }}>
          {waiting.length > 0 ? `${waiting.length} need you` : 'Needs you'}
        </h2>
        {waiting.length > 0 && <span className="text-[13px] text-[color:var(--hms-mute)]">longest wait first</span>}
      </div>
      {waiting.length === 0 ? (
        <p className="text-sm text-[color:var(--hms-mute)]">Nothing is waiting on you.</p>
      ) : (
        waiting.map((node) => {
          const title = privacyMode ? anonymizeSessionName(node.title) : node.title
          const picked = selectedId === node.id
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect(node.id)}
              aria-pressed={picked}
              className={`mt-1.5 flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px] px-4 py-3.5 text-left ${
                picked ? 'border-2 border-[color:var(--hms-ink)] bg-[#FFC83D1f]' : 'border border-[#FFC83D40]'
              }`}
            >
              <KindTag kind={askKind(node)} />
              <span className="min-w-0 flex-[1_1_200px]">
                <b className="block truncate font-display text-lg">{title}</b>
                <span className="block text-[13px] text-[#C9B27A]">
                  {node.waiting?.text ?? 'Waiting on you'} · {waitingFor(node, now)}
                </span>
              </span>
              <span
                className="inline-flex min-h-11 items-center rounded-full px-[18px] font-semibold"
                style={picked ? { background: 'var(--hms-ink)', color: 'var(--hms-bg)' } : { border: '2px solid #FFC83D', color: '#FFD25A' }}
              >
                {picked ? 'Selected' : 'Select'}
              </span>
            </button>
          )
        })
      )}
    </section>
  )
}
