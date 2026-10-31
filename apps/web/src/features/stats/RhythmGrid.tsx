import { addDays, format, getDay, startOfDay } from 'date-fns'
import type { DailyActivity, DailyModelTokens } from '@/lib/parsers/types'
import { formatTokenCount } from '@/lib/utils/format'

const WEEKS = 26

/** The last 26 weeks, a square per day: brighter and glowing the more tokens were used. The grid takes the height it is given. */
export function RhythmGrid({
  dailyActivity,
  dailyModelTokens,
}: {
  dailyActivity: DailyActivity[]
  dailyModelTokens: DailyModelTokens[]
}) {
  const tokens = new Map<string, number>()
  for (const d of dailyModelTokens) tokens.set(d.date, Object.values(d.tokensByModel).reduce((s, t) => s + t, 0))
  const sessions = new Map(dailyActivity.map((d) => [d.date, d.sessionCount]))

  const today = startOfDay(new Date())
  const monday = addDays(today, -((getDay(today) + 6) % 7))
  const start = addDays(monday, -7 * (WEEKS - 1))

  const nonZero = [...tokens.values()].filter((t) => t > 0).sort((a, b) => a - b)
  const cut = (q: number) => nonZero[Math.min(nonZero.length - 1, Math.floor(q * nonZero.length))] ?? 0
  const t1 = cut(1 / 3)
  const t2 = cut(2 / 3)

  const cells = Array.from({ length: WEEKS * 7 }, (_, i) => {
    const date = addDays(start, i)
    const key = format(date, 'yyyy-MM-dd')
    const t = tokens.get(key) ?? 0
    const future = date > today
    const level = t === 0 ? 0 : t <= t1 ? 1 : t <= t2 ? 2 : 3
    return { key, t, level, future, sessions: sessions.get(key) ?? 0, label: format(date, 'MMM d, yyyy') }
  })

  const fill = ['var(--hms-cell)', 'color-mix(in srgb, var(--color-brand-500) 33%, transparent)', 'color-mix(in srgb, var(--color-brand-500) 60%, transparent)', 'var(--color-brand-500)']

  return (
    <div
      className="grid min-h-[110px] flex-1 gap-0.5 sm:min-h-[170px] sm:gap-1"
      style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))`, gridTemplateRows: 'repeat(7, minmax(0, 1fr))', gridAutoFlow: 'column' }}
    >
      {cells.map((c) => (
        <div
          key={c.key}
          title={c.future ? undefined : `${c.label}: ${c.sessions} ${c.sessions === 1 ? 'session' : 'sessions'}, ${formatTokenCount(c.t)} tokens`}
          className="min-h-0 rounded-md"
          style={{
            background: c.future ? 'transparent' : fill[c.level],
            boxShadow: !c.future && c.level === 3 ? '0 0 8px var(--hms-glow-strong)' : undefined,
          }}
        />
      ))}
    </div>
  )
}
