import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'

/**
 * The time axis of the session timeline. It picks a unit that suits the span on screen: seconds and
 * minutes for a short session, hours, then days, weeks, months and years as the span grows. Ticks
 * fall on calendar boundaries in local time (midnight, Monday, the 1st), and a second row of bands
 * names the larger unit the ticks sit inside, such as the day above hourly ticks. Pure.
 */

export type TickUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

export interface TimeTick {
  ms: number
  label: string
  /** On a boundary of the band row, such as midnight above hourly ticks. Drawn stronger. */
  major: boolean
}

export interface TimeBand {
  startMs: number
  endMs: number
  /** Full text, such as "Tuesday 29 October". */
  label: string
  /** Shorter text for a narrow band, such as "Tue 29 Oct". */
  shortLabel: string
}

export interface TimeScale {
  unit: TickUnit
  ticks: TimeTick[]
  bands: TimeBand[]
}

/** Least width between two ticks, in pixels, so labels never touch. */
export const MIN_TICK_SPACING_PX = 88

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

interface Step {
  unit: TickUnit
  count: number
  /** About how long one step is. Months and years vary, so this is an average. */
  approxMs: number
}

const STEPS: Step[] = [
  { unit: 'second', count: 1, approxMs: SECOND },
  { unit: 'second', count: 5, approxMs: 5 * SECOND },
  { unit: 'second', count: 15, approxMs: 15 * SECOND },
  { unit: 'second', count: 30, approxMs: 30 * SECOND },
  { unit: 'minute', count: 1, approxMs: MINUTE },
  { unit: 'minute', count: 5, approxMs: 5 * MINUTE },
  { unit: 'minute', count: 15, approxMs: 15 * MINUTE },
  { unit: 'minute', count: 30, approxMs: 30 * MINUTE },
  { unit: 'hour', count: 1, approxMs: HOUR },
  { unit: 'hour', count: 3, approxMs: 3 * HOUR },
  { unit: 'hour', count: 6, approxMs: 6 * HOUR },
  { unit: 'hour', count: 12, approxMs: 12 * HOUR },
  { unit: 'day', count: 1, approxMs: DAY },
  { unit: 'day', count: 2, approxMs: 2 * DAY },
  { unit: 'week', count: 1, approxMs: 7 * DAY },
  { unit: 'week', count: 2, approxMs: 14 * DAY },
  { unit: 'month', count: 1, approxMs: 30.44 * DAY },
  { unit: 'month', count: 3, approxMs: 91.3 * DAY },
  { unit: 'month', count: 6, approxMs: 182.6 * DAY },
  { unit: 'year', count: 1, approxMs: 365.25 * DAY },
  { unit: 'year', count: 2, approxMs: 730.5 * DAY },
  { unit: 'year', count: 5, approxMs: 1826 * DAY },
  { unit: 'year', count: 10, approxMs: 3652 * DAY },
]

/** A safety limit on ticks and bands, so a bad range can never build an endless list. */
const MAX_ITEMS = 400

function chooseStep(durationMs: number, widthPx: number): Step {
  const pxPerMs = widthPx / durationMs
  return STEPS.find((step) => step.approxMs * pxPerMs >= MIN_TICK_SPACING_PX) ?? STEPS[STEPS.length - 1]
}

/** Local-time alignment for second and minute steps: multiples of the step since local midnight. */
function alignedFixedTicks(startMs: number, endMs: number, stepMs: number): number[] {
  const offsetMs = new Date(startMs).getTimezoneOffset() * MINUTE
  const first = Math.ceil((startMs - offsetMs) / stepMs) * stepMs + offsetMs
  const ticks: number[] = []
  for (let ms = first; ms <= endMs && ticks.length < MAX_ITEMS; ms += stepMs) ticks.push(ms)
  return ticks
}

function hourTicks(startMs: number, endMs: number, everyHours: number): number[] {
  const ticks: number[] = []
  let day = startOfDay(new Date(startMs))
  while (day.getTime() <= endMs && ticks.length < MAX_ITEMS) {
    for (let hour = 0; hour < 24; hour += everyHours) {
      const ms = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour).getTime()
      if (ms >= startMs && ms <= endMs) ticks.push(ms)
    }
    day = addDays(day, 1)
  }
  return ticks
}

/**
 * Ticks at the start of each calendar unit, from `first` on, every `count` units. `first` is the
 * unit's start at or before the range. When `aligned` it is already a multiple of `count` (Jan, Apr,
 * ...), so stepping from it keeps that alignment. Otherwise the first tick is the first boundary in
 * the range, and the steps count from there.
 */
function calendarTicks(
  startMs: number,
  endMs: number,
  first: Date,
  advance: (date: Date, amount: number) => Date,
  count: number,
  aligned: boolean,
): number[] {
  const ticks: number[] = []
  let date = first
  if (date.getTime() < startMs) date = advance(date, aligned ? count : 1)
  while (date.getTime() <= endMs && ticks.length < MAX_ITEMS) {
    ticks.push(date.getTime())
    date = advance(date, count)
  }
  return ticks
}

