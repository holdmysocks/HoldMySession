import { useRef, useCallback, useEffect, useState } from 'react'
import type {
  TimelineChartData,
  TooltipItem,
} from './timeline-types'
import { getToolColor } from './timeline-colors'
import { buildTimeScale, formatCursorTime, type TimeBand } from './timeline-scale'

export const LEFT_MARGIN = 90
export const RIGHT_MARGIN = 16
/** Room above the lanes for the axis: a row of day, month or year bands, then the tick labels. */
const TOP_MARGIN = 44
const BAND_HEIGHT = 16
const LANE_HEIGHT = 32
const LANE_GAP = 8
const DOT_RADIUS = 4

interface Props {
  data: TimelineChartData
  width: number
  onHover: (item: TooltipItem | null, position: { x: number; y: number }) => void
}

/** The band's name if it fits in the band: the long form, then the short one, else nothing. */
function bandText(band: TimeBand, widthPx: number): string | null {
  const charPx = 6.1
  if (band.label.length * charPx + 12 <= widthPx) return band.label
  if (band.shortLabel.length * charPx + 12 <= widthPx) return band.shortLabel
  return null
}

export function TimelineChart({ data, width, onHover }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const chartWidth = width
  const innerWidth = chartWidth - LEFT_MARGIN - RIGHT_MARGIN

  // Calculate total height
  const hasSkills = data.skillMarkers.length > 0
  const hasErrors = data.errorMarkers.length > 0
  let currentY = TOP_MARGIN

  const mainLaneY = currentY
  currentY += LANE_HEIGHT

  // Every dispatch shares one lane, so many agents do not stack into many rows.
  const agentRuns = data.agentLanes.filter((a) => Number.isFinite(a.startX) && Number.isFinite(a.endX))
  let agentRowY = 0
  if (agentRuns.length > 0) {
    currentY += LANE_GAP
    agentRowY = currentY
    currentY += LANE_HEIGHT
  }

  let skillRowY = 0
  if (hasSkills) {
    currentY += LANE_GAP
    skillRowY = currentY
    currentY += LANE_HEIGHT
  }

  let errorRowY = 0
  if (hasErrors) {
    currentY += LANE_GAP
    errorRowY = currentY
    currentY += LANE_HEIGHT
  }

  const totalHeight = Math.max(currentY + 8, 80)

  function toX(relativeX: number): number {
    return LEFT_MARGIN + relativeX * innerWidth
  }

  const getPosition = useCallback(
    (event: React.MouseEvent) => {
      if (!svgRef.current) return { x: 0, y: 0 }
      const rect = svgRef.current.getBoundingClientRect()
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
    },
    [],
  )

  // The axis picks hours, days, weeks, months or years from the span the chart shows, so it follows zoom.
  const scale = buildTimeScale(data.startMs, data.endMs, innerWidth)
  const xOf = (ms: number) => toX((ms - data.startMs) / Math.max(data.endMs - data.startMs, 1))

  return (
    <svg
      ref={svgRef}
      width={chartWidth}
      height={totalHeight}
      className="select-none"
      role="img"
      aria-label="Session timeline showing tool calls, agent runs, and skill invocations"
      onMouseLeave={() => onHover(null, { x: 0, y: 0 })}
    >
      {/* Time axis: a row of bands naming the day, month or year, then ticks with their labels */}
      {scale.bands.map((band, i) => {
        const x0 = xOf(band.startMs)
        const bandWidth = xOf(band.endMs) - x0
        const text = bandText(band, bandWidth)
        return (
          <g key={band.startMs}>
            <rect
              x={x0}
              y={2}
              width={bandWidth}
              height={BAND_HEIGHT}
              className={i % 2 === 0 ? 'fill-gray-800/50' : 'fill-gray-800/20'}
            />
            {text && (
              <text x={x0 + 6} y={2 + BAND_HEIGHT - 5} className="fill-gray-300 text-[10px] font-medium">
                {text}
              </text>
            )}
          </g>
        )
      })}
      <line
        x1={LEFT_MARGIN}
        y1={TOP_MARGIN - 4}
        x2={chartWidth - RIGHT_MARGIN}
        y2={TOP_MARGIN - 4}
        stroke="var(--color-gray-700)"
        strokeWidth={1}
      />
      {scale.ticks.map((tick) => {
        const x = xOf(tick.ms)
        return (
          <g key={tick.ms}>
            {/* A faint line down through the lanes, so an event can be read against the axis. */}
            <line
              x1={x}
              y1={TOP_MARGIN - 4}
              x2={x}
              y2={totalHeight - 4}
              stroke={tick.major ? 'var(--color-gray-600)' : 'var(--color-gray-800)'}
              strokeWidth={1}
              strokeDasharray={tick.major ? undefined : '2,4'}
            />
            <line
              x1={x}
              y1={TOP_MARGIN - 9}
              x2={x}
              y2={TOP_MARGIN - 4}
              stroke={tick.major ? 'var(--color-gray-400)' : 'var(--color-gray-600)'}
              strokeWidth={1}
            />
            <text
              x={x}
              y={TOP_MARGIN - 12}
              textAnchor="middle"
              className={tick.major ? 'fill-gray-200 text-[10px] font-semibold' : 'fill-gray-500 text-[10px]'}
            >
              {tick.label}
            </text>
          </g>
        )
      })}

      {/* Main lane */}
      <text
        x={4}
        y={mainLaneY + LANE_HEIGHT / 2 + 4}
        className="fill-gray-500 text-[11px] font-medium"
      >
        Main
      </text>
      <line
        x1={LEFT_MARGIN}
        y1={mainLaneY + LANE_HEIGHT / 2}
        x2={chartWidth - RIGHT_MARGIN}
        y2={mainLaneY + LANE_HEIGHT / 2}
        stroke="var(--color-gray-800)"
        strokeWidth={1}
        strokeDasharray="2,4"
      />
      {data.mainLane.map((event) => (
        <circle
          key={event.toolUseId}
          cx={toX(event.relativeX)}
          cy={mainLaneY + LANE_HEIGHT / 2}
          r={DOT_RADIUS}
          fill={getToolColor(event.toolName)}
          opacity={0.85}
          className="cursor-pointer transition-transform hover:opacity-100"
          onMouseEnter={(e) =>
            onHover(
              {
                kind: 'tool',
                toolName: event.toolName,
                timestamp: new Date(event.timestampMs).toISOString(),
                toolUseId: event.toolUseId,
              },
              getPosition(e),
            )
          }
          onMouseLeave={() => onHover(null, { x: 0, y: 0 })}
        >
          <title>{event.toolName}</title>
        </circle>
      ))}

      {/* Agents: one lane, one translucent bar per dispatch */}
      {agentRuns.length > 0 && (
        <>
          <text x={4} y={agentRowY + LANE_HEIGHT / 2 + 4} className="fill-indigo-400/70 text-[11px] font-medium">
            Agents
          </text>
          <line
            x1={LEFT_MARGIN}
            y1={agentRowY + LANE_HEIGHT / 2}
            x2={chartWidth - RIGHT_MARGIN}
            y2={agentRowY + LANE_HEIGHT / 2}
            stroke="var(--color-gray-800)"
            strokeWidth={1}
            strokeDasharray="2,4"
          />
          {agentRuns.map((lane, i) => {
            const barX = toX(lane.startX)
            return (
              <rect
                key={`${lane.subagentType}-${i}`}
                x={barX}
                y={agentRowY + 8}
                width={Math.max(toX(lane.endX) - barX, 6)}
                height={LANE_HEIGHT - 16}
                rx={4}
                fill="rgba(99, 102, 241, 0.25)"
                stroke="rgba(99, 102, 241, 0.5)"
                strokeWidth={1}
                className="cursor-pointer hover:fill-indigo-500/40"
                onMouseEnter={(e) => onHover({ kind: 'agent', agent: lane }, getPosition(e))}
                onMouseLeave={() => onHover(null, { x: 0, y: 0 })}
              >
                <title>
                  {lane.subagentType}: {lane.description}
                </title>
              </rect>
            )
          })}
        </>
      )}

      {/* Skill markers row */}
      {hasSkills && (
        <>
          <text
            x={4}
            y={skillRowY + LANE_HEIGHT / 2 + 4}
            className="fill-amber-400/70 text-[11px] font-medium"
          >
            Skills
          </text>
          <line
            x1={LEFT_MARGIN}
            y1={skillRowY + LANE_HEIGHT / 2}
            x2={chartWidth - RIGHT_MARGIN}
            y2={skillRowY + LANE_HEIGHT / 2}
            stroke="var(--color-gray-800)"
            strokeWidth={1}
            strokeDasharray="2,4"
          />
          {data.skillMarkers.map((skill, i) => {
            const cx = toX(skill.relativeX)
            const cy = skillRowY + LANE_HEIGHT / 2
            const size = 5
            return (
              <polygon
                key={`${skill.skill}-${i}`}
                points={`${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`}
                fill="#fbbf24"
                opacity={0.85}
                className="cursor-pointer hover:opacity-100"
                onMouseEnter={(e) =>
                  onHover(
                    {
                      kind: 'skill',
                      skill: skill.skill,
                      args: skill.args,
                      timestamp: new Date(skill.timestampMs).toISOString(),
                    },
                    getPosition(e),
                  )
                }
                onMouseLeave={() => onHover(null, { x: 0, y: 0 })}
              >
                <title>/{skill.skill}</title>
              </polygon>
            )
          })}
        </>
      )}

      {/* Error markers row */}
      {hasErrors && (
        <>
          <text
            x={4}
            y={errorRowY + LANE_HEIGHT / 2 + 4}
            className="fill-red-400/70 text-[11px] font-medium"
          >
            Errors
          </text>
          <line
            x1={LEFT_MARGIN}
            y1={errorRowY + LANE_HEIGHT / 2}
            x2={chartWidth - RIGHT_MARGIN}
            y2={errorRowY + LANE_HEIGHT / 2}
            stroke="var(--color-gray-800)"
            strokeWidth={1}
            strokeDasharray="2,4"
          />
          {data.errorMarkers.map((err, i) => {
            const cx = toX(err.relativeX)
            const cy = errorRowY + LANE_HEIGHT / 2
            const size = 5
            return (
              <g
                key={`err-${i}`}
                className="cursor-pointer hover:opacity-100"
                opacity={0.85}
                onMouseEnter={(e) =>
                  onHover(
                    {
                      kind: 'error',
                      message: err.message,
                      type: err.type,
                      timestamp: new Date(err.timestampMs).toISOString(),
                    },
                    getPosition(e),
                  )
                }
                onMouseLeave={() => onHover(null, { x: 0, y: 0 })}
              >
                <line
                  x1={cx - size}
                  y1={cy - size}
                  x2={cx + size}
                  y2={cy + size}
                  stroke="#f87171"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <line
                  x1={cx + size}
                  y1={cy - size}
                  x2={cx - size}
                  y2={cy + size}
                  stroke="#f87171"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <title>{err.type}: {err.message}</title>
              </g>
            )
          })}
        </>
      )}
          <HoverGuide
        svgRef={svgRef}
        left={LEFT_MARGIN}
        right={chartWidth - RIGHT_MARGIN}
        top={TOP_MARGIN - 4}
        bottom={totalHeight - 4}
        startMs={data.startMs}
        endMs={data.endMs}
      />
    </svg>
  )
}

