import type { SessionStatus } from '@/lib/status/session-status'

/**
 * Border colour and pulse class per session status, for cards. The pulse classes are
 * defined in app.css, which also switches them off for prefers-reduced-motion.
 * The map uses the same colours on SVG strokes (see MapCanvas).
 */
export const STATUS_BORDER: Record<SessionStatus, string> = {
  'needs-you': 'border-yellow-400',
  active: 'border-green-500',
  completed: 'border-brand-500',
  idle: 'border-gray-600',
}

export const STATUS_PULSE: Record<SessionStatus, string> = {
  'needs-you': 'status-pulse-needs-you',
  active: 'status-pulse-active',
  completed: '',
  idle: '',
}