function tickTimes(step: Step, startMs: number, endMs: number): number[] {
  const start = new Date(startMs)
  switch (step.unit) {
    case 'second':
      return alignedFixedTicks(startMs, endMs, step.count * SECOND)
    case 'minute':
      return alignedFixedTicks(startMs, endMs, step.count * MINUTE)
    case 'hour':
      return hourTicks(startMs, endMs, step.count)
    case 'day':
      return calendarTicks(startMs, endMs, startOfDay(start), addDays, step.count, false)
    case 'week':
      return calendarTicks(startMs, endMs, startOfWeek(start, { weekStartsOn: 1 }), addWeeks, step.count, false)
    case 'month': {
      // Land on months that are multiples of the step, so three-month ticks are Jan, Apr, Jul, Oct.
      let first = startOfMonth(start)
      while (first.getMonth() % step.count !== 0) first = addMonths(first, -1)
      return calendarTicks(startMs, endMs, first, addMonths, step.count, true)
    }
    case 'year': {
      let first = startOfYear(start)
      while (first.getFullYear() % step.count !== 0) first = addYears(first, -1)
      return calendarTicks(startMs, endMs, first, addYears, step.count, true)
    }
  }
}

const TICK_FORMAT: Record<TickUnit, string> = {
  second: 'HH:mm:ss',
  minute: 'HH:mm',
  hour: 'HH:mm',
  day: 'EEE d',
  week: 'd MMM',
  month: 'MMM',
  year: 'yyyy',
}

/** The unit of the band row above ticks of this unit, or null when nothing larger is worth showing. */
function bandUnitFor(unit: TickUnit): 'day' | 'month' | 'year' | null {
  switch (unit) {
    case 'second':
    case 'minute':
    case 'hour':
      return 'day'
    case 'day':
    case 'week':
      return 'month'
    case 'month':
      return 'year'
    case 'year':
      return null
  }
}

function bandStart(unit: 'day' | 'month' | 'year', date: Date): Date {
  return unit === 'day' ? startOfDay(date) : unit === 'month' ? startOfMonth(date) : startOfYear(date)
}

function nextBand(unit: 'day' | 'month' | 'year', date: Date): Date {
  return unit === 'day' ? addDays(date, 1) : unit === 'month' ? addMonths(date, 1) : addYears(date, 1)
}

const BAND_LABELS: Record<'day' | 'month' | 'year', [string, string]> = {
  day: ['EEEE d MMMM', 'EEE d MMM'],
  month: ['MMMM yyyy', 'MMM yy'],
  year: ['yyyy', 'yy'],
}

function buildBands(unit: 'day' | 'month' | 'year', startMs: number, endMs: number): TimeBand[] {
  const [long, short] = BAND_LABELS[unit]
  const bands: TimeBand[] = []
  let from = bandStart(unit, new Date(startMs))
  while (from.getTime() < endMs && bands.length < MAX_ITEMS) {
    const to = nextBand(unit, from)
    bands.push({
      startMs: Math.max(from.getTime(), startMs),
      endMs: Math.min(to.getTime(), endMs),
      label: format(from, long),
      shortLabel: format(from, short),
    })
    from = to
  }
  return bands
}

/**
 * The axis for the range `startMs` to `endMs` drawn `widthPx` wide. Empty for an empty range or
 * width.
 */
export function buildTimeScale(startMs: number, endMs: number, widthPx: number): TimeScale {
  const durationMs = endMs - startMs
  if (!(durationMs > 0) || !(widthPx > 0)) return { unit: 'minute', ticks: [], bands: [] }

  const step = chooseStep(durationMs, widthPx)
  const bandUnit = bandUnitFor(step.unit)
  const bands = bandUnit ? buildBands(bandUnit, startMs, endMs) : []
  const bandStarts = new Set(bands.map((band) => band.startMs))

  const ticks = tickTimes(step, startMs, endMs).map((ms): TimeTick => {
    // A tick on a band boundary is the start of a new day, month or year: say which, not just the time.
    const major = bandStarts.has(ms) && ms !== startMs
    const date = new Date(ms)
    const label =
      major && step.unit === 'hour'
        ? format(date, 'EEE d MMM')
        : major && (step.unit === 'minute' || step.unit === 'second')
          ? format(date, 'd MMM HH:mm')
          : format(date, TICK_FORMAT[step.unit])
    return { ms, label, major }
  })
  return { unit: step.unit, ticks, bands }
}

/** The full time at a point on the axis, for the hover readout. */
export function formatCursorTime(ms: number): string {
  return format(new Date(ms), 'EEE d MMM yyyy HH:mm:ss')
}

/** How long a span is, in the unit that reads best: seconds, minutes, hours, then days for long ones. */
export function formatSpan(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return days < 14 ? `${days}d ${hours % 24}h` : `${days}d`
}

/** A compact range for a heading: "3 Mar 10:02 → 5 Mar 18:20", with the year when it is not this one. */
export function formatRange(startMs: number, endMs: number, nowMs: number = Date.now()): string {
  const thisYear = new Date(nowMs).getFullYear()
  const fmt = (ms: number) => format(new Date(ms), new Date(ms).getFullYear() === thisYear ? 'd MMM HH:mm' : 'd MMM yyyy HH:mm')
  return `${fmt(startMs)} → ${fmt(endMs)}`
}
