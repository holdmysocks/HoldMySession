import { format } from 'date-fns'
import { clockPattern } from '@/lib/utils/time-format'
import type { UsageOverview } from './overview'
import { severityOf, timeLeft, type Pace, type Severity } from './limits'

/** One meter as the page draws it. The 5-hour one exists only for a plan that has a 5-hour limit. */
export interface MeterView {
  key: 'five' | 'week'
  label: string
  /** Null when there is nothing to say yet: no window running, or no limit known to measure an estimate against. */
  percentage: number | null
  severity: Severity
  /** Counted from transcripts, not reported by Claude Code. */
  estimate: boolean
  /** Epoch seconds, as Claude Code reports it. */
  resetsAt: number | null
  pace: Pace | null
  /** A 5-hour window is not running: it starts with the next message. */
  idle: boolean
  tokens: number | null
}

const WEEK_LABEL = 'This week'
const FIVE_LABEL = '5-hour window'

/** The meters to draw, 5-hour first. Never a 5-hour one when the plan has none, estimates included. */
export function metersOf(o: UsageOverview): MeterView[] {
  const out: MeterView[] = []
  if (o.fiveHourShown) {
    const live = o.real.fiveHour
    if (live) {
      out.push({ key: 'five', label: FIVE_LABEL, percentage: live.usedPercentage, severity: severityOf(live.usedPercentage), estimate: false, resetsAt: live.resetsAt, pace: live.pace, idle: false, tokens: null })
    } else if (o.estimate.block) {
      const b = o.estimate.block
      out.push({ key: 'five', label: FIVE_LABEL, percentage: b.percentage, severity: b.percentage === null ? 'ok' : severityOf(b.percentage), estimate: true, resetsAt: b.end / 1000, pace: null, idle: false, tokens: b.tokens })
    } else {
      out.push({ key: 'five', label: FIVE_LABEL, percentage: null, severity: 'ok', estimate: false, resetsAt: null, pace: null, idle: true, tokens: null })
    }
  }
  const week = o.real.sevenDay
  if (week) {
    out.push({ key: 'week', label: WEEK_LABEL, percentage: week.usedPercentage, severity: severityOf(week.usedPercentage), estimate: false, resetsAt: week.resetsAt, pace: week.pace, idle: false, tokens: null })
  } else if (o.estimate.week.events > 0) {
    const w = o.estimate.week
    out.push({ key: 'week', label: WEEK_LABEL, percentage: w.percentage, severity: w.percentage === null ? 'ok' : severityOf(w.percentage), estimate: true, resetsAt: null, pace: null, idle: false, tokens: w.tokens })
  }
  return out
}

/** A time of day in the clock the user chose in Settings, 12 or 24 hours. */
const clock = (ms: number) => format(new Date(ms), clockPattern('HH:mm'))
const dayAndClock = (ms: number) => `${format(new Date(ms), 'EEE')} ${clock(ms)}`

/** "Resets in 2h 30m", or what to wait for when there is no window. */
export function resetText(m: MeterView, nowMs: number): string {
  if (m.idle) return 'None running'
  if (m.resetsAt === null) return m.estimate ? 'Estimate' : ''
  return `Resets in ${timeLeft(m.resetsAt, nowMs)}`
}

/** The exact reset time, for a tooltip. */
export function resetAt(m: MeterView): string | null {
  if (m.resetsAt === null) return null
  return m.key === 'week' ? dayAndClock(m.resetsAt * 1000) : clock(m.resetsAt * 1000)
}

/** What the current rate means: when the limit is reached, or where the window ends up. Null while it is too early to say. */
export function paceText(m: MeterView): string | null {
  const p = m.pace
  if (!p || p.projectedPercentage === null) return null
  if (p.hitsLimitAt !== null) return `Limit reached around ${clock(p.hitsLimitAt)} at this pace`
  return `On pace to finish near ${Math.round(p.projectedPercentage)}%`
}

export interface ChipView {
  /** 'meter': a number to show. 'setup': nothing to show and no way to get it yet. 'waiting': switched on, no report yet. */
  kind: 'meter' | 'setup' | 'waiting'
  /** "78%", or "~58%" for an estimate. */
  text: string
  /** Time left for a 5-hour window, "week" for the weekly one, "est." for an estimate. */
  sub: string
  severity: Severity
  /** 0 to 100, for the ring. */
  ring: number
  estimate: boolean
  /** For screen readers and the tooltip. */
  label: string
}

/** What the header chip shows: the first meter with a number, a live one before an estimate, the 5-hour one first. */
export function chipOf(o: UsageOverview, nowMs: number): ChipView {
  const meters = metersOf(o)
  const withNumber = meters.filter((m) => m.percentage !== null)
  const pick = withNumber.find((m) => !m.estimate) ?? withNumber[0]
  if (!pick || pick.percentage === null) {
    const waiting = o.statusLine.installed
    return { kind: waiting ? 'waiting' : 'setup', text: '', sub: '', severity: 'ok', ring: 0, estimate: false, label: waiting ? 'Waiting for Claude Code to report your limits' : 'Show your usage limits' }
  }
  const pct = Math.round(pick.percentage)
  const sub = pick.estimate ? 'est.' : pick.key === 'week' ? 'week' : pick.resetsAt !== null ? timeLeft(pick.resetsAt, nowMs) : ''
  const label = `${pick.label} ${pick.estimate ? 'about ' : ''}${pct} percent used${pick.resetsAt !== null ? `, ${resetText(pick, nowMs).toLowerCase()}` : ''}`
  return { kind: 'meter', text: `${pick.estimate ? '~' : ''}${pct}%`, sub, severity: pick.severity, ring: Math.min(100, pick.percentage), estimate: pick.estimate, label }
}
