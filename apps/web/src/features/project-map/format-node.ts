import type { MapNode, MapNodeStatus } from '@/lib/map/project-map'

export function statusLabel(status: MapNodeStatus): string {
  switch (status) {
    case 'needs-you':
      return 'Needs you'
    case 'active':
      return 'Active'
    case 'completed':
      return 'Completed'
    case 'idle':
      return 'Idle'
    case 'running':
      return 'Running'
  }
}

/** "1 expired subagent hidden", "3 expired subagents hidden". Used by the map label and info line. */
export function expiredSubagentsLabel(count: number): string {
  return `${count} expired subagent${count === 1 ? '' : 's'} hidden`
}

export function kindLabel(node: Pick<MapNode, 'kind' | 'isFork'>): string {
  if (node.kind === 'subagent') return 'Subagent'
  return node.isFork ? 'Forked session' : 'Session'
}

/** claude-example-1 -> example-1, claude-example-2-20250101 -> example-2. Matches SessionCard. */
export function shortModelName(model: string | null): string | null {
  if (!model) return null
  return model.replace(/^claude-/, '').split('-202')[0]
}

/** Cut a label to `max` characters with an ellipsis, for fixed-width SVG text. */
export function truncateLabel(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}…`
}
