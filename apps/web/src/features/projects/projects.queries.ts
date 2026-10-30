import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMachineProjects, saveProjectPrefs } from './projects.api'

export const machineProjectsQuery = queryOptions({
  queryKey: ['machine-projects'],
  queryFn: () => getMachineProjects(),
  staleTime: 30_000,
})

/** Saving the Projects settings changes every list and dropdown, so they are all read again. */
export function useSaveProjectPrefs() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveProjectPrefs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['map'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
