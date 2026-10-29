import { queryOptions } from '@tanstack/react-query'
import { getMapProjects, getProjectMap, getHookEvents } from './project-map.api'

export const mapProjectsQuery = queryOptions({
  queryKey: ['map', 'projects'],
  queryFn: () => getMapProjects(),
  refetchInterval: 30_000,
})

export function projectMapQuery(projectPath: string) {
  return queryOptions({
    queryKey: ['map', 'project', projectPath],
    queryFn: () => getProjectMap({ data: { projectPath } }),
    enabled: projectPath.length > 0,
    refetchInterval: 10_000,
  })
}

export const hookEventsQuery = queryOptions({
  queryKey: ['map', 'hook-events'],
  queryFn: () => getHookEvents(),
  refetchInterval: 5_000,
})
