import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { PositionedEdge, PositionedNode, ProjectLayout } from '@/lib/map/layout'
import type { MapNodeStatus } from '@/lib/map/project-map'
import { boundsOf, fitView, zoomAt, type FitOptions, type MapView, type ViewSize } from '@/lib/map/viewport'
import { GRID_SIZE, dragPositions, nodesInBox, toggleId, type Placed } from '@/lib/map/editing'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { expiredSubagentsLabel, kindLabel, relationTag, shortModelName, statusLabel, truncateLabel } from './format-node'

/** A card's new top-left corner, in map coordinates. */
export type NodeMove = Placed

interface MapCanvasProps {
  layout: ProjectLayout
  selectedId: string | null
  onSelect: (nodeId: string) => void
  /**
   * Editor mode: dragging a card moves it, Ctrl-click or Ctrl and a drag over empty space selects
   * several, and dragging any selected card moves them all. Otherwise dragging anywhere pans.
   */
  editMode?: boolean
  /** Called while cards are dragged or nudged, with every moved card's new top-left corner. */
  onNodesMove?: (moves: NodeMove[]) => void
  /** In editor mode, cards snap to a grid while dragged. Holding Alt places them freely. */
  snapToGrid?: boolean
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
  completed: { stroke: 'stroke-indigo-400', dot: 'fill-indigo-400' },
  idle: { stroke: 'stroke-gray-600', dot: 'fill-gray-500' },
}

/** What each status looks like on a card: its fill, border, dot, text colours, tag word and glow. */
interface Look {
  fill: string
  edge: string
  dot: string
  ink: string
  sub: string
  word: string
  badge: string
  badgeInk: string
  glow: string
}
const GREEN: Look = { fill: 'url(#hms-card-active)', edge: '#3DDC84', dot: '#3DDC84', ink: '#EAFFF2', sub: '#8BE8B4', word: 'RUNNING', badge: '#3DDC84', badgeInk: '#04210F', glow: '#3DDC8455' }
const LOOKS: Record<MapNodeStatus, Look> = {
  active: GREEN,
  running: GREEN,
  'needs-you': { fill: 'url(#hms-card-warn)', edge: '#FFE9A8', dot: '#2A1B00', ink: '#241600', sub: '#4A3200', word: 'NEEDS YOU', badge: '#241600', badgeInk: '#FFD25A', glow: '#FFC83D77' },
  completed: { fill: 'url(#hms-card-done)', edge: '#9B8CFF', dot: '#9B8CFF', ink: '#F1EFFF', sub: '#B9B0FF', word: 'DONE', badge: '#9B8CFF', badgeInk: '#17123F', glow: '#9B8CFF44' },
  idle: { fill: '#1D1C1A', edge: '#ffffff2a', dot: '#8F8D85', ink: '#FAF9F5', sub: '#A8A69C', word: 'IDLE', badge: '#ffffff1c', badgeInk: '#C9C7BE', glow: 'transparent' },
}

/** Session node border width. Subagent cards use a thinner one. Selection adds 1. */
const SESSION_STROKE = 2
const SUBAGENT_STROKE = 1.5
/** How far the halo extends past the node on each side at rest. */
const HALO_INSET = 2

/** Pointer travel, in pixels, before a press counts as a drag. Below it the press is a click. */
const DRAG_THRESHOLD = 4
/** Map units a focused card moves per arrow key press in editor mode. With the grid on, one grid step. */
const NUDGE_STEP = 10
/** The grid dots are left out below this zoom, where they would run together. */
const MIN_GRID_ZOOM = 0.35
const NO_IDS: readonly string[] = []
/** The first view fits the whole drawing, but never smaller than this, so text stays readable. */
const INITIAL_FIT: FitOptions = { padding: 16, minScale: 0.5, maxScale: 1, center: false }
/** The Fit button shows everything, however small that makes it. */
const FULL_FIT: FitOptions = { padding: 32, minScale: 0.15, maxScale: 1.5, center: true }
const ZOOM_BUTTON_FACTOR = 1.25

