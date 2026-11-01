import { format, parseISO } from 'date-fns'
import { formatMoney } from '@/features/project-analytics/ProjectsTable'
import type { MonthForecast as Forecast } from '@/lib/pricing/forecast'

/** This month so far, where it is heading at API prices, and what the plan costs, so the plan's worth shows before the month ends. */
export function MonthForecast({ forecast }: { forecast: Forecast }) {
  const { soFarUSD, projectedUSD, planUSD, month, daysDone } = forecast
  const name = format(parseISO(`${month}-01`), 'MMMM')
  const worth = projectedUSD !== null && planUSD !== null ? projectedUSD / planUSD : null
  const cells: Array<{ label: string; value: string; note: string; tone?: boolean }> = [
    { label: `${name} so far`, value: `~${formatMoney(soFarUSD)}`, note: 'at API prices' },
    projectedUSD !== null
      ? { label: 'On pace for', value: `~${formatMoney(projectedUSD)}`, note: `by the end of ${name}, from ${daysDone} finished days` }
      : { label: 'On pace for', value: 'Too early', note: 'a projection needs a few finished days' },
  ]
  if (planUSD !== null) {
    cells.push({ label: 'Your plan', value: formatMoney(planUSD), note: 'per month' })
    if (worth !== null) {
      cells.push({
        label: 'At this pace',
        value: worth >= 1.05 ? `${worth >= 10 ? Math.round(worth) : worth.toFixed(1)}x` : 'Not yet',
        note: worth >= 1.05 ? 'what the plan costs, in usage' : 'the plan costs more than the usage',
        tone: worth >= 1.05,
      })
    }
  }
  return (
    <section aria-label="This month" className="border-b border-[color:var(--hms-rule)] pb-7">
      <h2 className="mb-3.5 font-display text-xl font-semibold">This month</h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label}>
            <div className="text-[color:var(--hms-mute)]">{c.label}</div>
            <div className="font-display text-[32px] font-bold leading-[1.15]" style={c.tone ? { color: 'var(--hms-chip-ink)' } : undefined}>
              {c.value}
            </div>
            <div className="text-[13px] text-[color:var(--hms-mute)]">{c.note}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
