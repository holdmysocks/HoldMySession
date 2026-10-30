import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { createPriceEntry, getHistoryCost, getPriceEntries, removePriceEntry } from './history.api'

export const priceEntriesQuery = queryOptions({
  queryKey: ['price-entries'],
  queryFn: () => getPriceEntries(),
  refetchOnWindowFocus: false,
})

/** Cost with dated prices, overall or for one project. Pass an empty path to leave it off. */
export function historyCostQuery(projectPath?: string, enabled = true) {
  return queryOptions({
    queryKey: ['history-cost', projectPath ?? null],
    queryFn: () => getHistoryCost({ data: { projectPath } }),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

/** Changing a price changes what past days cost, so every cost on screen is refetched. */
export function usePriceEntryMutations() {
  const queryClient = useQueryClient()
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['price-entries'] })
    queryClient.invalidateQueries({ queryKey: ['history-cost'] })
  }
  return {
    add: useMutation({ mutationFn: createPriceEntry, onSuccess: refresh }),
    remove: useMutation({ mutationFn: removePriceEntry, onSuccess: refresh }),
  }
}
