import type { KeyboardEvent } from 'react'
import type { PositionedEdge, PositionedNode, ProjectLayout } from '@/lib/map/layout'
import type { MapNodeStatus } from '@/lib/map/project-map'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { shortModelName, statusLabel, truncateLabel } from './format-node'

interface MapCanvasProps {
  layout: ProjectLayout
  selectedId: string | null
  onSelect: (nodeId: string) => void
}

const STATUS_CLASSES: Record<MapNodeStatus, { stroke: string; dot: string }> = {
  active: { stroke: 'stroke-green-500', dot: 'fill-green-400' },
  idle: { stroke: 'stroke-gray-600', dot: 'fill-gray-500' },
  done: { stroke: 'stroke-blue-500', dot: 'fill-blue-400' },
  unknown: { stroke: 'stroke-gray-600', dot: 'fill-gray-500' },
}

/** Inline SVG rendering of a laid-out project map. Nodes are focusable; Enter or Space selects. */
export function MapCanvas({ layout, selectedId, onSelect }: MapCanvasProps) {
  const { privacyMode, anonymizeBranch } = usePrivacy()

  return (
    <svg
      role="group"
      aria-label="Session map"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="block"
    >
      {layout.edges.map((edge) => (
        <DispatchEdge key={edge.id} edge={edge} />
      ))}
      {layout.nodes.map((node) => {
        const title = node.kind === 'session' && privacyMode ? anonymizeBranch(node.title) : node.title
        return (
          <NodeView
            key={node.id}
            node={node}
            title={title}
            selected={node.id === selectedId}
            onSelect={onSelect}
          />
        )
      })}
    </svg>
  )
}

function DispatchEdge({ edge }: { edge: PositionedEdge }) {
  return <path d={edge.d} fill="none" strokeWidth={1.5} className="stroke-gray-700" />
}

interface NodeViewProps {
  node: PositionedNode
  title: string
  selected: boolean
  onSelect: (nodeId: string) => void
}

function NodeView({ node, title, selected, onSelect }: NodeViewProps) {
  const isSession = node.kind === 'session'
  const classes = STATUS_CLASSES[node.status]
  const subtitle = truncateLabel(node.subtitle, isSession ? 32 : 30)
  const model = isSession ? shortModelName(node.model) : null
  const label = [
    isSession ? 'Session' : 'Subagent',
    title,
    statusLabel(node.status),
    node.needsYou ? 'needs you' : null,
  ]
    .filter(Boolean)
    .join(', ')

  function handleKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(node.id)
    }
  }

  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={label}
      onClick={() => onSelect(node.id)}
      onKeyDown={handleKeyDown}
      className="group cursor-pointer outline-none"
    >
      <title>{label}</title>
      {node.needsYou && (
        <rect
          x={-4}
          y={-4}
          width={node.width + 8}
          height={node.height + 8}
          rx={16}
          fill="none"
          strokeWidth={2}
          className="stroke-brand-500"
        />
      )}
      <rect
        width={node.width}
        height={node.height}
        rx={12}
        strokeWidth={selected ? 2.5 : 1.5}
        className={`${selected ? 'fill-gray-800' : 'fill-gray-900'} ${classes.stroke} group-focus-visible:stroke-brand-300`}
      />
      <circle cx={16} cy={isSession ? 27 : 24} r={4} className={classes.dot} />
      <text x={28} y={isSession ? 32 : 28} className="fill-gray-100 text-[13px] font-semibold">
        {truncateLabel(title, isSession ? 26 : 24)}
      </text>
      <text x={28} y={isSession ? 50 : 46} className="fill-gray-500 text-[11px]">
        {subtitle}
      </text>
      {model && (
        <text x={28} y={68} className="fill-gray-500 font-mono text-[11px]">
          {model}
        </text>
      )}
    </g>
  )
}
