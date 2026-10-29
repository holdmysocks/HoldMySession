import { queryOptions } from '@tanstack/react-query'
import { getSessionDetail } from './session-detail.api'

export function sessionDetailQuery(sessionId: string, projectKey: string, isActive?: boolean) {
  return queryOptions({
    queryKey: ['session', 'detail', sessionId],
    queryFn: () => getSessionDetail({ data: { sessionId, projectKey } }),
    staleTime: isActive ? 2_000 : 30_000,
    refetchInterval: isActive ? 5_000 : undefined,
  })
}

