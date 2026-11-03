import { queryOptions } from '@tanstack/react-query'
import { getHookState } from './hooks.api'

export const hookStateQuery = queryOptions({
  queryKey: ['hook-state'],
  queryFn: () => getHookState(),
  refetchOnWindowFocus: true,
})
