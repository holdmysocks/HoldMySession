import { useQuery } from '@tanstack/react-query'
import { linkStateQuery } from './link.queries'

/** True when this install is a node that takes its prices and plan from a master. */
export function useIsLinkedNode(): boolean {
  const { data } = useQuery(linkStateQuery)
  return !!data?.linkedNode
}

/** Says so, on the cards whose contents the master owns. Draws nothing on an install that is not linked. */
export function LinkedNote({ what }: { what: string }) {
  const { data } = useQuery(linkStateQuery)
  if (!data?.linkedNode) return null
  return (
    <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
      The {what} come from the master{data.sync.masterName ? `, ${data.sync.masterName}` : ''}, so they cannot be changed here. Change them there.
    </p>
  )
}
