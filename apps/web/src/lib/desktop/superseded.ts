/**
 * A desktop session can have several transcripts, and the app's record names the current one.
 * The older ones are hidden. But if the current transcript is not among the files scanned, hiding
 * every older one would make the whole session vanish. This keeps one transcript visible per desktop
 * session: the current one when it is there, and otherwise the most recently active of the rest.
 * Pure, so it can be tested without files.
 */

export interface TranscriptEntry {
  sessionId: string
  lastActiveAt: string
  /** The desktop app's ID for the session this transcript belongs to, or null when there is no record. */
  desktopRecordId?: string | null
  isSuperseded?: boolean
}

/** The sessions, with one transcript of each desktop session left unsuperseded. Others are unchanged. */
export function keepOneTranscriptPerSession<T extends TranscriptEntry>(sessions: T[]): T[] {
  const byRecord = new Map<string, T[]>()
  for (const session of sessions) {
    if (!session.desktopRecordId) continue
    const group = byRecord.get(session.desktopRecordId) ?? []
    group.push(session)
    byRecord.set(session.desktopRecordId, group)
  }

  const restored = new Set<string>()
  for (const group of byRecord.values()) {
    if (group.some((session) => !session.isSuperseded)) continue
    // The current transcript is not here. The newest of the older ones stands in for the session.
    const newest = group.reduce((best, session) => (session.lastActiveAt > best.lastActiveAt ? session : best))
    restored.add(newest.sessionId)
  }

  return restored.size === 0
    ? sessions
    : sessions.map((session) => (restored.has(session.sessionId) ? { ...session, isSuperseded: false } : session))
}
