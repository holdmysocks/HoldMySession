import { queryOptions } from '@tanstack/react-query'
import { getStats } from './stats.api'

/** Stats for every machine, or for one when a master has chosen it. */
export function statsQueryFor(machineId?: string) {
  return queryOptions({
    queryKey: ['stats', machineId ?? 'all'],
    queryFn: () => getStats({ data: { machineId } }),
    refetchInterval: 60_000,
  })
}
