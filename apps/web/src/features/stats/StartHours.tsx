/** Session starts by hour of the day. The busiest three hours glow. */
export function StartHours({ hourCounts }: { hourCounts: Record<string, number> }) {
  const counts = Array.from({ length: 24 }, (_, i) => hourCounts[String(i)] ?? 0)
  const max = Math.max(...counts, 1)
  let best = 0
  let bestSum = -1
  for (let h = 0; h <= 21; h++) {
    const sum = counts[h] + counts[h + 1] + counts[h + 2]
    if (sum > bestSum) {
      bestSum = sum
      best = h
    }
  }
  const hasData = bestSum > 0
  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <section aria-label="When you start sessions" className="border-t border-[color:var(--hms-rule)] pt-7">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="font-display text-xl font-semibold">When you start sessions</h2>
        {hasData && (
          <span className="text-[13px] text-[color:var(--hms-mute)]">
            Busiest around{' '}
            <b className="font-semibold text-brand-400">
              {pad(best)}:00 to {pad(best + 3)}:00
            </b>
          </span>
        )}
      </div>
      <div className="grid h-[120px] items-end gap-1.5" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
        {counts.map((c, h) => {
          const peak = hasData && h >= best && h < best + 3
          return (
            <div
              key={h}
              title={`${pad(h)}:00, ${c} ${c === 1 ? 'session' : 'sessions'}`}
              style={{
                height: `${c > 0 ? Math.max(6, Math.round((c / max) * 100)) : 4}%`,
                borderRadius: '6px 6px 2px 2px',
                background: peak
                  ? 'linear-gradient(180deg, var(--color-brand-300), var(--color-brand-400))'
                  : 'linear-gradient(180deg, color-mix(in srgb, var(--color-brand-500) 60%, transparent), color-mix(in srgb, var(--color-brand-500) 30%, transparent))',
                boxShadow: peak ? '0 0 18px var(--hms-glow-strong)' : undefined,
              }}
            />
          )
        })}
      </div>
      <div className="mt-2 grid gap-1.5 text-xs text-[color:var(--hms-mute)]" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
        {counts.map((_, h) => (
          <span key={h} className="text-center">
            {h % 6 === 0 || h === 23 ? pad(h) : ''}
          </span>
        ))}
      </div>
    </section>
  )
}
