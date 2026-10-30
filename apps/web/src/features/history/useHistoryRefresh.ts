import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { historyStatusQuery } from './HistoryPanel'

/**
 * Keeps every page current without a refresh: it watches the history database's last scan, and when a
 * new one has finished, everything drawn from the history is fetched again. Used once, in the page frame.
 */
export function useHistoryRefresh(): void {
  const queryClient = useQueryClient()
  const { data } = useQuery(historyStatusQuery)
  const finishedAt = data?.lastScan?.finishedAt ?? null
  const seen = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (data === undefined) return
    // The first value is what the page was already drawn from.
    if (seen.current !== undefined && seen.current !== finishedAt) {
      for (const key of ['stats', 'projects', 'history-cost', 'subscription']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    }
    seen.current = finishedAt
  }, [data, finishedAt, queryClient])
}
