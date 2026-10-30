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
    <label className="flex items-center justify-end gap-2 text-xs text-gray-400">
      <span>Machine</span>
      <select
        value={value}
        onChange={(e) => setMachineFilter(e.target.value)}
        className="rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1 text-xs text-gray-100 focus:border-brand-500 focus:outline-none"
      >
        <option value={ALL_MACHINES}>All machines</option>
        {data.machines.map((m) => (
          <option key={m.machineId} value={m.machineId}>
            {m.name}
            {m.isSelf ? ' (this machine)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
