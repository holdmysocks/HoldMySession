import { useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ALL_MACHINES, getMachineFilter, subscribeMachineFilter } from '@/lib/utils/machine-filter'
import { linkStateQuery } from './link.queries'

export interface MachineScope {
  /** The machine chosen, or undefined for every machine (and always undefined when there is no filter to show). */
  machineId: string | undefined
  /** The chosen machine is another one, whose live sessions this computer cannot show. */
  isRemote: boolean
  /** The chosen machine's name, for notices. */
  machineName: string | null
  /** Whether the filter is shown at all. */
  visible: boolean
}

/** The machine filter's current choice, checked against the machines that exist. */
export function useMachineScope(): MachineScope {
  const stored = useSyncExternalStore(subscribeMachineFilter, getMachineFilter, () => ALL_MACHINES)
  const { data } = useQuery(linkStateQuery)
  const visible = !!data?.showMachineFilter
  const machine = visible ? data!.machines.find((m) => m.machineId === stored) : undefined
  return {
    machineId: machine?.machineId,
    isRemote: !!machine && !machine.isSelf,
    machineName: machine?.name ?? null,
    visible,
  }
}
