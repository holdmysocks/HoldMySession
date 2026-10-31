import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { projectMapQuery } from '@/features/project-map/project-map.queries'

const FILL = {
  active: ['#0F4A2C', '#3DDC84'],
  done: ['#2B2466', '#9B8CFF'],
  idle: ['#1D1C1A', '#ffffff33'],
} as const

const CARD_W = 76
const CARD_H = 24
const GAP = 22
const MAX_PER_ROW = 4

type Look = keyof typeof FILL

function Card({ x, y, look, w = CARD_W, h = CARD_H, rx = 8 }: { x: number; y: number; look: Look; w?: number; h?: number; rx?: number }) {
  const [bg, edge] = FILL[look]
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={rx}
      fill={bg}
      stroke={edge}
      strokeWidth={1.5}
      style={look === 'active' ? { filter: 'drop-shadow(0 0 5px #3DDC8466)' } : undefined}
    />
  )
}

/**
 * A small stand-in for the project's map, drawn from how many sessions are running, done and idle, and
 * never more than fits: up to four running cards with a subagent under the first two, then up to four
 * done and idle cards, then a count of the rest. It is a picture of the mix, not of the real layout.
 */
function Sketch({ running, done, idle }: { running: number; done: number; idle: number }) {
  const showRun = Math.min(running, MAX_PER_ROW)
  const showDone = Math.min(done, 2)
  const showIdle = Math.min(idle, MAX_PER_ROW - showDone)
  const second: Look[] = [...Array<Look>(showDone).fill('done'), ...Array<Look>(showIdle).fill('idle')]
  const hidden = running - showRun + (done - showDone) + (idle - showIdle)
  const rowW = (n: number) => n * CARD_W + Math.max(0, n - 1) * GAP
  const W = 394
  const runY = 0
  const childY = runY + CARD_H + 6
  const secondY = showRun > 0 ? 50 : 28
  const x0 = (n: number) => Math.round((W - rowW(n)) / 2)
  const runX = x0(showRun)

  return (
    <svg width={W} height={92} viewBox={`0 0 ${W} 92`} aria-hidden="true">
      {Array.from({ length: Math.min(showRun, 2) }, (_, i) => {
        const cx = runX + i * (CARD_W + GAP) + CARD_W / 2
        return (
          <g key={`child-${i}`}>
            <path d={`M${cx} ${runY + CARD_H} V${childY}`} stroke="#3DDC8477" strokeWidth={2} />
            <Card x={cx - 30} y={childY} look="active" w={60} h={14} rx={6} />
          </g>
        )
      })}
      {Array.from({ length: showRun }, (_, i) => (
        <Card key={`run-${i}`} x={runX + i * (CARD_W + GAP)} y={runY} look="active" />
      ))}
      {second.map((look, i) => (
        <Card key={`other-${i}`} x={x0(second.length) + i * (CARD_W + GAP)} y={secondY} look={look} />
      ))}
      {hidden > 0 && (
        <text x={W - 8} y={90} textAnchor="end" fill="#A8A69C" className="text-[12px]">
          +{hidden} more
        </text>
      )}
    </svg>
  )
}

/** A small live picture of one project's map. The card is a link to the map on that project. */
export function MapThumb({ projectKey, machineId, mapValue }: { projectKey: string; machineId?: string; mapValue: string }) {
  const { data } = useQuery(projectMapQuery(projectKey, machineId))
  const sessions = (data?.nodes ?? []).filter((n) => n.kind === 'session')
  const count = (s: string) => sessions.filter((n) => n.status === s || (s === 'active' && n.status === 'running') || (s === 'idle' && n.status === 'needs-you')).length
  const running = count('active')
  const done = count('completed')
  const idle = count('idle')

  return (
    <Link
      to="/map"
      search={{ project: mapValue }}
      aria-label="Open this project on the map"
      className="mt-3 block min-w-0 flex-[0_1_430px] rounded-3xl border border-[color:var(--hms-line)] bg-gray-900 px-[18px] pb-4 pt-3.5"
    >
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="text-xs text-[color:var(--hms-mute)]">This project on the map</span>
        <span className="-my-2.5 inline-flex min-h-11 items-center text-sm font-semibold text-brand-400">Open the map →</span>
      </div>
      <div className="relative flex h-[92px] justify-center overflow-hidden" aria-hidden="true">
        {running + done + idle > 0 && <Sketch running={running} done={done} idle={idle} />}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[color:var(--hms-sub)]">
        <span><span style={{ color: '#3DDC84' }}>●</span> {running} running</span>
        <span><span style={{ color: '#9B8CFF' }}>●</span> {done} done</span>
        <span><span style={{ color: '#8F8D85' }}>●</span> {idle} idle</span>
      </div>
    </Link>
  )
}