/**
 * A line that follows the pointer along the chart, with the exact time at that point. It keeps its
 * own state, so moving the pointer does not redraw the chart.
 */
function HoverGuide({
  svgRef,
  left,
  right,
  top,
  bottom,
  startMs,
  endMs,
}: {
  svgRef: React.RefObject<SVGSVGElement | null>
  left: number
  right: number
  top: number
  bottom: number
  startMs: number
  endMs: number
}) {
  const [x, setX] = useState<number | null>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const move = (event: MouseEvent) => {
      const px = event.clientX - svg.getBoundingClientRect().left
      setX(px >= left && px <= right ? px : null)
    }
    const leave = () => setX(null)
    svg.addEventListener('mousemove', move)
    svg.addEventListener('mouseleave', leave)
    return () => {
      svg.removeEventListener('mousemove', move)
      svg.removeEventListener('mouseleave', leave)
    }
  }, [svgRef, left, right])

  if (x === null || !(endMs > startMs)) return null
  const text = formatCursorTime(startMs + ((x - left) / (right - left)) * (endMs - startMs))
  const width = text.length * 6.2 + 14
  const boxX = Math.min(Math.max(x - width / 2, 2), right + 14 - width)
  return (
    <g pointerEvents="none" data-hover-guide>
      <line x1={x} y1={top} x2={x} y2={bottom} className="stroke-brand-400/60" strokeWidth={1} strokeDasharray="3,3" />
      <rect x={boxX} y={1} width={width} height={BAND_HEIGHT + 2} rx={4} className="fill-gray-950 stroke-brand-500/70" />
      <text x={boxX + width / 2} y={13} textAnchor="middle" className="fill-gray-100 font-mono text-[10px]">
        {text}
      </text>
    </g>
  )
}

