/** What a session that needs the user is waiting for, in words. Pure: the hook's message and the open question go in. */
export type WaitingKind = 'permission' | 'question' | 'plan' | 'idle' | 'other'

export interface WaitingInfo {
  kind: WaitingKind
  /** One line for a person: "Wants to run Bash", the question itself, and so on. */
  text: string
}

export interface NotificationInfo {
  message: string | null
  type: string | null
}

const MAX = 140
const clip = (s: string) => (s.length > MAX ? `${s.slice(0, MAX - 1)}…` : s)

/**
 * A question the session asked wins, since it is the thing to answer. Otherwise the Notification hook's own
 * message is read: "Claude needs your permission to use Bash" becomes "Wants to run Bash".
 */
export function describeWaiting(input: { question?: string | null; notification?: NotificationInfo | null }): WaitingInfo {
  const question = input.question?.trim()
  if (question) return { kind: 'question', text: clip(question) }

  const message = input.notification?.message?.trim() ?? ''
  const type = input.notification?.type ?? ''
  const permission = /permission to (?:use|run) (.+?)\.?$/i.exec(message)
  if (permission || type === 'permission_prompt') {
    return { kind: 'permission', text: permission ? `Wants to run ${permission[1]}` : clip(message || 'Wants your permission') }
  }
  if (type === 'idle_prompt' || /waiting for your input/i.test(message)) return { kind: 'idle', text: 'Waiting for your next message' }
  if (/\bplan\b/i.test(message)) return { kind: 'plan', text: clip(message) }
  if (type === 'elicitation_dialog' && message) return { kind: 'question', text: clip(message) }
  return { kind: 'other', text: message ? clip(message) : 'Waiting on you' }
}

/** The tag shown beside a waiting session. */
export const WAITING_TAG: Record<WaitingKind, string> = {
  permission: 'PERMISSION',
  question: 'QUESTION',
  plan: 'PLAN',
  idle: 'WAITING',
  other: 'WAITING',
}

/** The waiting line as one sentence about a named session, for the banner and the alert: "Upgrade dependencies wants to run Bash". */
export function waitingSentence(title: string, info: WaitingInfo): string {
  if (info.kind === 'permission') return `${title} ${info.text.charAt(0).toLowerCase()}${info.text.slice(1)}`
  if (info.kind === 'question') return `${title} asks: ${info.text}`
  return `${title}: ${info.text}`
}
