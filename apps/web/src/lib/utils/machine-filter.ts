/**
 * Which machine's data the pages show: every machine ('all') or one by its id. Kept in the browser
 * like the theme, and only meaningful on a master with linked nodes.
 */
const KEY = 'holdmysession:machine-filter'
export const ALL_MACHINES = 'all'

const listeners = new Set<() => void>()
let current: string | null = null

function read(): string {
  try {
    return localStorage.getItem(KEY) || ALL_MACHINES
  } catch {
    return ALL_MACHINES
  }
}

export function getMachineFilter(): string {
  if (current === null) current = read()
  return current
}

export function setMachineFilter(value: string): void {
  current = value
  try {
    localStorage.setItem(KEY, value)
  } catch {
    // Not remembered, which is fine.
  }
  for (const listener of listeners) listener()
}

export function subscribeMachineFilter(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
