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
    case 'done':
      return 'Done'
    case 'unknown':
      return 'Unknown'
  }
}

export function kindLabel(node: Pick<MapNode, 'kind'>): string {
  return node.kind === 'session' ? 'Session' : 'Subagent'
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
