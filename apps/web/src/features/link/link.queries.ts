import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  allowFirewall, connectToMaster, disconnectFromMaster, restartApp, getLinkState, regenerateNodeToken, removeLinkedMachine, renameMachineName, setLinkRole,
  setListen, setMachineIdle, syncNow,
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
    firewall: useMutation({ mutationFn: allowFirewall, onSuccess: refresh }),
    restart: useMutation({ mutationFn: restartApp }),
    connect: useMutation({ mutationFn: connectToMaster, onSuccess: refresh }),
    disconnect: useMutation({ mutationFn: disconnectFromMaster, onSuccess: refresh }),
    sync: useMutation({ mutationFn: syncNow, onSuccess: refresh }),
    rename: useMutation({ mutationFn: renameMachineName, onSuccess: refresh }),
    remove: useMutation({ mutationFn: removeLinkedMachine, onSuccess: refresh }),
    idle: useMutation({ mutationFn: setMachineIdle, onSuccess: () => { refresh() } }),
  }
}
