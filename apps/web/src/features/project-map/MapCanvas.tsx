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

/**
 * Border and dot colour per status. `halo` is the pulsing outline drawn behind the node;
 * its animation lives in app.css and is switched off for prefers-reduced-motion.
 */
const STATUS_CLASSES: Record<MapNodeStatus, { stroke: string; dot: string; halo?: string }> = {
  'needs-you': {
    stroke: 'stroke-yellow-400',
    dot: 'fill-yellow-400',
    halo: 'stroke-yellow-400 status-halo-needs-you',
  },
  active: { stroke: 'stroke-green-500', dot: 'fill-green-400', halo: 'stroke-green-500 status-halo-active' },
  running: { stroke: 'stroke-green-500', dot: 'fill-green-400', halo: 'stroke-green-500 status-halo-active' },
  completed: { stroke: 'stroke-brand-500', dot: 'fill-brand-500' },
  idle: { stroke: 'stroke-gray-600', dot: 'fill-gray-500' },
  done: { stroke: 'stroke-blue-500', dot: 'fill-blue-400' },
}

/** Inline SVG rendering of a laid-out project map. Nodes are focusable; Enter or Space selects. */
export function MapCanvas({ layout, selectedId, onSelect }: MapCanvasProps) {
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
        <MapEdgeLine key={edge.id} edge={edge} />
      ))}
      {layout.nodes.map((node) => (
        <NodeView key={node.id} node={node} selected={node.id === selectedId} onSelect={onSelect} />
      ))}
    </svg>
  )
}

/** Fork edges are dashed so a fork reads differently from a subagent dispatch. */
function MapEdgeLine({ edge }: { edge: PositionedEdge }) {
  const isFork = edge.kind === 'fork'
  return (
    <path
      d={edge.d}
      fill="none"
      strokeWidth={1.5}
      strokeDasharray={isFork ? '6 4' : undefined}
      className={isFork ? 'stroke-gray-500' : 'stroke-gray-700'}
    />
  )
}

interface NodeViewProps {
  node: PositionedNode
  selected: boolean
  onSelect: (nodeId: string) => void
}

function NodeView({ node, selected, onSelect }: NodeViewProps) {
  const { privacyMode, anonymizeSessionName, anonymizeProjectName, anonymizeBranch } = usePrivacy()
  const isSession = node.kind === 'session'
  const classes = STATUS_CLASSES[node.status]

  const sessionTitle = isSession && privacyMode ? anonymizeSessionName(node.title) : node.title
  const projectLabel =
    isSession && node.projectDisplayName
      ? privacyMode
        ? anonymizeProjectName(node.projectDisplayName)
        : node.projectDisplayName
      : null
  const branch = isSession && node.branch ? (privacyMode ? anonymizeBranch(node.branch) : node.branch) : null
  const model = isSession ? shortModelName(node.model) : null
  const label = [
    isSession ? (node.isFork ? 'Forked session' : 'Session') : 'Subagent',
    projectLabel,
    sessionTitle,
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
      {classes.halo && (
        <rect
          x={-4}
          y={-4}
          width={node.width + 8}
          height={node.height + 8}
          rx={16}
          fill="none"
          strokeWidth={2}
          className={classes.halo}
        />
      )}
      <rect
        width={node.width}
        height={node.height}
        rx={12}
        strokeWidth={selected ? 2.5 : 1.5}
        className={`${selected ? 'fill-gray-800' : 'fill-gray-900'} ${classes.stroke} group-focus-visible:stroke-brand-300`}
      />
      {isSession ? (
        <SessionLines
          projectLabel={projectLabel ?? sessionTitle}
          sessionTitle={projectLabel ? sessionTitle : null}
          dotClass={classes.dot}
          branch={branch}
          subtitle={node.subtitle}
          model={model}
          isFork={node.isFork}
        />
      ) : (
        <SubagentLines title={node.title} description={node.subtitle} dotClass={classes.dot} />
      )}
    </g>
  )
}

function SessionLines({
  projectLabel,
  sessionTitle,
  dotClass,
  branch,
  subtitle,
  model,
  isFork,
}: {
  projectLabel: string
  sessionTitle: string | null
  dotClass: string
  branch: string | null
  subtitle: string
  model: string | null
  isFork: boolean
}) {
  return (
    <>
      <circle cx={16} cy={20} r={4} className={dotClass} />
      <text x={28} y={24} className="fill-gray-100 text-[13px] font-semibold">
        {truncateLabel(projectLabel, 30)}
      </text>
      {sessionTitle && (
        <text x={28} y={41} className="fill-gray-300 text-[11px]">
          {truncateLabel(sessionTitle, 36)}
        </text>
      )}
      <text x={28} y={57} className="fill-gray-500 text-[10px]">
        {truncateLabel(branch ? `${branch} · ${subtitle}` : subtitle, 42)}
      </text>
      {(model || isFork) && (
        <text x={28} y={73} className="fill-gray-500 font-mono text-[10px]">
          {[isFork ? 'fork' : null, model].filter(Boolean).join(' · ')}
        </text>
      )}
    </>
  )
}

function SubagentLines({
  title,
  description,
  dotClass,
}: {
  title: string
  description: string
  dotClass: string
}) {
  return (
    <>
      <circle cx={12} cy={14} r={3.5} className={dotClass} />
      <text x={22} y={18} className="fill-gray-100 text-[12px] font-semibold">
        {truncateLabel(title, 22)}
      </text>
      <text x={22} y={34} className="fill-gray-500 text-[10px]">
        {truncateLabel(description, 28)}
      </text>
    </>
  )
}
