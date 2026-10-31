import type { PositionedNode } from '@/lib/map/layout'
import type { MapNodeStatus } from '@/lib/map/project-map'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { shortModelName, truncateLabel } from './format-node'

const LOOK: Record<MapNodeStatus, { bg: string; edge: string; dot: string; ink: string; sub: string; word: string; badge: string; badgeInk: string }> = {
  active: { bg: 'linear-gradient(160deg,#0F4A2C,#0A2D1B)', edge: '#3DDC84', dot: '#3DDC84', ink: '#EAFFF2', sub: '#8BE8B4', word: 'RUNNING', badge: '#3DDC84', badgeInk: '#04210F' },
  running: { bg: 'linear-gradient(160deg,#0F4A2C,#0A2D1B)', edge: '#3DDC84', dot: '#3DDC84', ink: '#EAFFF2', sub: '#8BE8B4', word: 'RUNNING', badge: '#3DDC84', badgeInk: '#04210F' },
  'needs-you': { bg: 'linear-gradient(160deg,#FFD25A,#F5A623)', edge: '#FFE9A8', dot: '#2A1B00', ink: '#241600', sub: '#4A3200', word: 'NEEDS YOU', badge: '#241600', badgeInk: '#FFD25A' },
  completed: { bg: 'linear-gradient(160deg,#2B2466,#1A1640)', edge: '#9B8CFF', dot: '#9B8CFF', ink: '#F1EFFF', sub: '#B9B0FF', word: 'DONE', badge: '#9B8CFF', badgeInk: '#17123F' },
  idle: { bg: '#1D1C1A', edge: '#ffffff2a', dot: '#8F8D85', ink: '#FAF9F5', sub: '#A8A69C', word: 'IDLE', badge: '#ffffff1c', badgeInk: '#C9C7BE' },
}

/** The map as a list for a phone: each session a card, its subagents and forks indented under it. */
export function MapTree({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: PositionedNode[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { privacyMode, anonymizeSessionName } = usePrivacy()
  const children = new Map<string | null, PositionedNode[]>()
  const ids = new Set(nodes.map((n) => n.id))
  for (const n of nodes) {
    const key = n.parentId && ids.has(n.parentId) ? n.parentId : null
    children.set(key, [...(children.get(key) ?? []), n])
  }
  const rows: Array<{ node: PositionedNode; depth: number }> = []
  const walk = (parent: string | null, depth: number) => {
    for (const n of children.get(parent) ?? []) {
      rows.push({ node: n, depth })
      walk(n.id, depth + 1)
    }
  }
  walk(null, 0)

  return (
    <div className="flex flex-col gap-2.5 p-3">
      {rows.map(({ node, depth }) => {
        const look = LOOK[node.status]
        const isSession = node.kind === 'session'
        const title = isSession && privacyMode ? anonymizeSessionName(node.title) : node.title
        const meta = isSession
          ? [node.subtitle.split('·')[1]?.trim(), shortModelName(node.model)].filter(Boolean).join(' · ')
          : truncateLabel(node.subtitle, 40)
        return (
          <button
            key={node.id}
            type="button"
            onClick={() => onSelect(node.id)}
            aria-pressed={selectedId === node.id}
            className="rounded-[22px] px-4 py-3 text-left"
            style={{
              marginLeft: depth * 16,
              background: look.bg,
              color: look.ink,
              border: `${node.status === 'needs-you' ? 3 : 2}px solid ${look.edge}`,
              outline: selectedId === node.id ? '3px solid var(--hms-ink)' : undefined,
              outlineOffset: selectedId === node.id ? 4 : undefined,
            }}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 font-display font-semibold">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: look.dot, boxShadow: `0 0 8px ${look.dot}` }} />
                <span className="truncate">{title}</span>
              </span>
              {isSession && (
                <span className="flex-none rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.06em]" style={{ background: look.badge, color: look.badgeInk }}>
                  {look.word}
                </span>
              )}
            </span>
            <span className="mt-1 block text-xs" style={{ color: look.sub }}>
              {meta}
            </span>
          </button>
        )
      })}
    </div>
  )
}
