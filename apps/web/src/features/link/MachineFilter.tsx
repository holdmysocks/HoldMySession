import { PillSelect } from '@/components/ui/PillSelect'
import { useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ALL_MACHINES, getMachineFilter, setMachineFilter, subscribeMachineFilter } from '@/lib/utils/machine-filter'
import { linkStateQuery } from './link.queries'

/** Choose which machine's data every page shows. Not drawn unless other machines are linked. */
export function MachineFilter() {
  const { data } = useQuery(linkStateQuery)
  const stored = useSyncExternalStore(subscribeMachineFilter, getMachineFilter, () => ALL_MACHINES)
  if (!data?.showMachineFilter) return null
  const value = data.machines.some((m) => m.machineId === stored) ? stored : ALL_MACHINES
  return (
    <PillSelect
      label="Machine"
      value={value}
      align="right"
      onChange={setMachineFilter}
      options={[
        { value: ALL_MACHINES, label: 'All machines' },
        ...data.machines.map((m) => ({ value: m.machineId, label: `${m.name}${m.isSelf ? ' (this machine)' : ''}` })),
      ]}
    />
  )
}
