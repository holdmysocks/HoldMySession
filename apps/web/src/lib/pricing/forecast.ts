import { addDays } from './price-timeline'

export interface MonthForecast {
  /** yyyy-MM */
  month: string
  daysInMonth: number
  /** Whole days of the month that are over. */
  daysDone: number
  /** What the month has cost so far at API prices, today included. */
  soFarUSD: number
  /** Where the month ends if the days to come cost what the finished ones did on average. Null for the first days of the month. */
  projectedUSD: number | null
  /** The plan's monthly price, or null when there is no plan or it is pay as you go. */
  planUSD: number | null
}

/** The least number of finished days before a projection is worth showing. */
export const MIN_DAYS_FOR_FORECAST = 3

const daysInMonthOf = (day: string) => {
  const [y, m] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * A straight-line forecast for the month `today` is in, from what each finished day cost at API prices.
 * Pure: the day-by-day cost goes in. A projection needs a few finished days, so the first days of a month give none.
 */
export function forecastMonth(byDay: Record<string, number>, today: string, planMonthlyUSD: number | null): MonthForecast {
  const month = today.slice(0, 7)
  const dayOfMonth = Number(today.slice(8, 10))
  const daysInMonth = daysInMonthOf(today)
  const daysDone = dayOfMonth - 1
  let soFarUSD = 0
  let finishedUSD = 0
  for (let i = 0; i < dayOfMonth; i++) {
    const day = addDays(`${month}-01`, i)
    const usd = byDay[day] ?? 0
    soFarUSD += usd
    if (i < daysDone) finishedUSD += usd
  }
  return {
    month,
    daysInMonth,
    daysDone,
    soFarUSD,
    projectedUSD: daysDone >= MIN_DAYS_FOR_FORECAST ? (finishedUSD / daysDone) * daysInMonth : null,
    planUSD: planMonthlyUSD !== null && planMonthlyUSD > 0 ? planMonthlyUSD : null,
  }
}