interface DragBase {
  pointerId: number
  startX: number
  startY: number
  moved: boolean
}

type Drag =
  | (DragBase & {
      kind: 'nodes'
      /** The card under the pointer. With the grid on, it is the one that lands on a grid point. */
      primaryId: string
      /** Every card being moved, where it was when the drag started. */
      origins: Placed[]
      /** Whether the primary card was already in the selection. If not, it becomes the selection. */
      wasSelected: boolean
    })
  | (DragBase & { kind: 'marquee'; left: number; top: number })
  | (DragBase & { kind: 'pan'; originX: number; originY: number })

/** A selection box in screen pixels, relative to the map. */
interface Marquee {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Inline SVG rendering of a laid-out project map. It fills the space it is given. Dragging empty
 * space pans, the wheel zooms, and in editor mode dragging a card moves it, to a grid unless Alt is
 * held. Ctrl-click, or Ctrl and a drag over empty space, selects several cards, and dragging one of
 * them moves them all. Nodes are focusable; Enter or Space selects, and in editor mode the arrow
 * keys nudge the focused card, or the whole selection when it is part of it.
 */
export function MapCanvas({
  layout,
  selectedId,
  onSelect,
  editMode = false,
  onNodesMove,
  snapToGrid = false,
}: MapCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gridId = `map-grid-${useId().replace(/:/g, '')}`
  // The cards picked in editor mode, apart from the one the details panel shows.
  const [selection, setSelection] = useState<string[]>([])
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const activeSelection = editMode ? selection : NO_IDS
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
    const base = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false }

