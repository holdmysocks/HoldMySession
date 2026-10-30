/**
 * Prices that change over time. A model has a base price (the built-in one, or the user's override)
 * and a list of dated entries on top of it. An entry is either "from a day onward" or "a window of
 * days". To price a day, the entries are replayed in the order they were made, and the latest one
 * covering the day wins, so a later entry overwrites an earlier one wherever they overlap. Pure, so
 * the server and the browser agree.
 */

export interface Prices {
  inputPerMTok: number
  outputPerMTok: number
  cacheReadPerMTok: number
  cacheWritePerMTok: number
}

export interface PriceEntry extends Prices {
  /** Order of creation. A higher id was made later and wins where entries overlap. */
  id: number
  modelId: string
  kind: 'from' | 'window'
  /** First day the entry covers, yyyy-MM-dd. */
  startDay: string
  /** Last day of a window, inclusive. Null for 'from', which has no end. */
  endDay: string | null
  note: string | null
  createdAt: string
}

export interface PriceSegment {
  fromDay: string
  /** Last day of the segment, or null if it runs on with no end. */
  toDay: string | null
  prices: Prices
  /** The entry that set this price, or null for the base price. */
  entryId: number | null
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function isDay(value: string): boolean {
  if (!DAY.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value)
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function covers(entry: PriceEntry, day: string): boolean {
  if (day < entry.startDay) return false
  return entry.kind === 'from' || (entry.endDay !== null && day <= entry.endDay)
}

function pick(p: Prices): Prices {
  return {
    inputPerMTok: p.inputPerMTok,
    outputPerMTok: p.outputPerMTok,
    cacheReadPerMTok: p.cacheReadPerMTok,
    cacheWritePerMTok: p.cacheWritePerMTok,
  }
}

/** The price on `day`: the latest-made entry that covers it, else the base price. `entries` are one model's. */
export function priceOnDay(entries: PriceEntry[], base: Prices, day: string): { prices: Prices; entryId: number | null } {
  let winner: PriceEntry | null = null
  for (const entry of entries) {
    if (covers(entry, day) && (winner === null || entry.id > winner.id)) winner = entry
  }
  return winner ? { prices: pick(winner), entryId: winner.id } : { prices: pick(base), entryId: null }
}

const same = (a: Prices, b: Prices) =>
  a.inputPerMTok === b.inputPerMTok &&
  a.outputPerMTok === b.outputPerMTok &&
  a.cacheReadPerMTok === b.cacheReadPerMTok &&
  a.cacheWritePerMTok === b.cacheWritePerMTok

/**
 * The price over time as runs of days with one price, from the earliest day any entry touches. The
 * last run has no end. A run is not split where an entry changes nothing, so the list is what a
 * person would call "the price changed on this day".
 */
export function priceSegments(entries: PriceEntry[], base: Prices): PriceSegment[] {
  if (entries.length === 0) return [{ fromDay: '0000-01-01', toDay: null, prices: pick(base), entryId: null }]

  const starts = new Set<string>(['0000-01-01'])
  for (const e of entries) {
    starts.add(e.startDay)
    if (e.kind === 'window' && e.endDay) starts.add(addDays(e.endDay, 1))
  }
  const days = [...starts].sort()

  const raw = days.map((day) => ({ day, ...priceOnDay(entries, base, day) }))
  const merged: PriceSegment[] = []
  for (const run of raw) {
    const last = merged[merged.length - 1]
    if (last && same(last.prices, run.prices)) continue
    if (last) last.toDay = addDays(run.day, -1)
    merged.push({ fromDay: run.day, toDay: null, prices: run.prices, entryId: run.entryId })
  }
  return merged
}

export interface UsageRow {
  day: string
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** USD for one row of usage at the prices of its day. */
export function costOfUsage(row: UsageRow, prices: Prices): number {
  return (
    (row.inputTokens / 1_000_000) * prices.inputPerMTok +
    (row.outputTokens / 1_000_000) * prices.outputPerMTok +
    (row.cacheReadTokens / 1_000_000) * prices.cacheReadPerMTok +
    (row.cacheWriteTokens / 1_000_000) * prices.cacheWritePerMTok
  )
}
