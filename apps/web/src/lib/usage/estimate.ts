import { FIVE_HOUR_MS, SEVEN_DAY_MS } from './limits'

/** One answer from the model, with the time it was given. The transcripts have these for every session. */
export interface UsageEvent {
  /** Epoch milliseconds. */
  time: number
  /** The session's key, to tell sessions apart. */
  session: string
  /** Input, output and cache writes. Cache reads are left out: they are re-reads of what is already cached. */
  tokens: number
  /** What the same answer costs at API prices. */
  usd: number
}

export interface Block {
  start: number
  end: number
  tokens: number
  usd: number
  events: number
}

/**
 * The 5-hour blocks: a block starts with the first answer after the last block ended and runs five hours.
 * This is how the window is counted for a subscription, so it lines up with the reset time Claude Code reports.
 */
export function blocksOf(events: UsageEvent[]): Block[] {
  const sorted = [...events].sort((a, b) => a.time - b.time)
  const blocks: Block[] = []
  for (const e of sorted) {
    const last = blocks[blocks.length - 1]
    if (last && e.time < last.end) {
      last.tokens += e.tokens
      last.usd += e.usd
      last.events += 1
    } else {
      blocks.push({ start: e.time, end: e.time + FIVE_HOUR_MS, tokens: e.tokens, usd: e.usd, events: 1 })
    }
  }
  return blocks
}

/** The block running now, or null when the last one has ended. */
export function currentBlock(events: UsageEvent[], nowMs: number): Block | null {
  const last = blocksOf(events.filter((e) => e.time <= nowMs)).pop()
  return last && nowMs < last.end ? last : null
}

export interface Totals {
  tokens: number
  usd: number
  events: number
}

/** Everything in the last `windowMs`. */
export function totalsSince(events: UsageEvent[], nowMs: number, windowMs: number = SEVEN_DAY_MS): Totals {
  const from = nowMs - windowMs
  const total: Totals = { tokens: 0, usd: 0, events: 0 }
  for (const e of events) {
    if (e.time < from || e.time > nowMs) continue
    total.tokens += e.tokens
    total.usd += e.usd
    total.events += 1
  }
  return total
}

export interface Burn {
  session: string
  tokens: number
  usd: number
  /** Share of the period's tokens, 0 to 1. */
  share: number
  /** The session's last answer in the period. */
  lastAt: number
}

/** Which sessions used the most between `from` and `to`, largest first. */
export function burnBySession(events: UsageEvent[], from: number, to: number, limit = 10): Burn[] {
  const bySession = new Map<string, { tokens: number; usd: number; lastAt: number }>()
  let all = 0
  for (const e of events) {
    if (e.time < from || e.time > to) continue
    const row = bySession.get(e.session) ?? { tokens: 0, usd: 0, lastAt: 0 }
    row.tokens += e.tokens
    row.usd += e.usd
    row.lastAt = Math.max(row.lastAt, e.time)
    bySession.set(e.session, row)
    all += e.tokens
  }
  return [...bySession.entries()]
    .map(([session, r]) => ({ session, ...r, share: all > 0 ? r.tokens / all : 0 }))
    .sort((a, b) => b.tokens - a.tokens || b.lastAt - a.lastAt)
    .slice(0, limit)
}

/**
 * A guess at the limit in tokens from a real report: if 40% of the window was used and the answers in it
 * add up to 2 million tokens, the limit is about 5 million. Null when too little is used to say.
 */
export function impliedLimit(usedPercentage: number, tokensInWindow: number): number | null {
  if (usedPercentage < 5 || tokensInWindow <= 0) return null
  return Math.round(tokensInWindow / (usedPercentage / 100))
}

/** The middle of the guesses, so one odd report does not move it. */
export function medianLimit(guesses: number[]): number | null {
  if (guesses.length === 0) return null
  const sorted = [...guesses].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}
