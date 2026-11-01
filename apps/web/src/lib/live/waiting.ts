import { scanAllSessionsWithPaths } from '@/lib/scanner/session-scanner'
import { findPendingQuestions } from '@/lib/map/pending-requests'
import { filterVisibleSessions } from '@/lib/map/session-visibility'
import { latestNotificationDetails, readRecentEvents } from '@/lib/events/event-inbox'
import { deriveSessionStatus } from '@/lib/status/session-status'
import { describeWaiting, type WaitingInfo } from '@/lib/map/waiting'

export interface WaitingSession {
  sessionId: string
  /** The project's directory name, which the map is keyed by. */
  projectKey: string
  projectName: string
  title: string
  waiting: WaitingInfo
  /** When the wait began. A session that waits again later has a new value, so it is told about again. */
  since: string
}

/** The sessions on this computer that are waiting on the user right now, longest wait first. Server only. */
export async function listWaitingSessions(nowMs: number = Date.now()): Promise<WaitingSession[]> {
  const all = filterVisibleSessions(await scanAllSessionsWithPaths()).filter((s) => s.isActive)
  if (all.length === 0) return []
  const details = latestNotificationDetails(await readRecentEvents())
  const out: WaitingSession[] = []
  for (const s of all) {
    const questions = await findPendingQuestions(s.filePath)
    const notification = details.get(s.sessionId)
    const status = deriveSessionStatus(
      {
        isActive: true,
        lastActiveAt: s.lastActiveAt,
        lastStopReason: s.lastStopReason,
        lastNotificationAt: notification?.ts ?? null,
        hasOpenQuestion: questions.length > 0,
      },
      nowMs,
    )
    if (status !== 'needs-you') continue
    out.push({
      sessionId: s.sessionId,
      projectKey: s.projectKey,
      projectName: s.projectDisplayName,
      title: s.sessionName ?? 'Untitled session',
      waiting: describeWaiting({
        question: questions[0]?.questions[0]?.question,
        notification: notification ? { message: notification.message, type: notification.notificationType } : null,
      }),
      since: questions.length > 0 ? questions[0].timestamp : (notification?.ts ?? s.lastActiveAt),
    })
  }
  return out.sort((a, b) => a.since.localeCompare(b.since))
}