    if (editMode && onNodesMove && nodeId) {
      const wasSelected = activeSelection.includes(nodeId)
      const ids = wasSelected ? activeSelection : [nodeId]
      const origins = layout.nodes
        .filter((node) => ids.includes(node.id))
        .map((node) => ({ id: node.id, x: node.x, y: node.y }))
      dragRef.current = { ...base, kind: 'nodes', primaryId: nodeId, origins, wasSelected }
      return
    }
    if (editMode && (event.ctrlKey || event.metaKey)) {
      const rect = svgRef.current?.getBoundingClientRect()
      dragRef.current = { ...base, kind: 'marquee', left: rect?.left ?? 0, top: rect?.top ?? 0 }
      return
    }
    dragRef.current = { ...base, kind: 'pan', originX: viewRef.current.x, originY: viewRef.current.y }
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
      if (drag.kind === 'pan') setPanning(true)
      // Dragging a card that was not selected selects it alone, so the outline shows what moves.
      if (drag.kind === 'nodes' && !drag.wasSelected) setSelection([drag.primaryId])
    }

    if (drag.kind === 'nodes') {
      const k = viewRef.current.k
      // Alt places freely. Otherwise the grid snaps, when it is on.
      const snap = snapToGrid && !event.altKey
      onNodesMove?.(dragPositions(drag.origins, drag.primaryId, dx / k, dy / k, snap))
    } else if (drag.kind === 'marquee') {
      setMarquee({
        x0: drag.startX - drag.left,
        y0: drag.startY - drag.top,
        x1: event.clientX - drag.left,
        y1: event.clientY - drag.top,
      })
    } else {
      commitView({ ...viewRef.current, x: drag.originX + dx, y: drag.originY + dy })
    }
  }

  function handlePointerEnd(event: PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setPanning(false)

    if (drag.kind === 'marquee' && marquee) {
      const { x, y, k } = viewRef.current
      setSelection(
        nodesInBox(layout.nodes, {
          x0: (marquee.x0 - x) / k,
          y0: (marquee.y0 - y) / k,
          x1: (marquee.x1 - x) / k,
          y1: (marquee.y1 - y) / k,
        }),
      )
    }
    setMarquee(null)

    // A plain click on empty space in editor mode drops the selection.
    if (drag.kind === 'pan' && !drag.moved && editMode) setSelection([])

    if (!drag.moved) return
    svgRef.current?.releasePointerCapture?.(event.pointerId)
    // The click that ends a drag must not select the card it ended on.
    suppressClickRef.current = true
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
  }

  /** A click on a card. In editor mode Ctrl adds it to the selection, or takes it out. */
  function handleNodeClick(nodeId: string, additive: boolean) {
    if (editMode && additive) {
      const next = toggleId(selection, nodeId)
      setSelection(next)
      if (next.includes(nodeId)) onSelect(nodeId)
      return
    }
    if (editMode) setSelection([nodeId])
    onSelect(nodeId)
  }

  /** An arrow key on a card. The whole selection moves with it when the card is part of it. */
  function handleNudge(nodeId: string, stepX: number, stepY: number, free: boolean) {
    const ids = activeSelection.includes(nodeId) ? activeSelection : [nodeId]
    const origins = layout.nodes
      .filter((node) => ids.includes(node.id))
      .map((node) => ({ id: node.id, x: node.x, y: node.y }))
    const snap = snapToGrid && !free
    const step = snap ? GRID_SIZE : NUDGE_STEP
    onNodesMove?.(dragPositions(origins, nodeId, stepX * step, stepY * step, snap))
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
        <defs>
          <linearGradient id="hms-card-active" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0F4A2C" /><stop offset="1" stopColor="#0A2D1B" /></linearGradient>
          <linearGradient id="hms-card-warn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFD25A" /><stop offset="1" stopColor="#F5A623" /></linearGradient>
          <linearGradient id="hms-card-done" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2B2466" /><stop offset="1" stopColor="#1A1640" /></linearGradient>
        </defs>
        {editMode && snapToGrid && size.width > 0 && view.k >= MIN_GRID_ZOOM && (
          <defs>
            <pattern
              id={gridId}
              width={GRID_SIZE}
              height={GRID_SIZE}
              x={-GRID_SIZE / 2}
              y={-GRID_SIZE / 2}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={GRID_SIZE / 2} cy={GRID_SIZE / 2} r={1.1} className="fill-gray-700" />
            </pattern>
          </defs>
        )}
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {editMode && snapToGrid && size.width > 0 && view.k >= MIN_GRID_ZOOM && (
            <rect
              data-grid
              x={-view.x / view.k}
              y={-view.y / view.k}
              width={size.width / view.k}
              height={size.height / view.k}
              fill={`url(#${gridId})`}
              pointerEvents="none"
            />
          )}
          {layout.edges.map((edge) => (
            <MapEdgeLine key={edge.id} edge={edge} />
          ))}
          {layout.nodes.map((node) => (
            <NodeView
              key={node.id}
              node={node}
              selected={node.id === selectedId}
              multiSelected={activeSelection.includes(node.id)}
              editMode={editMode}
              canMove={Boolean(onNodesMove)}
              onClick={handleNodeClick}
              onNudge={handleNudge}
            />
          ))}
        </g>
        {marquee && (
          <rect
            data-marquee
            x={Math.min(marquee.x0, marquee.x1)}
            y={Math.min(marquee.y0, marquee.y1)}
            width={Math.abs(marquee.x1 - marquee.x0)}
            height={Math.abs(marquee.y1 - marquee.y0)}
            strokeWidth={1}
            strokeDasharray="4 3"
            className="fill-brand-500/10 stroke-brand-500"
            pointerEvents="none"
          />
        )}
      </svg>

      <div
        role="toolbar"
        aria-label="Map view"
        className="absolute bottom-3.5 right-3.5 flex items-center gap-0.5 rounded-full border border-[color:var(--hms-line)] bg-gray-900 p-[3px] text-xs text-[color:var(--hms-mute)]"
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
      className={`min-h-11 rounded-full font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ${
        children === 'Fit' ? 'bg-brand-400 px-[18px] font-semibold text-gray-950 hover:bg-brand-300' : 'min-w-11 text-lg text-gray-100 hover:bg-gray-800'
      }`}
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
      strokeWidth={isFork ? 3 : 2.5}
      strokeLinecap="round"
      strokeDasharray={isFork ? '0.1 7' : '7 7'}
      className={isFork ? undefined : 'map-edge-flow'}
      stroke={isFork ? '#3DDC8499' : '#3DDC8477'}
      style={{ filter: 'drop-shadow(0 0 6px #3DDC8455)' }}
    />
  )
}

