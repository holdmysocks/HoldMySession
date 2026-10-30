import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { NodePositions } from '@/lib/map/layout'
import { mapLayoutQuery } from './project-map.queries'
import { saveMapLayout } from './map-layout.api'

/** Wait this long after the last move before saving, so a drag is one save and not hundreds. */
const SAVE_DELAY_MS = 600
/** Wait this long before trying again after a save failed. */
const RETRY_DELAY_MS = 5_000
const NONE: NodePositions = {}

interface Pending {
  key: string
  positions: NodePositions
}

/**
 * The layout the user arranged for a project, kept on the server so it follows them to any device.
 * Moves show at once from a local draft and are saved a moment later. Once the save lands the
 * server's copy is shown again, so a layout changed on another device appears when this tab is
 * next focused. A failed save is kept and retried.
 */
export function useMapLayout(projectKey: string) {
  const queryClient = useQueryClient()
  const query = useQuery(mapLayoutQuery(projectKey))
  const [draft, setDraft] = useState<Pending | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const pending = useRef<Pending | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const edits = useRef(0)
  // Scheduled saves call the latest flush through this, since flush schedules its own retry.
  const flushRef = useRef<() => Promise<void>>(() => Promise.resolve())

  const schedule = useCallback((delayMs: number) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flushRef.current(), delayMs)
  }, [])

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const job = pending.current
    if (!job) return
    pending.current = null
    const editsAtStart = edits.current
    try {
      await saveMapLayout({ data: { projectKey: job.key, positions: job.positions } })
      queryClient.setQueryData(mapLayoutQuery(job.key).queryKey, job.positions)
      setSaveFailed(false)
      // Show the saved copy again, unless something was moved while the save was running.
      if (edits.current === editsAtStart) setDraft((current) => (current?.key === job.key ? null : current))
    } catch {
      setSaveFailed(true)
      if (!pending.current) {
        pending.current = job
        schedule(RETRY_DELAY_MS)
      }
    }
  }, [queryClient, schedule])

  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  const setPositions = useCallback(
    (next: NodePositions) => {
      // A move in another project must not replace this one's unsaved layout. Save that one first.
      if (pending.current && pending.current.key !== projectKey) void flush()
      edits.current += 1
      pending.current = { key: projectKey, positions: next }
      setDraft({ key: projectKey, positions: next })
      schedule(SAVE_DELAY_MS)
    },
    [projectKey, flush, schedule],
  )

  // Leaving the page saves what is waiting.
  useEffect(
    () => () => {
      void flush()
    },
    [flush],
  )

  const positions = draft?.key === projectKey ? draft.positions : (query.data ?? NONE)
  return { positions, setPositions, isLoading: query.isLoading, saveFailed }
}
