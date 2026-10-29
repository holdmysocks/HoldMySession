/**
 * One status model for the Sessions list and the project map. Pure, so the server and
 * the browser agree on the same rules.
 */

/**
 * How long after the last write a session that ended its turn still shows as completed.
 * Older sessions show as idle. This is a display window chosen for the dashboard, not the
 * prompt-cache TTL.
 */
export const COMPLETED_WINDOW_MS = 60 * 60_000

/**
 * How long a subagent's transcript stays "running" after its last write. Subagent caches
 * expire after 5 minutes, so a subagent quiet for longer is treated as expired: the map
 * does not draw it and only counts it. Sessions use COMPLETED_WINDOW_MS instead.
 */
export const SUBAGENT_CACHE_WINDOW_MS = 5 * 60_000

export type SessionStatus = 'needs-you' | 'active' | 'completed' | 'idle'

export interface SessionStatusInput {
  /** From the active detector: JSONL written within 2 minutes and a lock directory present. */
  isActive: boolean
  /** Timestamp of the last line in the file, ISO 8601. */
  lastActiveAt: string
  /** `stop_reason` of the last assistant message, or null. */
  lastStopReason: string | null
  /** Latest Notification hook event for this session, ISO 8601, or null. */
  lastNotificationAt: string | null
  /** True when an AskUserQuestion has no answer yet. */
  hasOpenQuestion: boolean
}

/**
 * Priority: needs-you > active > completed > idle.
 *
 * An open question or a Notification only counts while the session is active. Once a
 * session goes quiet, an unanswered question means it was abandoned, not that it waits.
 */
export function deriveSessionStatus(input: SessionStatusInput, nowMs: number): SessionStatus {
  if (input.isActive) {
    return needsYou(input) ? 'needs-you' : 'active'
  }

  const lastWriteMs = Date.parse(input.lastActiveAt)
  const withinCompletedWindow = nowMs - lastWriteMs <= COMPLETED_WINDOW_MS
  if (input.lastStopReason === 'end_turn' && withinCompletedWindow) return 'completed'

  return 'idle'
}

function needsYou(input: SessionStatusInput): boolean {
  if (input.hasOpenQuestion) return true
  if (!input.lastNotificationAt) return false
  // Compare instants, not strings: timestamps can carry different UTC offsets.
  return Date.parse(input.lastNotificationAt) > Date.parse(input.lastActiveAt)
}
