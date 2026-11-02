/**
 * The real subscription limits, as Claude Code reports them to its status line: a rolling 5-hour window
 * and a weekly one, each with the share used and when it resets. Pure, so the server and the browser agree.
 */
export const FIVE_HOUR_MS = 5 * 3_600_000
export const SEVEN_DAY_MS = 7 * 24 * 3_600_000

export interface LimitWindow {
  /** 0 to 100 */
  usedPercentage: number
  /** Unix epoch seconds, as Claude Code gives it. */
  resetsAt: number
}

export interface UsageSnapshot {
  /** When Claude Code last reported these, as an ISO time. */
  updatedAt: string
  fiveHour: LimitWindow | null
  sevenDay: LimitWindow | null
  /**
   * When Claude Code last reported a 5-hour window at all. Some plans have none, and the 5-hour meter is
   * only drawn for a plan that does. Between windows there is none either, so this outlasts the window.
   */
  fiveHourSeenAt?: string | null
}

/** From this share the meter turns yellow, and from the next it turns red. */
export const WARN_AT = 75
export const DANGER_AT = 90

export type Severity = 'ok' | 'warn' | 'danger'

export function severityOf(usedPercentage: number): Severity {
  return usedPercentage >= DANGER_AT ? 'danger' : usedPercentage >= WARN_AT ? 'warn' : 'ok'
}

/** How long after the last 5-hour report a plan still counts as having a 5-hour limit. */
export const FIVE_HOUR_MEMORY_MS = 30 * 24 * 3_600_000

/** Whether a 5-hour window has been reported lately. Without one, the plan has no 5-hour limit to show. */
export function hasFiveHourLimit(snapshot: UsageSnapshot | null, nowMs: number): boolean {
  const seen = snapshot?.fiveHourSeenAt ? Date.parse(snapshot.fiveHourSeenAt) : NaN
  if (!Number.isNaN(seen)) return nowMs - seen <= FIVE_HOUR_MEMORY_MS
  // An older file, from before this was recorded, counts if it holds a window.
  return snapshot?.fiveHour != null
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function windowFrom(value: unknown): LimitWindow | null {
  if (!isObject(value)) return null
  const used = Number(value.used_percentage)
  const resets = Number(value.resets_at)
  if (!Number.isFinite(used) || !Number.isFinite(resets) || resets <= 0) return null
  return { usedPercentage: Math.min(100, Math.max(0, used)), resetsAt: resets }
}

/** The windows in a status line input, or null when it has none: no subscription, or before the first answer of a session. */
export function parseRateLimits(input: unknown, now: Date = new Date()): UsageSnapshot | null {
  if (!isObject(input) || !isObject(input.rate_limits)) return null
  const fiveHour = windowFrom(input.rate_limits.five_hour)
  const sevenDay = windowFrom(input.rate_limits.seven_day)
  if (!fiveHour && !sevenDay) return null
  return { updatedAt: now.toISOString(), fiveHour, sevenDay, fiveHourSeenAt: fiveHour ? now.toISOString() : null }
}

/** A window that has not reset yet. Claude Code drops a window once its time passes, and so do we. */
export function liveWindow(window: LimitWindow | null, nowMs: number): LimitWindow | null {
  return window && window.resetsAt * 1000 > nowMs ? window : null
}

/**
 * A new report on top of the last one. A window the new report leaves out is kept while it has not
 * reset, because Claude Code sometimes sends one window without the other.
 */
export function mergeSnapshots(previous: UsageSnapshot | null, next: UsageSnapshot, nowMs: number): UsageSnapshot {
  return {
    updatedAt: next.updatedAt,
    fiveHour: liveWindow(next.fiveHour, nowMs) ?? liveWindow(previous?.fiveHour ?? null, nowMs),
    sevenDay: liveWindow(next.sevenDay, nowMs) ?? liveWindow(previous?.sevenDay ?? null, nowMs),
    fiveHourSeenAt: next.fiveHour ? next.updatedAt : (next.fiveHourSeenAt ?? previous?.fiveHourSeenAt ?? null),
  }
}

/** Reads a stored snapshot back, or null if it is not one. */
export function snapshotFromStored(value: unknown): UsageSnapshot | null {
  if (!isObject(value) || typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt))) return null
  const read = (w: unknown): LimitWindow | null =>
    isObject(w) && Number.isFinite(Number(w.usedPercentage)) && Number.isFinite(Number(w.resetsAt))
      ? { usedPercentage: Math.min(100, Math.max(0, Number(w.usedPercentage))), resetsAt: Number(w.resetsAt) }
      : null
  const seen = typeof value.fiveHourSeenAt === 'string' && !Number.isNaN(Date.parse(value.fiveHourSeenAt)) ? value.fiveHourSeenAt : null
  return { updatedAt: value.updatedAt, fiveHour: read(value.fiveHour), sevenDay: read(value.sevenDay), fiveHourSeenAt: seen }
}

/** Of two snapshots, the one reported last. Machines each keep their own, and the limit belongs to the account. */
export function freshest(a: UsageSnapshot | null, b: UsageSnapshot | null): UsageSnapshot | null {
  if (!a) return b
  if (!b) return a
  return Date.parse(a.updatedAt) >= Date.parse(b.updatedAt) ? a : b
}

export interface Pace {
  /** How far through the window it is, 0 to 1. */
  elapsed: number
  /** Where the share used lands at the reset if the rate so far holds, in percent. Null while too little of the window has passed. */
  projectedPercentage: number | null
  /** When the limit would be reached at this rate, as epoch milliseconds. Null when it would not be before the reset. */
  hitsLimitAt: number | null
}

/** Too little of a window has passed to say anything about its rate. */
export const MIN_ELAPSED_FOR_PACE = 0.08

/** Whether the current rate reaches the limit before the window resets, and when. */
export function paceOf(window: LimitWindow, windowMs: number, nowMs: number): Pace {
  const resetMs = window.resetsAt * 1000
  const startMs = resetMs - windowMs
  const elapsed = Math.min(1, Math.max(0, (nowMs - startMs) / windowMs))
  if (elapsed < MIN_ELAPSED_FOR_PACE || window.usedPercentage <= 0) return { elapsed, projectedPercentage: null, hitsLimitAt: null }
  const projected = window.usedPercentage / elapsed
  if (projected <= 100) return { elapsed, projectedPercentage: projected, hitsLimitAt: null }
  const perMs = window.usedPercentage / (nowMs - startMs)
  const hitsLimitAt = nowMs + (100 - window.usedPercentage) / perMs
  return { elapsed, projectedPercentage: projected, hitsLimitAt: hitsLimitAt < resetMs ? hitsLimitAt : null }
}

/** "62% · 2h 10m left" style pieces. */
export function timeLeft(resetsAtSeconds: number, nowMs: number): string {
  const ms = Math.max(0, resetsAtSeconds * 1000 - nowMs)
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}
