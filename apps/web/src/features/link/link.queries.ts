import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  connectToMaster, disconnectFromMaster, getLinkState, regenerateNodeToken, removeLinkedMachine, renameMachineName, setLinkRole,
  setListen, syncNow,
} from './link.api'

export const linkStateQuery = queryOptions({
  queryKey: ['link-state'],
  queryFn: () => getLinkState(),
  refetchInterval: 15_000,
  refetchOnWindowFocus: false,
})

/** Everything drawn from the history can change when machines come or go, or prices arrive from the master. */
export function useLinkMutations() {
  const queryClient = useQueryClient()
  const refresh = () => {
    queryClient.invalidateQueries()
  }
  return {
    role: useMutation({ mutationFn: setLinkRole, onSuccess: refresh }),
    token: useMutation({ mutationFn: regenerateNodeToken, onSuccess: refresh }),
    listen: useMutation({ mutationFn: setListen, onSuccess: refresh }),
    connect: useMutation({ mutationFn: connectToMaster, onSuccess: refresh }),
    disconnect: useMutation({ mutationFn: disconnectFromMaster, onSuccess: refresh }),
    sync: useMutation({ mutationFn: syncNow, onSuccess: refresh }),
    rename: useMutation({ mutationFn: renameMachineName, onSuccess: refresh }),
    remove: useMutation({ mutationFn: removeLinkedMachine, onSuccess: refresh }),
  }
}
