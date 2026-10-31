import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { SUBSCRIPTION_TIERS } from '@/features/settings/settings.types'
import { formatUSD } from '@/lib/utils/format'
import { savingsText } from '@/lib/pricing/subscription'
import { subscriptionQuery, useSubscriptionMutations } from './subscription.queries'
import { LinkedNote, useIsLinkedNode } from '@/features/link/LinkedNote'

const tierName = (id: string) => SUBSCRIPTION_TIERS.find((t) => t.id === id)?.displayName ?? id
const input = 'min-h-10 rounded-full border border-[color:var(--hms-line)] bg-transparent px-4 text-sm text-gray-100 outline-none focus:border-brand-400'

export function SubscriptionPanel() {
  const { data } = useQuery(subscriptionQuery)
  const { add, remove } = useSubscriptionMutations()
  const readOnly = useIsLinkedNode()

  const [tier, setTier] = useState('pro')
  const [price, setPrice] = useState('20')
  const [startDay, setStartDay] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function chooseTier(id: string) {
    setTier(id)
    setPrice(String(SUBSCRIPTION_TIERS.find((t) => t.id === id)?.monthlyUSD ?? 0))
  }

  function submit() {
    setError(null)
    const monthlyUSD = Number(price)
    if (price.trim() === '' || !Number.isFinite(monthlyUSD)) return setError('The price needs a number.')
    add.mutate(
      { data: { tier, monthlyUSD, startDay, note: note.trim() || null } },
      { onSuccess: () => setNote(''), onError: (e) => setError(e instanceof Error ? e.message : String(e)) },
    )
  }

  const summary = data?.summary
  const line = summary ? savingsText(summary, formatUSD) : null

  const [adding, setAdding] = useState(false)
  const sorted = [...(data?.periods ?? [])].sort((x, y) => y.startDay.localeCompare(x.startDay) || y.id - x.id)
  const current = sorted[0]
  const day = (iso: string) => format(parseISO(iso), 'MMM d')

  return (
    <div>
      <LinkedNote what="plan and its price" />
      <section aria-label="Your plan" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]">
        <div>
          <h2 className="text-base font-semibold">Your plan</h2>
          <p className="text-[13px] text-[color:var(--hms-mute)]">
            Set on the master. Used for "You spent" on Stats. A plan lasts until the next one starts, and a part month is paid for in part.
          </p>
        </div>
        <div role="radiogroup" aria-label="Plan" className="flex flex-wrap rounded-[24px] border border-[color:var(--hms-line)] p-1">
          {SUBSCRIPTION_TIERS.map((t) => {
            const on = current?.tier === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={readOnly || add.isPending}
                onClick={() => {
                  if (on) return
                  setTier(t.id)
                  setPrice(String(t.monthlyUSD))
                  setAdding(true)
                }}
                className={`min-h-10 rounded-full border-[1.5px] px-[18px] text-[13.33px] font-medium ${
                  on ? 'border-brand-400 text-brand-400' : 'border-transparent text-[color:var(--hms-mute)] hover:text-gray-100'
                }`}
              >
                {t.displayName}
              </button>
            )
          })}
        </div>
      </section>

      <section aria-label="Plan history">
        <h2 className="mt-6 font-display text-[22px] font-semibold">Plan history</h2>
        {sorted.length === 0 && <p className="border-b border-[color:var(--hms-rule)] py-4 text-sm text-[color:var(--hms-mute)]">No plan added yet.</p>}
        {sorted.map((p, i) => (
          <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[color:var(--hms-rule)] py-4">
            <div className="min-w-0 flex-1">
              <b className="font-semibold">{tierName(p.tier)}</b>
              <span className="ml-3 text-[13px] text-[color:var(--hms-mute)]">
                {i === sorted.length - 1 && sorted.length > 1 ? `until ${day(sorted[i - 1].startDay)}` : i === 0 ? `from ${day(p.startDay)} until now` : `${day(p.startDay)} to ${day(sorted[i - 1].startDay)}`}
              </span>
              {p.note && <span className="ml-3 text-[13px] italic text-[color:var(--hms-mute)]">{p.note}</span>}
            </div>
            <span className="text-[color:var(--hms-mute)]">{p.monthlyUSD > 0 ? `${formatUSD(p.monthlyUSD)} / month` : '$0'}</span>
            {!readOnly && (
              <button type="button" onClick={() => remove.mutate({ data: { id: p.id } })} className="text-sm text-[#E56454] hover:underline">
                Delete
              </button>
            )}
          </div>
        ))}
        {!readOnly && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4 min-h-11 rounded-full border border-[color:var(--hms-line)] bg-transparent px-[18px] text-sm font-medium text-gray-100 hover:border-gray-500"
          >
            Add a plan change
          </button>
        )}
        {!readOnly && adding && (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[13px] text-[color:var(--hms-mute)]">
                Plan
                <select value={tier} onChange={(e) => chooseTier(e.target.value)} className={input}>
                  {SUBSCRIPTION_TIERS.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-[13px] text-[color:var(--hms-mute)]">
                Per month, USD
                <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={`${input} w-24 font-mono`} />
              </label>
              <label className="flex items-center gap-2 text-[13px] text-[color:var(--hms-mute)]">
                Starts
                <input type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} className={input} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-[color:var(--hms-mute)]">
              Note
              <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="optional" className={`${input} flex-1`} />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={add.isPending} className="min-h-11 rounded-full bg-brand-400 px-5 text-sm font-semibold text-gray-950 hover:bg-brand-300 disabled:opacity-50">
                Add plan
              </button>
              <button type="button" onClick={() => setAdding(false)} className="text-sm text-[color:var(--hms-mute)] hover:underline">Cancel</button>
              {error && <span role="alert" className="text-red-400">{error}</span>}
            </div>
          </form>
        )}
      </section>

      {summary && line && (
        <section aria-label="What the plan saved" className="mt-8">
          <h2 className="font-display text-[22px] font-semibold">{line}</h2>
          <p className="mt-1 text-[13px] text-[color:var(--hms-mute)]">
            Since {summary.firstDay}: usage priced at the API rates of each day came to ~{formatUSD(summary.apiUSD)}.
          </p>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-[color:var(--hms-mute)]">
                <th className="py-2 font-normal">Month</th>
                <th className="py-2 text-right font-normal">At API prices</th>
                <th className="py-2 text-right font-normal">Paid</th>
                <th className="py-2 text-right font-normal">Difference</th>
              </tr>
            </thead>
            <tbody>
              {summary.months.map((m) => {
                const diff = m.apiUSD - m.paidUSD
                return (
                  <tr key={m.month} className="border-t border-[color:var(--hms-rule)]">
                    <td className="py-3">{format(parseISO(`${m.month}-01`), 'MMM yyyy')}</td>
                    <td className="py-3 text-right tabular-nums">{formatUSD(m.apiUSD)}</td>
                    <td className="py-3 text-right tabular-nums">{formatUSD(m.paidUSD)}</td>
                    <td className="py-3 text-right tabular-nums" style={{ color: diff >= 0 ? 'var(--hms-chip-ink)' : '#E56454' }}>
                      {diff >= 0 ? '+' : '-'}{formatUSD(Math.abs(diff))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