interface NodeViewProps {
  node: PositionedNode
  /** The card the details panel shows. */
  selected: boolean
  /** One of the cards picked in editor mode. */
  multiSelected: boolean
  editMode: boolean
  canMove: boolean
  onClick: (nodeId: string, additive: boolean) => void
  /** An arrow key in editor mode: a step of -1, 0 or 1 on each axis, and whether Alt was held. */
  onNudge: (nodeId: string, stepX: number, stepY: number, free: boolean) => void
}

const NUDGE_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

function NodeView({ node, selected, multiSelected, editMode, canMove, onClick, onNudge }: NodeViewProps) {
  const { privacyMode, anonymizeSessionName, anonymizeProjectName, anonymizeBranch } = usePrivacy()
  const isSession = node.kind === 'session'
  const classes = STATUS_CLASSES[node.status]
  const look = LOOKS[node.status]
  const radius = isSession ? 22 : 16

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
      onClick(node.id, event.ctrlKey || event.metaKey)
      return
    }
    const nudge = editMode && canMove ? NUDGE_KEYS[event.key] : undefined
    if (nudge) {
      event.preventDefault()
      onNudge(node.id, nudge[0], nudge[1], event.altKey)
    }
  }

  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      data-node-id={node.id}
      data-multiselected={multiSelected ? 'true' : undefined}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={label}
      onClick={(event) => onClick(node.id, event.ctrlKey || event.metaKey)}
      onKeyDown={handleKeyDown}
      className={`group outline-none ${editMode ? 'cursor-move' : 'cursor-pointer'}`}
    >
      <title>{label}</title>
      {multiSelected && (
        <rect
          x={-5}
          y={-5}
          width={node.width + 10}
          height={node.height + 10}
          rx={14}
          fill="none"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          className="stroke-brand-400"
        />
      )}
      {classes.halo && (
        <rect
          data-card-halo
          x={-HALO_INSET}
          y={-HALO_INSET}
          width={node.width + HALO_INSET * 2}
          height={node.height + HALO_INSET * 2}
          rx={radius + 4}
          strokeWidth={0}
          className={classes.halo}
          style={{ fill: look.glow, filter: `drop-shadow(0 0 14px ${look.glow})` }}
        />
      )}
      {selected && (
        <rect
          data-selected-ring
          x={-5}
          y={-5}
          width={node.width + 10}
          height={node.height + 10}
          rx={radius + 5}
          fill="none"
          stroke="var(--hms-ink)"
          strokeWidth={3}
        />
      )}
      <rect
        data-card-body
        width={node.width}
        height={node.height}
        rx={radius}
        strokeWidth={(isSession ? SESSION_STROKE : SUBAGENT_STROKE) + (selected ? 1 : 0) + (node.status === 'needs-you' ? 1 : 0)}
        className={`${classes.stroke} ${classes.edge ?? ''} group-focus-visible:stroke-brand-300`}
        style={{ fill: look.fill, stroke: node.status === 'needs-you' ? look.edge : undefined, filter: look.glow === 'transparent' ? undefined : `drop-shadow(0 0 12px ${look.glow})` }}
      />
      {isSession ? (
        <SessionLines
          sessionTitle={sessionTitle}
          look={look}
          branch={branch}
          sessionId={node.sessionId}
          messages={node.subtitle.split('·')[1]?.trim() ?? ''}
          model={model}
          relation={relationTag(node.parentRelation)}
          kind={node.needsYou ? (node.waiting?.kind === 'question' ? 'Question' : node.waiting?.kind === 'plan' ? 'Plan' : node.waiting?.kind === 'permission' ? 'Permission' : 'Waiting') : null}
          pulse={node.status === 'active' || node.status === 'running'}
          agents={node.runningAgents}
          waitingOnAgents={node.waitingOnAgents}
        />
      ) : (
        <SubagentLines title={node.title} description={node.subtitle} look={look} pulse={node.status === 'active' || node.status === 'running'} />
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
      <rect x={x} y={y} width={68} height={18} rx={9} fill="#00000055" />
      <text x={x + 34} y={y + 12.5} textAnchor="middle" fill="#CFEFDC" className="text-[11px]">
        {label}
      </text>
    </g>
  )
}

