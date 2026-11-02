import { queryOptions } from '@tanstack/react-query'
import { getStatusLineState, getUsageOverview } from './usage.api'

/** Refreshed often enough that a 5-hour meter moves while you work, and cheap because transcripts are cached. */
export const usageQuery = () =>
  queryOptions({
    queryKey: ['usage'],
    queryFn: () => getUsageOverview(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })

/** Whether the status line is set up. Cheap: it reads one settings file, not the transcripts. */
export const statusLineQuery = queryOptions({
  queryKey: ['status-line-state'],
  queryFn: () => getStatusLineState(),
  refetchOnWindowFocus: true,
})
