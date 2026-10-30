import { queryOptions } from '@tanstack/react-query'
import { getMapProjects, getProjectMap, getHookEvents } from './project-map.api'
import { getMapLayout } from './map-layout.api'

export function mapProjectsQuery(machineId?: string) {
  return queryOptions({
    queryKey: ['map', 'projects', machineId ?? 'local'],
    queryFn: () => getMapProjects({ data: { machineId } }),
    refetchInterval: 30_000,
  })
}

export function projectMapQuery(projectKey: string, machineId?: string) {
  return queryOptions({
    queryKey: ['map', 'project', machineId ?? 'local', projectKey],
    queryFn: () => getProjectMap({ data: { projectKey, machineId } }),
    enabled: projectKey.length > 0,
    refetchInterval: 10_000,
  })
}

export function hookEventsQuery(machineId?: string) {
  return queryOptions({
    queryKey: ['map', 'hook-events', machineId ?? 'local'],
    queryFn: () => getHookEvents({ data: { machineId } }),
    refetchInterval: 5_000,
  })
}

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
