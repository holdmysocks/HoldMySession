import type { Severity } from '@/lib/usage/limits'
import { SEVERITY_TEXT } from './severity-style'

const SEVERITY_FILL: Record<Severity, string> = { ok: 'bg-brand-400', warn: 'bg-amber-400', danger: 'bg-red-400' }
const SEVERITY_GLOW: Record<Severity, string> = {
  ok: 'shadow-[0_0_10px_var(--hms-glow-strong)]',
  warn: 'shadow-[0_0_10px_rgba(232,176,74,0.5)]',
  danger: 'shadow-[0_0_10px_rgba(240,103,91,0.5)]',
}

/**
 * A bar for one limit. The tick marks even pace: how far through the window it is. An estimate is drawn
 * dashed and grey so it is never taken for a number Claude Code reported.
 */
export function Meter({
  percentage,
  severity,
  elapsed,
  estimate,
  label,
  size = 'md',
}: {
  percentage: number | null
  severity: Severity
  /** 0 to 1: how far through the window it is. */
  elapsed?: number
  estimate?: boolean
  label: string
  size?: 'sm' | 'md'
}) {
  const height = size === 'sm' ? 'h-2' : 'h-2.5'
  const pct = percentage === null ? 0 : Math.max(0, Math.min(100, percentage))
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage === null ? undefined : Math.round(pct)}
      className={`relative ${height} rounded-full bg-[color:var(--hms-track)] ${estimate ? 'outline-dashed outline-1 outline-[color:var(--hms-line)]' : ''}`}
    >
      {percentage !== null && (
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${estimate ? 'bg-gray-400/70' : `${SEVERITY_FILL[severity]} ${SEVERITY_GLOW[severity]}`}`}
          style={{ width: `${pct}%` }}
        />
      )}
      {elapsed !== undefined && !estimate && (
        <div aria-hidden="true" className="absolute -bottom-1 -top-1 w-0.5 rounded-sm bg-gray-100/50" style={{ left: `${Math.max(0, Math.min(100, elapsed * 100))}%` }} />
      )}
    </div>
  )
}

/** A small ring for the header chip. */
export function Ring({ percentage, severity, estimate }: { percentage: number; severity: Severity; estimate?: boolean }) {
  const circumference = 2 * Math.PI * 9
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className={estimate ? 'text-gray-400' : SEVERITY_TEXT[severity]}>
      <circle cx="12" cy="12" r="9" fill="none" strokeWidth="3.5" strokeDasharray={estimate ? '3 3' : undefined} style={{ stroke: 'var(--hms-line)' }} />
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={`${(Math.max(0, Math.min(100, percentage)) / 100) * circumference} ${circumference}`}
        transform="rotate(-90 12 12)"
      />
    </svg>
  )
}
