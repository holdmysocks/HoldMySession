import { queryOptions } from '@tanstack/react-query'
import { getUpdateInfo } from './updates.api'

export const updateInfoQuery = queryOptions({
  queryKey: ['update-info'],
  queryFn: () => getUpdateInfo(),
  // The server keeps GitHub's answer for six hours, so asking often costs nothing.
  staleTime: 10 * 60_000,
  refetchOnWindowFocus: false,
  // While an update downloads the page follows its progress.
  refetchInterval: (query) => (query.state.data?.update && ['downloading', 'installing'].includes(query.state.data.update.phase) ? 1_000 : false),
})
