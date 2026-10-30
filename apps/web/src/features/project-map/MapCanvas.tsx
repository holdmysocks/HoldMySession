import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { PositionedEdge, PositionedNode, ProjectLayout } from '@/lib/map/layout'
import type { MapNodeStatus } from '@/lib/map/project-map'
import { boundsOf, fitView, zoomAt, type FitOptions, type MapView, type ViewSize } from '@/lib/map/viewport'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { expiredSubagentsLabel, kindLabel, relationTag, shortModelName, statusLabel, truncateLabel } from './format-node'

interface MapCanvasProps {
  layout: ProjectLayout
  selectedId: string | null
  onSelect: (nodeId: string) => void
  /** Editor mode: dragging a card moves it. Otherwise dragging anywhere pans the map. */
  editMode?: boolean
  /** Called while a card is dragged or nudged, with its new top-left corner in map coordinates. */
  onNodeMove?: (nodeId: string, x: number, y: number) => void
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

/** Pointer travel, in pixels, before a press counts as a drag. Below it the press is a click. */
const DRAG_THRESHOLD = 4
/** Map units a focused card moves per arrow key press in editor mode. */
const NUDGE_STEP = 10
/** The first view fits the whole drawing, but never smaller than this, so text stays readable. */
const INITIAL_FIT: FitOptions = { padding: 16, minScale: 0.5, maxScale: 1, center: false }
/** The Fit button shows everything, however small that makes it. */
const FULL_FIT: FitOptions = { padding: 32, minScale: 0.15, maxScale: 1.5, center: true }
const ZOOM_BUTTON_FACTOR = 1.25

interface Drag {
  pointerId: number
  startX: number
  startY: number
  moved: boolean
  /** A card being moved, or null when the drag pans the map. */
  nodeId: string | null
  /** The card's position, or the view's, when the drag started. */
  originX: number
  originY: number
}

/**
 * Inline SVG rendering of a laid-out project map. It fills the space it is given. Dragging empty
 * space pans, the wheel zooms, and in editor mode dragging a card moves it. Nodes are focusable;
 * Enter or Space selects, and in editor mode the arrow keys nudge the focused card.
 */
export function MapCanvas({ layout, selectedId, onSelect, editMode = false, onNodeMove }: MapCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const suppressClickRef = useRef(false)
  const [size, setSize] = useState<ViewSize>({ width: 0, height: 0 })
  // Null until the user pans or zooms. Until then the view follows the drawing and the panel size.
  const [userView, setUserView] = useState<MapView | null>(null)
  const [panning, setPanning] = useState(false)

  const bounds = useMemo(() => boundsOf(layout.nodes), [layout.nodes])
  const view = useMemo<MapView>(() => {
    if (userView) return userView
    if (!bounds || !(size.width > 0 && size.height > 0)) return { x: INITIAL_FIT.padding, y: INITIAL_FIT.padding, k: 1 }
    return fitView(bounds, size, INITIAL_FIT)
  }, [userView, bounds, size])

  // The pointer and wheel handlers read the view from here, so they never act on a stale one.
  const viewRef = useRef(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])

  const commitView = useCallback((next: MapView) => {
    viewRef.current = next
    setUserView(next)
  }, [])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = () => {
      const { width, height } = svg.getBoundingClientRect()
      setSize({ width, height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  // React registers wheel listeners as passive, which cannot stop the page from scrolling.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    function handleWheel(event: WheelEvent) {
      event.preventDefault()
      const rect = svg!.getBoundingClientRect()
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      const factor = Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0015))
      commitView(zoomAt(viewRef.current, factor, event.clientX - rect.left, event.clientY - rect.top))
    }
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [commitView])

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    const nodeId = (event.target as Element).closest?.('[data-node-id]')?.getAttribute('data-node-id') ?? null
    const node = editMode && onNodeMove && nodeId ? layout.nodes.find((n) => n.id === nodeId) : undefined
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      nodeId: node?.id ?? null,
      originX: node ? node.x : viewRef.current.x,
      originY: node ? node.y : viewRef.current.y,
    }
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      drag.moved = true
      // Hold the view where it is, so moving a card does not make the map refit under the pointer.
      commitView(viewRef.current)
      // Captured only once it is a drag, so a plain click still reaches the card.
      svgRef.current?.setPointerCapture?.(event.pointerId)
      if (drag.nodeId === null) setPanning(true)
    }
    if (drag.nodeId !== null) {
      const k = viewRef.current.k
      onNodeMove?.(drag.nodeId, drag.originX + dx / k, drag.originY + dy / k)
    } else {
      commitView({ ...viewRef.current, x: drag.originX + dx, y: drag.originY + dy })
    }
  }

  function handlePointerEnd(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setPanning(false)
    if (!drag.moved) return
    svgRef.current?.releasePointerCapture?.(event.pointerId)
    // The click that ends a drag must not select the card it ended on.
    suppressClickRef.current = true
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
  }

  function zoomFromCentre(factor: number) {
    commitView(zoomAt(viewRef.current, factor, size.width / 2, size.height / 2))
  }

  function fitAll() {
    if (bounds && size.width > 0 && size.height > 0) commitView(fitView(bounds, size, FULL_FIT))
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg
        ref={svgRef}
        role="group"
        aria-label="Session map"
        width="100%"
        height="100%"
        className={`block touch-none select-none ${panning ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return
          suppressClickRef.current = false
          event.stopPropagation()
          event.preventDefault()
        }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {layout.edges.map((edge) => (
            <MapEdgeLine key={edge.id} edge={edge} />
          ))}
          {layout.nodes.map((node) => (
            <NodeView
              key={node.id}
              node={node}
              selected={node.id === selectedId}
              editMode={editMode}
              onSelect={onSelect}
              onNodeMove={onNodeMove}
            />
          ))}
        </g>
      </svg>

      <div
        role="toolbar"
        aria-label="Map view"
        className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-gray-800 bg-gray-900/90 p-1 text-xs text-gray-300 shadow-lg"
      >
        <ViewButton label="Zoom out" onClick={() => zoomFromCentre(1 / ZOOM_BUTTON_FACTOR)}>
          −
        </ViewButton>
        <span className="w-11 text-center tabular-nums text-gray-400">{Math.round(view.k * 100)}%</span>
        <ViewButton label="Zoom in" onClick={() => zoomFromCentre(ZOOM_BUTTON_FACTOR)}>
          +
        </ViewButton>
        <ViewButton label="Fit map to screen" onClick={fitAll}>
          Fit
        </ViewButton>
      </div>
    </div>
  )
}

function ViewButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="min-w-7 rounded-md px-2 py-1 font-medium text-gray-200 hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400"
    >
      {children}
    </button>
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
  editMode: boolean
  onSelect: (nodeId: string) => void
  onNodeMove?: (nodeId: string, x: number, y: number) => void
}

const NUDGE_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-NUDGE_STEP, 0],
  ArrowRight: [NUDGE_STEP, 0],
  ArrowUp: [0, -NUDGE_STEP],
  ArrowDown: [0, NUDGE_STEP],
}

function NodeView({ node, selected, editMode, onSelect, onNodeMove }: NodeViewProps) {
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
      return
    }
    const nudge = editMode && onNodeMove ? NUDGE_KEYS[event.key] : undefined
    if (nudge) {
      event.preventDefault()
      onNodeMove?.(node.id, node.x + nudge[0], node.y + nudge[1])
    }
  }

  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      data-node-id={node.id}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={label}
      onClick={() => onSelect(node.id)}
      onKeyDown={handleKeyDown}
      className={`group outline-none ${editMode ? 'cursor-move' : 'cursor-pointer'}`}
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