/**
 * Chip at the bottom right of a session node: N subagents were dispatched here but their
 * cache has expired, so they are not drawn.
 */
function ExpiredChip({ count, x, y }: { count: number; x: number; y: number }) {
  const text = `+${count} quiet ${count === 1 ? 'agent' : 'agents'}`
  const width = text.length * 6 + 18
  return (
    <g aria-hidden="true">
      <rect x={x - width + 40} y={y} width={width} height={18} rx={9} fill="#00000055" />
      <text x={x - width / 2 + 40} y={y + 12.5} textAnchor="middle" fill="#CFEFDC" className="text-[11px]">
        {text}
      </text>
    </g>
  )
}

/** A status dot with a soft glow. Running ones breathe. */
function Dot({ cx, cy, r, color, pulse }: { cx: number; cy: number; r: number; color: string; pulse: boolean }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={color}
      style={{ filter: `drop-shadow(0 0 5px ${color})`, animation: pulse ? 'runPulse 1.6s ease-in-out infinite' : undefined }}
    />
  )
}

/**
 * Text on a session card: the name next to the status dot, then the status word with the messages and
 * model, then the branch and short id. The project is left off: the map is already for one project.
 */
function SessionLines({
  sessionTitle,
  look,
  branch,
  sessionId,
  messages,
  model,
  relation,
  kind,
  pulse,
  agents,
  waitingOnAgents,
}: {
  sessionTitle: string
  look: Look
  branch: string | null
  sessionId: string
  messages: string
  model: string | null
  relation: string | null
  /** What a needs-you session is waiting for, shown in place of the message count. */
  kind: string | null
  pulse: boolean
  /** Subagents working now, and whether this session is just waiting for them. */
  agents: number
  waitingOnAgents: boolean
}) {
  const wordWidth = look.word.length * 6.6 + 16
  // Only a session that is just waiting on its agents swaps its message count for that; otherwise the flowing lines already show them.
  const agentsText = agents > 0 && waitingOnAgents ? `Waiting on ${agents} ${agents === 1 ? 'agent' : 'agents'}` : null
  const meta = [kind ?? relation, kind ? null : agentsText ?? messages, model].filter(Boolean).join(' · ')
  const detail = [branch, sessionId.slice(0, 8)].filter(Boolean).join(' · ')
  return (
    <>
      <Dot cx={21} cy={28} r={5} color={look.dot} pulse={pulse} />
      <text x={36} y={33} fill={look.ink} className="font-display text-[16px] font-semibold">
        {truncateLabel(sessionTitle, 24)}
      </text>
      <rect x={16} y={46} width={wordWidth} height={16} rx={8} fill={look.badge} />
      <text x={16 + wordWidth / 2} y={57.5} textAnchor="middle" fill={look.badgeInk} className="text-[10px] font-bold" letterSpacing="0.06em">
        {look.word}
      </text>
      <text x={16 + wordWidth + 8} y={58} fill={look.sub} className="text-[12px]">
        {truncateLabel(meta, 28)}
      </text>
      {detail && (
        <text x={16} y={82} fill={look.sub} opacity={0.85} className="font-mono text-[11px]">
          {truncateLabel(detail, 34)}
        </text>
      )}
    </>
  )
}

function SubagentLines({ title, description, look, pulse }: { title: string; description: string; look: Look; pulse: boolean }) {
  return (
    <>
      <Dot cx={15} cy={21} r={4.5} color={look.dot} pulse={pulse} />
      <text x={29} y={26} fill={look.ink} className="font-display text-[14px] font-semibold">
        {truncateLabel(title, 22)}
      </text>
      <text x={14} y={46} fill={look.sub} className="text-[12px]">
        {truncateLabel(description, 28)}
      </text>
    </>
  )
}
