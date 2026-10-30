import { queryOptions } from '@tanstack/react-query'
import { getProjectAnalytics, getProjectStats } from './project-analytics.api'

export function projectAnalyticsQueryFor(machineId?: string) {
  return queryOptions({
    queryKey: ['projects', 'analytics', machineId ?? 'all'],
    queryFn: () => getProjectAnalytics({ data: { machineId } }),
    refetchInterval: 60_000,
  })
}

/** Stats for one project. Computed from the project's sessions, so it is not refetched on a timer. */
export const projectStatsQuery = (projectPath: string, machineId?: string) =>
  queryOptions({
    queryKey: ['projects', 'stats', projectPath, machineId ?? 'all'],
    queryFn: () => getProjectStats({ data: { projectPath, machineId } }),
    enabled: projectPath !== '',
    staleTime: 60_000,
  })
