import type { DailyModelTokens } from '@/lib/parsers/types'
import { modelSeries } from './model-series'

/** Each top model's share of the tokens, with a glowing bar, and the rest as "Other". */
export function ModelShare({ data }: { data: DailyModelTokens[] }) {
  const { series, grand } = modelSeries(data)
  if (series.length === 0) return <p className="text-sm text-gray-500">No model usage yet</p>
  return (
    <div className="flex flex-col gap-4">
      {series.map((m) => {
        const share = grand > 0 ? (m.total / grand) * 100 : 0
        return (
          <div key={m.name}>
            <div className="mb-[7px] flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-[9px]">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: m.color, boxShadow: `0 0 8px ${m.color}` }} />
                <span>{m.name}</span>
                {m.note && <span className="text-xs text-[color:var(--hms-mute)]">{m.note}</span>}
              </span>
              <b className="font-semibold">{Math.round(share)}%</b>
            </div>
            <div className="h-2.5 rounded-[5px] bg-[color:var(--hms-track)]">
              <div
                className="h-2.5 rounded-[5px]"
                style={{ width: `${Math.max(share, 1)}%`, background: m.color, boxShadow: `0 0 12px ${m.color}88` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
