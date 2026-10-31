import { addDays, isDay } from './price-timeline'

/**
 * The plan paid for, as dated periods. A period starts on a day and lasts until the next one starts.
 * Pure, so the server and the browser agree.
 */
export interface SubscriptionPeriod {
  id: number
  tier: string
  monthlyUSD: number
  startDay: string
  note: string | null
  createdAt: string
}

export interface MonthSummary {
  /** yyyy-MM */
  month: string
  /** Days of the month covered by a plan. */
  days: number
  /** What the same usage would have cost at API prices. */
  apiUSD: number
  /** What the plan cost for those days. */
  paidUSD: number
}

export interface SubscriptionSummary {
  firstDay: string | null
  months: MonthSummary[]
  apiUSD: number
  paidUSD: number
  /** API-equivalent cost minus what was paid. Negative when the plan cost more. */
  savedUSD: number
}

/** The plan on a day: the latest-starting period that has begun, and of two starting the same day, the later-made one. */
export function periodOnDay(periods: SubscriptionPeriod[], day: string): SubscriptionPeriod | null {
  let best: SubscriptionPeriod | null = null
  for (const p of periods) {
    if (p.startDay > day) continue
    if (!best || p.startDay > best.startDay || (p.startDay === best.startDay && p.id > best.id)) best = p
  }
  return best
}

export function daysInMonth(day: string): number {
  const [y, m] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * Compares what the plan cost with what the same usage would have cost at API prices, from the day
 * the first period starts to `today`. Each day of a plan costs its monthly price divided by the days
 * in that month, so a part month is paid for in part. A pay-as-you-go plan ('api') pays the API cost.
 * Usage before the first period is left out of both sides, so the comparison is like for like.
 */
export function summarizeSubscription(
  periods: SubscriptionPeriod[],
  apiByDay: Record<string, number>,
  today: string,
  /** Count only from this day on, for a period shorter than all history. */
  fromDay?: string,
): SubscriptionSummary {
  const starts = periods.map((p) => p.startDay).sort()
  const empty: SubscriptionSummary = { firstDay: null, months: [], apiUSD: 0, paidUSD: 0, savedUSD: 0 }
  if (starts.length === 0 || starts[0] > today) return { ...empty, firstDay: starts[0] ?? null }

  const months = new Map<string, MonthSummary>()
  for (let day = fromDay && fromDay > starts[0] ? fromDay : starts[0]; day <= today; day = addDays(day, 1)) {
    const plan = periodOnDay(periods, day)
    if (!plan) continue
    const api = apiByDay[day] ?? 0
    const paid = plan.tier === 'api' ? api : plan.monthlyUSD / daysInMonth(day)
    const key = day.slice(0, 7)
    const m = months.get(key) ?? { month: key, days: 0, apiUSD: 0, paidUSD: 0 }
    m.days += 1
    m.apiUSD += api
    m.paidUSD += paid
    months.set(key, m)
  }
  const list = [...months.values()]
  const apiUSD = list.reduce((a, m) => a + m.apiUSD, 0)
  const paidUSD = list.reduce((a, m) => a + m.paidUSD, 0)
  return { firstDay: starts[0], months: list, apiUSD, paidUSD, savedUSD: apiUSD - paidUSD }
}

/** One line for the cost card, or null when there is no plan to compare. */
export function savingsText(summary: SubscriptionSummary, formatUSD: (n: number) => string): string | null {
  if (!summary.firstDay || summary.months.length === 0) return null
  const diff = summary.savedUSD
  const paid = `Paid ~${formatUSD(summary.paidUSD)}`
  if (Math.abs(diff) < 0.005) return `${paid}, same as API prices`
  return diff > 0 ? `${paid}, saving ~${formatUSD(diff)}` : `${paid}, ~${formatUSD(-diff)} more than API prices`
}

export function validatePeriod(p: { tier: string; monthlyUSD: number; startDay: string }, knownTiers: string[]): void {
  if (!knownTiers.includes(p.tier)) throw new Error('Choose a plan.')
  if (!Number.isFinite(p.monthlyUSD) || p.monthlyUSD < 0) throw new Error('The price must be zero or more.')
  if (!isDay(p.startDay)) throw new Error('The start date is not a valid date.')
}
