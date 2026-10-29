import type { RawJsonlMessage } from './types'

/** Longest session name kept for display. Longer text is cut with an ellipsis. */
export const MAX_SESSION_NAME_LENGTH = 80

export interface SessionNameState {
  /** Text of the most recent `custom-title` line: the name the user set with /rename or --name. */
  customTitle: string | null
  /** Text of the most recent `summary` line seen so far (Claude Code's auto-title). */
  summary: string | null
  /** Text of the first real user message seen so far. */
  firstUserText: string | null
}

export function createSessionNameState(): SessionNameState {
  return { customTitle: null, summary: null, firstUserText: null }
}

/**
 * Feed one parsed JSONL line, in file order. Later title lines overwrite earlier ones, so
 * the newest name wins. The first user text is kept once it is found.
 */
export function observeSessionName(state: SessionNameState, msg: RawJsonlMessage): void {
  observeTitleLine(state, msg)

  if (state.firstUserText === null && msg.type === 'user' && !msg.isMeta) {
    const text = firstUserText(msg)
    if (text) state.firstUserText = text
  }
}

/**
 * Only the title lines (`custom-title` and `summary`). Use this for lines from the end of
 * a file, where the first user message is not in view.
 */
export function observeTitleLine(state: SessionNameState, msg: RawJsonlMessage): void {
  if (msg.type === 'custom-title' && typeof msg.customTitle === 'string' && msg.customTitle.trim()) {
    state.customTitle = msg.customTitle
  }
  if (msg.type === 'summary' && typeof msg.summary === 'string' && msg.summary.trim()) {
    state.summary = msg.summary
  }
}

/**
 * Precedence: the user's name (custom-title), then Claude Code's summary title, then the
 * first user message. This is the order Claude Code's own picker uses, minus agent names.
 */
export function resolveSessionName(state: SessionNameState): string | null {
  return (
    truncateSessionName(state.customTitle) ??
    truncateSessionName(state.summary) ??
    truncateSessionName(state.firstUserText)
  )
}

/**
 * Collapse whitespace, trim, and cut to MAX_SESSION_NAME_LENGTH characters including
 * the ellipsis. Returns null for empty input.
 */
export function truncateSessionName(text: string | null): string | null {
  if (!text) return null
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (!collapsed) return null
  if (collapsed.length <= MAX_SESSION_NAME_LENGTH) return collapsed
  return `${collapsed.slice(0, MAX_SESSION_NAME_LENGTH - 1).trimEnd()}…`
}

/**
 * Text of a user message, or null when it has none. Tool results and Claude Code's
 * command wrappers (`<command-name>`, `<local-command-stdout>`) are skipped, because
 * they are not something the user asked for.
 */
function firstUserText(msg: RawJsonlMessage): string | null {
  const content = msg.message?.content as unknown
  if (typeof content === 'string') return isCommandWrapper(content) ? null : content

  if (!Array.isArray(content)) return null
  for (const block of content as Array<{ type?: string; text?: unknown }>) {
    if (block?.type !== 'text' || typeof block.text !== 'string') continue
    if (!block.text.trim() || isCommandWrapper(block.text)) continue
    return block.text
  }
  return null
}

function isCommandWrapper(text: string): boolean {
  const start = text.trimStart()
  return start.startsWith('<command-') || start.startsWith('<local-command-')
}
