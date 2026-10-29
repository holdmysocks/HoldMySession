import { useEffect, useState } from 'react'

/**
 * The current time, refreshed on an interval. Status depends on "now" (the completed
 * window), so it is kept in state instead of read during render.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
