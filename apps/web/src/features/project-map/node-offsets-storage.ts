import type { NodeOffsets } from '@/lib/map/layout'

/**
 * Where the editor's node positions are kept: this browser's local storage, one entry per project.
 * It is a per-viewer convenience, so every read and write is guarded. Storage can be missing
 * (server render, private window) or full, and the editor must still work without it, so the
 * values are also held in memory for the life of the page.
 */

const KEY_PREFIX = 'session-map-offsets:'

/** The stored text per project, read from storage on first use and kept current by writes. */
const stored = new Map<string, string | null>()
const listeners = new Set<() => void>()

function storageKey(projectKey: string): string {
  return `${KEY_PREFIX}${projectKey}`
}

/** Pure: the offsets in a stored value. Anything that is not a finite number pair is dropped. */
export function parseNodeOffsets(raw: string | null): NodeOffsets {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const offsets: NodeOffsets = {}
  for (const [id, value] of Object.entries(parsed)) {
    if (typeof value !== 'object' || value === null) continue
    const { dx, dy } = value as Record<string, unknown>
    if (typeof dx === 'number' && typeof dy === 'number' && Number.isFinite(dx) && Number.isFinite(dy)) {
      offsets[id] = { dx, dy }
    }
  }
  return offsets
}

/** The stored text for a project, or null. The same string is returned until a write changes it. */
export function getStoredOffsets(projectKey: string): string | null {
  if (!stored.has(projectKey)) {
    let value: string | null = null
    try {
      value = window.localStorage.getItem(storageKey(projectKey))
    } catch {
      // No storage here. Start empty.
    }
    stored.set(projectKey, value)
  }
  return stored.get(projectKey) ?? null
}

/** Saves `offsets` for the project and tells subscribers. An empty set removes the entry. */
export function setStoredOffsets(projectKey: string, offsets: NodeOffsets): void {
  const value = Object.keys(offsets).length === 0 ? null : JSON.stringify(offsets)
  stored.set(projectKey, value)
  try {
    if (value === null) window.localStorage.removeItem(storageKey(projectKey))
    else window.localStorage.setItem(storageKey(projectKey), value)
  } catch {
    // Storage is unavailable or full. The positions last until the page is closed.
  }
  for (const listener of listeners) listener()
}

export function subscribeStoredOffsets(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
