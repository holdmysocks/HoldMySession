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
    <label className="relative flex items-center text-sm">
      <span className="sr-only">Machine</span>
      <select
        value={value}
        onChange={(e) => setMachineFilter(e.target.value)}
        className="min-h-[44px] appearance-none rounded-full border border-gray-700 bg-transparent pl-[18px] pr-9 text-sm font-medium text-gray-100 focus:border-brand-500 focus:outline-none"
      >
        <option value={ALL_MACHINES}>All machines</option>
        {data.machines.map((m) => (
          <option key={m.machineId} value={m.machineId}>
            {m.name}
            {m.isSelf ? ' (this machine)' : ''}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="pointer-events-none absolute right-4 text-[11px]">▾</span>
    </label>
  )
}
