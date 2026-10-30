import { scanAllSessionsWithPaths } from '@/lib/scanner/session-scanner'
import { findPendingQuestions } from '@/lib/map/pending-requests'
import { filterArchivedSessions, filterHiddenSessions, filterVisibleSessions } from '@/lib/map/session-visibility'
import { latestNotificationBySession, readRecentEvents } from '@/lib/events/event-inbox'
import type { SessionSummary } from '@/lib/parsers/types'

/** A listed session with what the page needs to show its status. */
export interface LiveSessionItem extends SessionSummary {
  lastNotificationAt: string | null
  hasOpenQuestion: boolean
}

export interface LiveSessions {
  items: LiveSessionItem[]
  hiddenNoProjectCount: number
  hiddenArchivedCount: number
}

/** Every visible session on this computer with its live status. This is what a node hands a master. Server only. */
export async function liveSessions(): Promise<LiveSessions> {
  const all = await scanAllSessionsWithPaths()
  const visible = filterVisibleSessions(all)
  const notifications = latestNotificationBySession(await readRecentEvents())
  const items = await Promise.all(
    visible.map(async ({ filePath, ...summary }): Promise<LiveSessionItem> => ({
      ...summary,
      lastNotificationAt: notifications.get(summary.sessionId) ?? null,
      hasOpenQuestion: summary.isActive && (await findPendingQuestions(filePath)).length > 0,
    })),
  )
  return {
    items,
    hiddenNoProjectCount: filterHiddenSessions(all).length,
    hiddenArchivedCount: filterArchivedSessions(all).length,
  }
}
