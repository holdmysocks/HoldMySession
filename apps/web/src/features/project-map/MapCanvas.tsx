import type { KeyboardEvent } from 'react'
import type { PositionedEdge, PositionedNode, ProjectLayout } from '@/lib/map/layout'
import type { MapNodeStatus } from '@/lib/map/project-map'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { expiredSubagentsLabel, kindLabel, relationTag, shortModelName, statusLabel, truncateLabel } from './format-node'

interface MapCanvasProps {
  layout: ProjectLayout
  selectedId: string | null
  onSelect: (nodeId: string) => void
}

/**
 * Border and dot colour per status. `halo` is the pulsing rect drawn behind the node, and
 * `edge` brightens the needs-you border at the peak. Their animations live in app.css and
 * are switched off for prefers-reduced-motion.
 */
const STATUS_CLASSES: Record<
  MapNodeStatus,
  { stroke: string; dot: string; halo?: string; edge?: string }
> = {
  'needs-you': {
    stroke: 'stroke-yellow-400',
    dot: 'fill-yellow-400',
    halo: 'fill-yellow-400 status-halo-needs-you',
    edge: 'status-edge-needs-you',
  },
  active: { stroke: 'stroke-green-500', dot: 'fill-green-400', halo: 'fill-green-500 status-halo-active' },
  running: { stroke: 'stroke-green-500', dot: 'fill-green-400', halo: 'fill-green-500 status-halo-active' },
  completed: { stroke: 'stroke-brand-500', dot: 'fill-brand-500' },
  idle: { stroke: 'stroke-gray-600', dot: 'fill-gray-500' },
}

/** Session node border width. Subagent cards use a thinner one. Selection adds 1. */
const SESSION_STROKE = 2
const SUBAGENT_STROKE = 1.5
/** How far the halo extends past the node on each side at rest. */
const HALO_INSET = 2
/**
 * Empty space around the drawing. The border, the halo and the selection outline sit just
 * outside each node, so without this they are cut off at the canvas edge.
 */
const CANVAS_PAD = 8

/** Inline SVG rendering of a laid-out project map. Nodes are focusable; Enter or Space selects. */
export function MapCanvas({ layout, selectedId, onSelect }: MapCanvasProps) {
  return (
    <svg
      role="group"
      aria-label="Session map"
      width={layout.width + CANVAS_PAD * 2}
      height={layout.height + CANVAS_PAD * 2}
      viewBox={`${-CANVAS_PAD} ${-CANVAS_PAD} ${layout.width + CANVAS_PAD * 2} ${layout.height + CANVAS_PAD * 2}`}
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
  const expired = isSession ? node.expiredSubagentCount : 0
  const label = [
    kindLabel(node),
    projectLabel,
    sessionTitle,
    statusLabel(node.status),
    node.needsYou ? 'needs you' : null,
    expired > 0 ? expiredSubagentsLabel(expired) : null,
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
          x={-HALO_INSET}
          y={-HALO_INSET}
          width={node.width + HALO_INSET * 2}
          height={node.height + HALO_INSET * 2}
          rx={16}
          strokeWidth={0}
          className={classes.halo}
        />
      )}
      <rect
        width={node.width}
        height={node.height}
        rx={12}
        strokeWidth={(isSession ? SESSION_STROKE : SUBAGENT_STROKE) + (selected ? 1 : 0)}
        className={`${selected ? 'fill-gray-800' : 'fill-gray-900'} ${classes.stroke} ${classes.edge ?? ''} group-focus-visible:stroke-brand-300`}
      />
      {isSession ? (
        <SessionLines
          sessionTitle={sessionTitle}
          dotClass={classes.dot}
          branch={branch}
          subtitle={node.subtitle}
          model={model}
          relation={relationTag(node.parentRelation)}
        />
      ) : (
        <SubagentLines title={node.title} description={node.subtitle} dotClass={classes.dot} />
      )}
      {isSession && node.backgroundTaskCount > 0 && (
        <TaskChip count={node.backgroundTaskCount} x={node.width - 120} y={node.height - 22} />
      )}
      {expired > 0 && <ExpiredChip count={expired} x={node.width - 48} y={node.height - 22} />}
    </g>
  )
}

/**
 * "N tasks" chip: background tasks of this session that are still running. Green, because they
 * are what keeps a quiet session green.
 */
function TaskChip({ count, x, y }: { count: number; x: number; y: number }) {
  const label = `${count} ${count === 1 ? 'task' : 'tasks'}`
  return (
    <g aria-hidden="true">
      <rect x={x} y={y} width={68} height={16} rx={8} strokeWidth={1} className="fill-gray-800 stroke-green-600" />
      <text x={x + 34} y={y + 11.5} textAnchor="middle" className="fill-green-300 text-[10px] font-semibold">
        {label}
      </text>
    </g>
  )
}

/**
 * "+N" chip at the bottom right of a session node: N subagents were dispatched here but their
 * cache has expired, so they are not drawn. Sits below the subtitle and clear of the model line.
 */
function ExpiredChip({ count, x, y }: { count: number; x: number; y: number }) {
  return (
    <g aria-hidden="true">
      <rect x={x} y={y} width={40} height={16} rx={8} strokeWidth={1} className="fill-gray-800 stroke-gray-600" />
      <text x={x + 20} y={y + 11.5} textAnchor="middle" className="fill-gray-300 text-[10px] font-semibold">
        {`+${count}`}
      </text>
    </g>
  )
}

/**
 * Text on a session card. The project is left off: the map is already for one project. The
 * session name sits next to the status dot, and the lines below it are larger than before.
 */
function SessionLines({
  sessionTitle,
  dotClass,
  branch,
  subtitle,
  model,
  relation,
}: {
  sessionTitle: string
  dotClass: string
  branch: string | null
  subtitle: string
  model: string | null
  relation: string | null
}) {
  return (
    <>
      <circle cx={16} cy={21} r={5} className={dotClass} />
      <text x={30} y={26} className="fill-gray-100 text-[15px] font-semibold">
        {truncateLabel(sessionTitle, 28)}
      </text>
      <text x={16} y={46} className="fill-gray-400 text-[12px]">
        {truncateLabel(subtitle, 36)}
      </text>
      {branch && (
        <text x={16} y={63} className="fill-gray-500 text-[11px]">
          {truncateLabel(branch, 40)}
        </text>
      )}
      {(model || relation) && (
        <text x={16} y={79} className="fill-gray-500 font-mono text-[11px]">
          {[relation, model].filter(Boolean).join(' · ')}
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
      <circle cx={12} cy={15} r={3.5} className={dotClass} />
      <text x={22} y={19} className="fill-gray-100 text-[13px] font-semibold">
        {truncateLabel(title, 24)}
      </text>
      <text x={22} y={37} className="fill-gray-500 text-[11px]">
        {truncateLabel(description, 30)}
      </text>
    </>
  )
}
