import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { SUBSCRIPTION_TIERS } from '@/features/settings/settings.types'
import { formatUSD } from '@/lib/utils/format'
import { savingsText } from '@/lib/pricing/subscription'
import { subscriptionQuery, useSubscriptionMutations } from './subscription.queries'
import { LinkedNote, useIsLinkedNode } from '@/features/link/LinkedNote'

const tierName = (id: string) => SUBSCRIPTION_TIERS.find((t) => t.id === id)?.displayName ?? id
const input = 'rounded border border-gray-800 bg-gray-950 px-2 py-1 text-xs text-gray-100'

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

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-gray-300">Subscription</h2>
      <p className="mt-1 text-[10px] text-gray-500">
        Add each plan you have paid for with the day it started, and the price per month. A plan lasts until the next one
        starts. The dashboard compares what the plan cost with what the same usage would have cost at API prices. A part
        month is paid for in part. Choose API Only for pay-as-you-go, which saves nothing by definition.
      </p>
      <LinkedNote what="plan and its price" />
      <div className="mt-3 space-y-4 rounded-xl border border-gray-800 bg-gray-900/50 p-4 text-xs text-gray-400">
        {data && data.periods.length > 0 && (
          <ul className="space-y-1">
            {data.periods.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3">
                <span className="w-44 text-gray-300">From {p.startDay}</span>
                <span className="text-gray-200">{tierName(p.tier)}</span>
                <span className="font-mono">{formatUSD(p.monthlyUSD)}/mo</span>
                {p.note && <span className="italic text-gray-500">{p.note}</span>}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => remove.mutate({ data: { id: p.id } })}
                    className="ml-auto text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {data && data.periods.length === 0 && <p>No plan added yet.</p>}

        {summary && line && (
          <div>
            <p className="font-medium text-gray-200">{line}</p>
            <p className="text-[10px] text-gray-500">
              Since {summary.firstDay}: usage priced at the API rates of each day came to ~{formatUSD(summary.apiUSD)}.
            </p>
            <table className="mt-2 w-full text-left">
              <thead>
                <tr className="text-gray-500">
                  <th className="py-1 font-normal">Month</th>
                  <th className="py-1 text-right font-normal">At API prices</th>
                  <th className="py-1 text-right font-normal">Paid</th>
                  <th className="py-1 text-right font-normal">Difference</th>
                </tr>
              </thead>
              <tbody>
                {summary.months.map((m) => {
                  const diff = m.apiUSD - m.paidUSD
                  return (
                    <tr key={m.month} className="border-t border-gray-800">
                      <td className="py-1 text-gray-300">{format(parseISO(`${m.month}-01`), 'MMM yyyy')}</td>
                      <td className="py-1 text-right font-mono">{formatUSD(m.apiUSD)}</td>
                      <td className="py-1 text-right font-mono">{formatUSD(m.paidUSD)}</td>
                      <td className={`py-1 text-right font-mono ${diff >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                        {diff >= 0 ? '+' : '-'}{formatUSD(Math.abs(diff))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!readOnly && <form
          className="space-y-3 border-t border-gray-800 pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <p className="font-medium text-gray-300">Add a plan</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5">
              Plan
              <select value={tier} onChange={(e) => chooseTier(e.target.value)} className={input}>
                {SUBSCRIPTION_TIERS.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              Per month, USD
              <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={`${input} w-20 font-mono`} />
            </label>
            <label className="flex items-center gap-1.5">
              Starts
              <input type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} className={input} />
            </label>
          </div>
          <label className="flex items-center gap-1.5">
            Note
            <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="optional" className={`${input} flex-1`} />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={add.isPending}
              className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-300 hover:text-gray-100 disabled:opacity-50"
            >
              Add plan
            </button>
            {error && <span role="alert" className="text-red-400">{error}</span>}
          </div>
        </form>}
      </div>
    </div>
  )
}
