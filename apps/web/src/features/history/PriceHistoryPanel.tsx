import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { settingsQuery } from '@/features/settings/settings.queries'
import { DEFAULT_PRICING, RETIRED_PRICING } from '@/features/settings/settings.types'
import { getMergedPricing } from '@/features/cost-estimation/cost-calculator'
import { priceOnDay, priceSegments, type Prices } from '@/lib/pricing/price-timeline'
import { priceEntriesQuery, usePriceEntryMutations } from './price-history.queries'
import { LinkedNote, useIsLinkedNode } from '@/features/link/LinkedNote'

const FIELDS: Array<[keyof Prices, string]> = [
  ['inputPerMTok', 'Input'],
  ['outputPerMTok', 'Output'],
  ['cacheReadPerMTok', 'Cache read'],
  ['cacheWritePerMTok', 'Cache write'],
]

const usd = (n: number) => `$${Number(n.toFixed(4))}`
const today = () => format(new Date(), 'yyyy-MM-dd')
const priceLine = (p: Prices) => FIELDS.map(([k, label]) => `${label} ${usd(p[k])}`).join(' · ')

export function PriceHistoryPanel() {
  const { data: settings } = useQuery(settingsQuery)
  const { data: allEntries = [] } = useQuery(priceEntriesQuery)
  const { add, remove } = usePriceEntryMutations()
  const readOnly = useIsLinkedNode()

  const [modelId, setModelId] = useState(DEFAULT_PRICING[0].modelId)
  const [kind, setKind] = useState<'from' | 'window'>('from')
  const [startDay, setStartDay] = useState(today)
  const [endDay, setEndDay] = useState(today)
  const [typed, setTyped] = useState<Partial<Record<keyof Prices, string>>>({})
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const base = useMemo(() => (settings ? getMergedPricing(settings)[modelId] : undefined), [settings, modelId])
  const entries = useMemo(() => allEntries.filter((e) => e.modelId === modelId), [allEntries, modelId])
  const segments = useMemo(() => (base ? priceSegments(entries, base) : []), [entries, base])
  if (!settings || !base) return null

  const current = priceOnDay(entries, base, today()).prices
  const valueOf = (key: keyof Prices) => typed[key] ?? String(current[key])

  function submit() {
    setError(null)
    const prices = {} as Prices
    for (const [key] of FIELDS) {
      const n = Number(valueOf(key))
      if (valueOf(key).trim() === '' || !Number.isFinite(n)) return setError('Every price needs a number.')
      prices[key] = n
    }
    add.mutate(
      { data: { modelId, kind, startDay, endDay: kind === 'window' ? endDay : null, ...prices, note: note.trim() || null } },
      {
        onSuccess: () => {
          setTyped({})
          setNote('')
        },
        onError: (e) => setError(e instanceof Error ? e.message : String(e)),
      },
    )
  }

  const label = (id: string) => [...DEFAULT_PRICING, ...RETIRED_PRICING].find((m) => m.modelId === id)?.displayName ?? id
  const input = 'rounded border border-gray-800 bg-gray-950 px-2 py-1 text-xs text-gray-100'

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-gray-300">Price history</h2>
      <p className="mt-1 text-[10px] text-gray-500">
        When a price changes, add it here with the day it applies from. Past days keep the price they had, and the cost
        on Stats is worked out day by day. A later entry overwrites an earlier one on the days they share, so you can
        also backdate a correction, or set a window for a cheaper period. The table below is the base price, used on
        days with no entry.
      </p>
      <LinkedNote what="price changes" />
      <div className="mt-3 space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-4 text-xs text-gray-400">
        <label className="flex items-center gap-2">
          <span>Model</span>
          <select value={modelId} onChange={(e) => setModelId(e.target.value)} className={input}>
            <optgroup label="Current">
              {DEFAULT_PRICING.map((m) => <option key={m.modelId} value={m.modelId}>{m.displayName}</option>)}
            </optgroup>
            <optgroup label="Retired">
              {RETIRED_PRICING.map((m) => <option key={m.modelId} value={m.modelId}>{m.displayName}</option>)}
            </optgroup>
          </select>
        </label>

        <div>
          <p className="mb-1 font-medium text-gray-300">Price over time</p>
          <ul className="space-y-1">
            {segments.map((s) => (
              <li key={s.fromDay} className="flex flex-wrap gap-x-3">
                <span className="w-56 text-gray-300">
                  {s.fromDay === '0000-01-01'
                    ? s.toDay
                      ? `Up to ${s.toDay}`
                      : 'All days'
                    : s.toDay
                      ? `${s.fromDay} to ${s.toDay}`
                      : `${s.fromDay} onward`}
                </span>
                <span className="font-mono">{priceLine(s.prices)}</span>
                {s.entryId === null && <span className="text-gray-600">base price</span>}
              </li>
            ))}
          </ul>
        </div>

        {entries.length > 0 && (
          <div>
            <p className="mb-1 font-medium text-gray-300">Entries, oldest first</p>
            <ul className="space-y-1">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 border-t border-gray-800 pt-1">
                  <span className="w-56 text-gray-300">
                    {e.kind === 'from' ? `From ${e.startDay}` : `${e.startDay} to ${e.endDay}`}
                  </span>
                  <span className="font-mono">{priceLine(e)}</span>
                  {e.note && <span className="italic text-gray-500">{e.note}</span>}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => remove.mutate({ data: { id: e.id } })}
                      className="ml-auto text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!readOnly && <form
          className="space-y-3 border-t border-gray-800 pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <p className="font-medium text-gray-300">Add a price change for {label(modelId)}</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={kind === 'from'} onChange={() => setKind('from')} /> From a date onward
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={kind === 'window'} onChange={() => setKind('window')} /> Only for a window
            </label>
            <label className="flex items-center gap-1.5">
              {kind === 'from' ? 'From' : 'Start'}
              <input type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)} className={input} />
            </label>
            {kind === 'window' && (
              <label className="flex items-center gap-1.5">
                End (included)
                <input type="date" value={endDay} onChange={(e) => setEndDay(e.target.value)} className={input} />
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {FIELDS.map(([key, name]) => (
              <label key={key} className="flex items-center gap-1.5">
                {name}
                <input
                  inputMode="decimal"
                  value={valueOf(key)}
                  onChange={(e) => setTyped((t) => ({ ...t, [key]: e.target.value }))}
                  className={`${input} w-20 font-mono`}
                />
              </label>
            ))}
            <span className="text-gray-600">USD per million tokens</span>
          </div>
          <label className="flex items-center gap-1.5">
            Note
            <input
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder="optional, e.g. prompts over 100K"
              className={`${input} flex-1`}
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={add.isPending}
              className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-300 hover:text-gray-100 disabled:opacity-50"
            >
              Add price change
            </button>
            {error && <span role="alert" className="text-red-400">{error}</span>}
          </div>
        </form>}
      </div>
    </div>
  )
}
