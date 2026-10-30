/**
 * 12-hour or 24-hour clock for every time of day the dashboard shows. Kept in the browser, like the
 * theme, and read at the moment a time is formatted. `ClockFormatProvider` re-renders the page when it changes.
 */
export type ClockFormat = '24h' | '12h'

const KEY = 'holdmysession:clock-format'
const listeners = new Set<() => void>()

function read(): ClockFormat {
  try {
    return localStorage.getItem(KEY) === '12h' ? '12h' : '24h'
  } catch {
    return '24h'
  }
}

let current: ClockFormat | null = null

export function getClockFormat(): ClockFormat {
  if (current === null) current = read()
  return current
}

export function setClockFormat(format: ClockFormat): void {
  current = format
  try {
    localStorage.setItem(KEY, format)
  } catch {
    // Not remembered, which is fine.
  }
  for (const listener of listeners) listener()
}

export function subscribeClockFormat(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Turns a date-fns pattern written for a 24-hour clock into the current clock: 'HH:mm:ss' stays, or
 * becomes 'h:mm:ss a'. Only the time part is changed, so 'd MMM HH:mm' keeps its date.
 */
export function clockPattern(pattern: string, format: ClockFormat = getClockFormat()): string {
  return format === '12h' ? pattern.replace(/HH:mm(:ss)?/, 'h:mm$1 a') : pattern
}
