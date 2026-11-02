import { queryOptions } from '@tanstack/react-query'
import { getUsageOverview } from './usage.api'

/** Refreshed often enough that a 5-hour meter moves while you work, and cheap because transcripts are cached. */
export const usageQuery = () =>
  queryOptions({
    queryKey: ['usage'],
    queryFn: () => getUsageOverview(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
