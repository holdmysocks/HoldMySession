import { queryOptions } from '@tanstack/react-query'
import { getProjectAnalytics, getProjectStats } from './project-analytics.api'

export const projectAnalyticsQuery = queryOptions({
  queryKey: ['projects', 'analytics'],
  queryFn: () => getProjectAnalytics(),
  refetchInterval: 60_000,
})

/** Stats for one project. Computed from the project's sessions, so it is not refetched on a timer. */
export const projectStatsQuery = (projectPath: string) =>
  queryOptions({
    queryKey: ['projects', 'stats', projectPath],
    queryFn: () => getProjectStats({ data: { projectPath } }),
    enabled: projectPath !== '',
    staleTime: 60_000,
  })
