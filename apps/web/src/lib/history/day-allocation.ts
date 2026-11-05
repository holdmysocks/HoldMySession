/** The local calendar day (yyyy-MM-dd) of an ISO timestamp, or null if it is not a date. */
export function localDay(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Splits `total` across days in proportion to `weights`, in whole numbers that add up to exactly
 * `total` (largest remainder). A day with a bigger share of the work gets a bigger share of the tokens.
 */
export function splitByWeight(total: number, weights: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>()
  const sum = [...weights.values()].reduce((a, b) => a + b, 0)
  if (total <= 0 || sum <= 0) return out

  const parts = [...weights.entries()]
    .filter(([, w]) => w > 0)
    .map(([day, w]) => {
      const exact = (total * w) / sum
      return { day, whole: Math.floor(exact), rest: exact - Math.floor(exact) }
    })
  let left = total - parts.reduce((a, p) => a + p.whole, 0)
  // Hand the leftover units to the biggest remainders; ties go to the earlier day.
  const order = [...parts].sort((a, b) => b.rest - a.rest || (a.day < b.day ? -1 : 1))
  for (const p of order) {
    if (left <= 0) break
    p.whole += 1
    left -= 1
  }
  for (const p of parts) out.set(p.day, p.whole)
  return out
}

/** How many milliseconds of each local day lie between two instants. Empty when the span is empty or bad. */
export function overlapWeights(startIso: string, endIso: string): Map<string, number> {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  const weights = new Map<string, number>()
  if (Number.isNaN(start) || Number.isNaN(end) || !(end > start)) return weights
  let cursor = start
  // Day by day to midnight, never more than a few years, so a bad timestamp cannot loop forever.
  for (let i = 0; i < 1500 && cursor < end; i++) {
    const d = new Date(cursor)
    const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
    const stop = Math.min(nextMidnight, end)
    const day = localDay(new Date(cursor).toISOString())
    if (day) weights.set(day, (weights.get(day) ?? 0) + (stop - cursor))
    cursor = stop
  }
  return weights
}

/** A whole number (time, messages, tool calls) split over the local days between two instants, in proportion to how much of each day they cover. */
export function splitCount(startIso: string, endIso: string, total: number): Map<string, number> {
  const whole = Math.round(total)
  const endDay = localDay(endIso)
  if (!(whole > 0)) return new Map()
  const weights = overlapWeights(startIso, endIso)
  // One day, or a span that cannot be split: everything lands on the day the session was last active.
  if (weights.size <= 1) return endDay ? new Map([[endDay, whole]]) : new Map()
  return splitByWeight(whole, weights)
}

/** A session's open time split over the days it spanned. */
export function splitDuration(startIso: string, endIso: string, durationMs: number): Map<string, number> {
  return splitCount(startIso, endIso, durationMs)
}

/** Gaps between messages longer than this are time away, not time working. */
export const ACTIVE_GAP_MS = 10 * 60 * 1000

/**
 * The time spent working in a session, by local day: every gap between two consecutive messages of at most
 * ACTIVE_GAP_MS counts, longer gaps count nothing. A gap that crosses midnight is split between the days.
 */
export function activeTimeByDay(timestamps: string[]): Map<string, number> {
  const times = timestamps.map((t) => ({ t, ms: new Date(t).getTime() })).filter((x) => !Number.isNaN(x.ms)).sort((a, b) => a.ms - b.ms)
  const out = new Map<string, number>()
  for (let i = 1; i < times.length; i++) {
    const gap = times[i].ms - times[i - 1].ms
    if (gap <= 0 || gap > ACTIVE_GAP_MS) continue
    for (const [day, ms] of overlapWeights(times[i - 1].t, times[i].t)) out.set(day, (out.get(day) ?? 0) + ms)
  }
  return out
}

/** A guess at the working time of a session whose messages are no longer known: about 45 seconds a message, never more than it was open. */
export function estimateActiveMs(durationMs: number, messages: number): number {
  return Math.max(0, Math.min(durationMs, messages * 45_000))
}
