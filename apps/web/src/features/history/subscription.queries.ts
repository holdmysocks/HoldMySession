import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { createSubscriptionPeriod, getSubscription, removeSubscriptionPeriod } from './history.api'

export const subscriptionQuery = queryOptions({
  queryKey: ['subscription'],
  queryFn: () => getSubscription(),
  staleTime: 60_000,
  refetchOnWindowFocus: false,
})

/** Changing a plan changes the saving shown on Stats, so the subscription is refetched. Prices change it too. */
export function useSubscriptionMutations() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['subscription'] })
  return {
    add: useMutation({ mutationFn: createSubscriptionPeriod, onSuccess: refresh }),
    remove: useMutation({ mutationFn: removeSubscriptionPeriod, onSuccess: refresh }),
  }
}
