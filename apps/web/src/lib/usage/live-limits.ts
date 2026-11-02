import { readSettingsFile } from '@/lib/settings-file'
import { hasFiveHourLimit, liveWindow, type LimitWindow } from './limits'
import { readUsageSnapshot } from './usage-file'

export interface LiveLimits {
  /** The setting: whether the desktop app tells the user about limits. */
  enabled: boolean
  /** Null for a plan with no 5-hour limit, and while no 5-hour window is running. */
  fiveHour: LimitWindow | null
  sevenDay: LimitWindow | null
  /** ISO time Claude Code last reported, or null. */
  updatedAt: string | null
}

/**
 * What the desktop app asks every half minute: the windows Claude Code last reported that have not reset, under the
 * same 5-hour rule as everything else. It reads one small file, not the transcripts. Server only.
 */
export function readLiveLimits(nowMs: number = Date.now()): LiveLimits {
  const settings = readSettingsFile()
  const snapshot = readUsageSnapshot()
  const mode = settings.limits.fiveHour
  const fiveHourShown = mode === 'always' || (mode === 'auto' && hasFiveHourLimit(snapshot, nowMs))
  return {
    enabled: settings.limits.alerts,
    fiveHour: fiveHourShown ? liveWindow(snapshot?.fiveHour ?? null, nowMs) : null,
    sevenDay: liveWindow(snapshot?.sevenDay ?? null, nowMs),
    updatedAt: snapshot?.updatedAt ?? null,
  }
}
