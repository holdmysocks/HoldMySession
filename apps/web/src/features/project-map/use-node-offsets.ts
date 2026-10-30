import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { NodeOffsets } from '@/lib/map/layout'
import { getStoredOffsets, parseNodeOffsets, setStoredOffsets, subscribeStoredOffsets } from './node-offsets-storage'

/**
 * The editor's node positions for a project, and a setter that saves them. Reads from storage on
 * the client and is empty on the server, so the first server render and the hydrated one agree.
 */
export function useNodeOffsets(projectKey: string): readonly [NodeOffsets, (next: NodeOffsets) => void] {
  const raw = useSyncExternalStore(
    subscribeStoredOffsets,
    () => getStoredOffsets(projectKey),
    () => null,
  )
  const offsets = useMemo(() => parseNodeOffsets(raw), [raw])
  const setOffsets = useCallback((next: NodeOffsets) => setStoredOffsets(projectKey, next), [projectKey])
  return [offsets, setOffsets] as const
}
