import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import type {
  Turn,
  AgentInvocation,
  SkillInvocation,
  SessionError,
} from '@/lib/parsers/types'
import type { TooltipItem } from './timeline-types'
import { buildTimelineChartData } from './timeline-data'
import { TimelineChart, LEFT_MARGIN, RIGHT_MARGIN } from './TimelineChart'
import { formatRange, formatSpan } from './timeline-scale'
import { TimelineTooltip } from './TimelineTooltip'
import { TimelineLegend } from './TimelineLegend'

/**
 * Zoom steps. They grow by about half each time and reach far, since a session that runs for weeks
 * needs more than a few times magnification to read hours.
 */
const ZOOM_LEVELS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64]

interface Props {
  turns: Turn[]
  agents: AgentInvocation[]
  skills: SkillInvocation[]
  errors: SessionError[]
}

export function TimelineEventsChart({
  turns,
  agents,
  skills,
  errors,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [zoomIndex, setZoomIndex] = useState(0)
  const zoom = ZOOM_LEVELS[zoomIndex]
  // The chart scrolls sideways. This is how far, so the heading can say what time is on screen.
  const [scroll, setScroll] = useState({ left: 0, view: 0 })
  // Where the pointer was in the chart when the wheel zoomed it, so that point stays under the pointer.
  const zoomAnchor = useRef<{ fraction: number; offset: number } | null>(null)
  const [tooltip, setTooltip] = useState<{
    item: TooltipItem
    position: { x: number; y: number }
  } | null>(null)

  // Measure container width
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setWidth(entry.contentRect.width)
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const chartData = useMemo(
    () => buildTimelineChartData(turns, agents, skills, errors),
    [turns, agents, skills, errors],
  )

  const zoomBy = useCallback((direction: 1 | -1) => {
    setZoomIndex((index) => Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index + direction)))
  }, [])

  // Ctrl or Cmd and the wheel zoom around the pointer. A plain wheel still scrolls the page.
  // The listener is added by hand because React's wheel listeners cannot stop the page scrolling.
  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    function handleWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault()
      const offset = event.clientX - element!.getBoundingClientRect().left
      zoomAnchor.current = { fraction: (element!.scrollLeft + offset) / element!.scrollWidth, offset }
      zoomBy(event.deltaY < 0 ? 1 : -1)
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [zoomBy, width])

  // After the chart is redrawn at the new zoom, put the remembered point back under the pointer.
  useLayoutEffect(() => {
    const element = containerRef.current
    const anchor = zoomAnchor.current
    if (!element || !anchor) return
    element.scrollLeft = anchor.fraction * element.scrollWidth - anchor.offset
    zoomAnchor.current = null
  }, [zoomIndex])

  function handleScroll() {
    const element = containerRef.current
    if (element) setScroll({ left: element.scrollLeft, view: element.clientWidth })
  }

  // The times at the edges of what is on screen, from the chart's own margins.
  const chartWidth = Math.max(width * zoom, 400)
  const innerWidth = chartWidth - LEFT_MARGIN - RIGHT_MARGIN
  const span = chartData.endMs - chartData.startMs
  const timeAt = (px: number) =>
    chartData.startMs + Math.min(1, Math.max(0, (px - LEFT_MARGIN) / innerWidth)) * span
  const visible =
    zoom > 1 && span > 0 && scroll.view > 0
      ? formatRange(timeAt(scroll.left), timeAt(scroll.left + scroll.view))
      : null

  // Collect all tool names for legend (main lane)
  const allToolNames = useMemo(() => {
    const names: string[] = chartData.mainLane.map((e) => e.toolName)
    // Count frequency and return sorted by most common
    const freq: Record<string, number> = {}
    for (const n of names) {
      freq[n] = (freq[n] ?? 0) + 1
    }
    return Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name)
  }, [chartData])

  const handleHover = (
    item: TooltipItem | null,
    position: { x: number; y: number },
  ) => {
    if (item) {
      setTooltip({ item, position })
    } else {
      setTooltip(null)
    }
  }

  if (turns.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        No timeline data available
      </div>
    )
  }

  // Summary stats
  const agentToolUseIds = new Set(agents.map((a) => a.toolUseId))
  const skillToolUseIds = new Set(skills.map((s) => s.toolUseId))
  let userCommands = 0
  let aiResponses = 0
  let toolCalls = 0
  for (const turn of turns) {
    if (turn.type === 'user' && turn.message?.trim()) userCommands++
    if (turn.type === 'assistant') {
      aiResponses++
      for (const tc of turn.toolCalls) {
        if (!agentToolUseIds.has(tc.toolUseId) && !skillToolUseIds.has(tc.toolUseId)) {
          toolCalls++
        }
      }
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      {/* Header stats */}
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <StatBadge label="User commands" value={userCommands} color="blue" />
        <StatBadge label="AI responses" value={aiResponses} color="purple" />
        {toolCalls > 0 && (
          <StatBadge label="Tool calls" value={toolCalls} color="gray" />
        )}
        {agents.length > 0 && (
          <StatBadge label="Agents" value={agents.length} color="indigo" />
        )}
        {skills.length > 0 && (
          <StatBadge label="Skills" value={skills.length} color="amber" />
        )}
        {errors.length > 0 && (
          <StatBadge label="Errors" value={errors.length} color="red" />
        )}
      </div>

      {/* Legend + Zoom controls */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex-1">
          {allToolNames.length > 0 && (
            <TimelineLegend toolNames={allToolNames} />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {zoom > 1 && (
            <button
              type="button"
              onClick={() => setZoomIndex(0)}
              className="mr-1 rounded bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400 transition-colors hover:bg-gray-700"
              title="Reset zoom"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={() => zoomBy(-1)}
            disabled={zoomIndex === 0}
            className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-30"
            title="Zoom out"
          >
            −
          </button>
          <span className="min-w-[3rem] text-center text-[10px] tabular-nums text-gray-500">
            {zoom === 1 ? 'Fit' : `${zoom}x`}
          </span>
          <button
            type="button"
            onClick={() => zoomBy(1)}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300 transition-colors hover:bg-gray-700 disabled:opacity-30"
            title="Zoom in (or hold Ctrl and scroll)"
          >
            +
          </button>
        </div>
      </div>

      {/* What the chart covers, and when zoomed in, what part of it is on screen */}
      {span > 0 && (
        <p className="mb-2 text-xs text-gray-500">
          <span className="text-gray-400">{formatRange(chartData.startMs, chartData.endMs)}</span>
          <span className="mx-1.5 text-gray-700">·</span>
          {formatSpan(span)}
          {visible && (
            <>
              <span className="mx-1.5 text-gray-700">·</span>
              <span data-visible-range>showing {visible}</span>
            </>
          )}
        </p>
      )}

      {/* Chart container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="relative overflow-x-auto rounded-lg border border-gray-800/70 bg-gray-950/30 pb-1"
      >
        {width > 0 && (
          <>
            <TimelineChart
              data={chartData}
              width={chartWidth}
              onHover={handleHover}
            />
            {tooltip && (
              <TimelineTooltip
                item={tooltip.item}
                position={tooltip.position}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: 'blue' | 'purple' | 'gray' | 'indigo' | 'amber' | 'red'
}) {
  const colorMap = {
    blue: 'bg-brand-500/15 text-brand-400',
    purple: 'bg-purple-500/15 text-purple-400',
    gray: 'bg-gray-800 text-gray-300',
    indigo: 'bg-indigo-500/15 text-indigo-400',
    amber: 'bg-amber-500/15 text-amber-400',
    red: 'bg-red-500/15 text-red-400',
  }

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`rounded-md px-2 py-1 text-sm font-bold tabular-nums ${colorMap[color]}`}
      >
        {value}
      </span>
      <span className="text-[11px] text-gray-500">{label}</span>
    </div>
  )
}
