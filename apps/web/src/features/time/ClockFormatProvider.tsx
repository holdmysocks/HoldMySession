import { Fragment, useSyncExternalStore, type ReactNode } from 'react'
import { getClockFormat, subscribeClockFormat, type ClockFormat } from '@/lib/utils/time-format'

/** The clock choice, for components that show it. Server rendering always uses 24 hours. */
export function useClockFormat(): ClockFormat {
  return useSyncExternalStore(subscribeClockFormat, getClockFormat, () => '24h')
}

/**
 * Times are formatted where they are drawn, not through React state, so a change of clock is
 * applied by drawing the page below again from fresh.
 */
export function ClockFormatProvider({ children }: { children: ReactNode }) {
  const format = useClockFormat()
  return <Fragment key={format}>{children}</Fragment>
}
