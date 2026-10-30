import { queryOptions } from '@tanstack/react-query'
import { getUpdateInfo } from './updates.api'

export const updateInfoQuery = queryOptions({
  queryKey: ['update-info'],
  queryFn: () => getUpdateInfo(),
  // The server keeps GitHub's answer for six hours, so asking often costs nothing.
  staleTime: 10 * 60_000,
  refetchOnWindowFocus: false,
})
