import { queryOptions } from '@tanstack/react-query'
import { getMapProjects, getProjectMap, getHookEvents } from './project-map.api'
import { getMapLayout } from './map-layout.api'

export const mapProjectsQuery = queryOptions({
  queryKey: ['map', 'projects'],
  queryFn: () => getMapProjects(),
  refetchInterval: 30_000,
})

export function projectMapQuery(projectKey: string) {
  return queryOptions({
    queryKey: ['map', 'project', projectKey],
    queryFn: () => getProjectMap({ data: { projectKey } }),
    enabled: projectKey.length > 0,
    refetchInterval: 10_000,
  })
}

export const hookEventsQuery = queryOptions({
  queryKey: ['map', 'hook-events'],
  queryFn: () => getHookEvents(),
  refetchInterval: 5_000,
})

/** The layout the user arranged by hand for a project, saved on the server. */
export function mapLayoutQuery(projectKey: string) {
  return queryOptions({
    queryKey: ['map', 'layout', projectKey],
    queryFn: () => getMapLayout({ data: { projectKey } }),
    enabled: projectKey.length > 0,
    // Another device may have changed it, so look again when this tab is focused after a while.
    staleTime: 15_000,
  })
}
