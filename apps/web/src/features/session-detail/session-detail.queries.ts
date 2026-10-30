import { queryOptions } from '@tanstack/react-query'
import { getSessionDetail } from './session-detail.api'

/** One session's detail. `machineId` names the node it ran on, when a master is showing a node's session. */
export function sessionDetailQuery(sessionId: string, projectKey: string, isActive?: boolean, machineId?: string) {
  return queryOptions({
    queryKey: ['session', 'detail', machineId ?? 'local', sessionId],
    queryFn: () => getSessionDetail({ data: { sessionId, projectKey, machineId } }),
    staleTime: isActive ? 2_000 : 30_000,
    refetchInterval: isActive ? 5_000 : undefined,
  })
}

