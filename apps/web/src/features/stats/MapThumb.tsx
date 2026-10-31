import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { layoutProjectMap } from '@/lib/map/layout'
import { projectMapQuery } from '@/features/project-map/project-map.queries'

const FILL: Record<string, [string, string]> = {
  'needs-you': ['#5C4A0E', '#FACC15'],
  active: ['#0F4A2C', '#3DDC84'],
  running: ['#0F4A2C', '#3DDC84'],
  completed: ['#2B2466', '#9B8CFF'],
  idle: ['#1D1C1A', '#ffffff2a'],
}

/** A small live picture of one project's map. The card is a link to the map on that project. */
export function MapThumb({ projectKey, machineId, mapValue }: { projectKey: string; machineId?: string; mapValue: string }) {
  const { data } = useQuery(projectMapQuery(projectKey, machineId))
  const layout = data ? layoutProjectMap(data) : null
  const sessions = layout?.nodes.filter((n) => n.kind === 'session') ?? []
  const count = (s: string) => sessions.filter((n) => n.status === s || (s === 'active' && n.status === 'running')).length
  const BOX_W = 394
  const BOX_H = 92
  const scale = layout && layout.nodes.length > 0 ? Math.min(BOX_W / layout.width, BOX_H / layout.height, 0.5) : 1

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
      <div className="relative h-[92px] overflow-hidden" aria-hidden="true">
        {layout && layout.nodes.length > 0 && (
          <svg width={BOX_W} height={BOX_H} viewBox={`0 0 ${BOX_W} ${BOX_H}`}>
            <g transform={`scale(${scale})`}>
              {layout.edges.map((e) => (
                <path key={e.id} d={e.d} fill="none" stroke="#3DDC8477" strokeWidth={2 / scale} />
              ))}
              {layout.nodes.map((n) => {
                const [bg, edge] = FILL[n.status] ?? FILL.idle
                return (
                  <rect
                    key={n.id}
                    x={n.x}
                    y={n.y}
                    width={n.width}
                    height={n.height}
                    rx={10}
                    fill={bg}
                    stroke={edge}
                    strokeWidth={1.5 / scale}
                  />
                )
              })}
            </g>
          </svg>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[color:var(--hms-sub)]">
        <span><span style={{ color: '#3DDC84' }}>●</span> {count('active')} running</span>
        <span><span style={{ color: '#9B8CFF' }}>●</span> {count('completed')} done</span>
        <span><span style={{ color: '#8F8D85' }}>●</span> {count('idle')} idle</span>
      </div>
    </Link>
  )
}
