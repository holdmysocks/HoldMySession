import { useId, type ReactNode } from 'react'
import { format, parseISO } from 'date-fns'
import type { DailyModelTokens } from '@/lib/parsers/types'
import { modelSeries } from './model-series'

const W = 900
const H = 220

/** Daily tokens stacked by model: a glowing line and a fading fill for each, and a legend above. */
export function ModelsArea({ data, controls }: { data: DailyModelTokens[]; controls?: ReactNode }) {
  const uid = useId().replace(/:/g, '')
  const { days, series } = modelSeries(data)
  if (series.length === 0 || days.length === 0) {
    return (
      <div>
        {controls}
        <p className="py-10 text-center text-sm text-gray-500">No token data for this range</p>
      </div>
    )
  }

  // One day still draws a flat band, so it is repeated.
  const n = Math.max(days.length, 2)
  const at = (values: number[], i: number) => values[Math.min(i, values.length - 1)]
  const stacks = series.map((_, k) =>
    Array.from({ length: n }, (_, i) => series.slice(0, k + 1).reduce((s, m) => s + at(m.values, i), 0)),
  )
  const max = Math.max(...stacks[stacks.length - 1], 1)
  const pt = (v: number, i: number) => `${((i / (n - 1)) * W).toFixed(1)},${(H - 4 - (v / max) * (H - 24)).toFixed(1)}`
  const line = (tops: number[]) => 'M' + tops.map((v, i) => pt(v, i)).join(' L')
  const area = (tops: number[], bottoms: number[] | null) =>
    line(tops) + ' L' + (bottoms ?? tops.map(() => 0)).map((v, i) => pt(v, i)).reverse().join(' L') + ' Z'

  const labelAt = (f: number) => format(parseISO(days[Math.min(days.length - 1, Math.round(f * (days.length - 1)))]), 'MMM d')
  const ticks = days.length > 3 ? [0, 1 / 3, 2 / 3, 1] : [0, 1]

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap gap-5 text-[13px] text-[color:var(--hms-mute)]">
          {series.map((m) => (
            <span key={m.name} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color, boxShadow: `0 0 8px ${m.color}` }} />
              {m.name}
            </span>
          ))}
        </div>
        {controls}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-[220px] w-full"
        role="img"
        aria-label="Stacked area chart of daily tokens by model"
      >
        <defs>
          {series.map((m, k) => (
            <linearGradient key={m.name} id={`${uid}-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={m.color} stopOpacity={k === 0 ? 0.6 : 0.5} />
              <stop offset="1" stopColor={m.color} stopOpacity="0.04" />
            </linearGradient>
          ))}
        </defs>
        {[...series].reverse().map((m, r) => {
          const k = series.length - 1 - r
          return <path key={m.name} d={area(stacks[k], k > 0 ? stacks[k - 1] : null)} fill={`url(#${uid}-${k})`} />
        })}
        {[...series].reverse().map((m, r) => {
          const k = series.length - 1 - r
          return (
            <path
              key={m.name}
              d={line(stacks[k])}
              fill="none"
              stroke={m.line}
              strokeWidth={k === 0 ? 2.5 : 2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ filter: `drop-shadow(0 0 6px ${m.color})` }}
            />
          )
        })}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-[color:var(--hms-mute)]">
        {ticks.map((f) => (
          <span key={f}>{labelAt(f)}</span>
        ))}
      </div>
    </div>
  )
}
