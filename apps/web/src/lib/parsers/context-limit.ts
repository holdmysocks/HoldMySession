/**
 * The context window a session ran with. Transcripts do not record it, so it is worked out from
 * what is known: the model, and how much context the session actually used. Pure.
 */

export const WINDOW_200K = 200_000
export const WINDOW_1M = 1_000_000

/** Model families by ID prefix, with the window each has by default. Newest and most specific first. */
const MODEL_WINDOWS: Array<[RegExp, number]> = [
  [/^claude-(fable|mythos)-5/, WINDOW_1M],
  [/^claude-opus-5/, WINDOW_1M],
  [/^claude-opus-4-[678]/, WINDOW_1M],
  [/^claude-sonnet-5/, WINDOW_1M],
  [/^claude-sonnet-4-6/, WINDOW_1M],
  [/^claude-haiku-5/, WINDOW_1M],
  // Older models, known to have 200K.
  [/^claude-(opus|sonnet|haiku)-[34](-\d)?$/, WINDOW_200K],
]

import type { ContextWindowData, ContextWindowSnapshot } from './types'

/**
 * Where a window size came from: the model's known window, what the session used, a 200K default for
 * a model not recognised, or the user's own auto-compact setting.
 */
export type ContextLimitSource = 'model' | 'observed' | 'default' | 'setting'

export interface ContextLimit {
  tokens: number
  /** Where the number came from: the model's known window, what the session used, or a 200K default for a model not recognised. */
  source: ContextLimitSource
}

/** A model ID without a date suffix or a `[1m]` marker, in lower case, so IDs of one model compare equal. */
export function normalizeModelKey(modelName: string): string {
  return modelName.toLowerCase().replace(/\[1m\]/, '').replace(/-\d{8}$/, '')
}

/**
 * The window for a model, and the session's peak context. The model gives a starting point: 1M for
 * the current families, 200K for older ones and unknown names. A `[1m]` marker in the name means 1M.
 * A session cannot use more context than its window holds, so a peak above the starting point means
 * the window is larger, and the next whole million is used.
 */
export function contextLimitFor(modelName: string, observedPeak: number): ContextLimit {
  const marked = /\[1m\]/i.test(modelName)
  const name = normalizeModelKey(modelName)
  const known = MODEL_WINDOWS.find(([pattern]) => pattern.test(name))

  let tokens = marked ? WINDOW_1M : (known?.[1] ?? WINDOW_200K)
  let source: ContextLimitSource = marked || known ? 'model' : 'default'

  if (observedPeak > tokens) {
    tokens = tokens < WINDOW_1M ? WINDOW_1M : Math.ceil(observedPeak / WINDOW_1M) * WINDOW_1M
    if (observedPeak > tokens) tokens = Math.ceil(observedPeak / WINDOW_1M) * WINDOW_1M
    source = 'observed'
  }
  return { tokens, source }
}

/** Share of the window kept free for compaction. The panel draws it as the autocompact buffer. */
const AUTOCOMPACT_BUFFER_SHARE = 0.165

/** The context window figures for a session, given the window size and where it came from. */
export function deriveContextWindow(
  snapshots: ContextWindowSnapshot[],
  modelName: string,
  contextLimit: number,
  contextLimitSource: ContextLimitSource,
): ContextWindowData {
  const systemOverhead = snapshots[0].contextSize
  const currentContextSize = snapshots[snapshots.length - 1].contextSize
  return {
    contextLimit,
    contextLimitSource,
    modelName,
    systemOverhead,
    currentContextSize,
    messagesEstimate: Math.max(0, currentContextSize - systemOverhead),
    freeSpace: Math.max(0, contextLimit - currentContextSize),
    autocompactBuffer: Math.round(contextLimit * AUTOCOMPACT_BUFFER_SHARE),
    usagePercent: Math.round((currentContextSize / contextLimit) * 100),
    snapshots,
  }
}

/**
 * The window with the user's auto-compact setting applied. The setting is the window they chose to
 * work in, so it becomes the limit. But when the session already holds more than that, it ran before
 * the setting or in spite of it, and the detected window is kept.
 */
export function applyAutoCompactWindow(
  contextWindow: ContextWindowData | null,
  configured: number | null,
): ContextWindowData | null {
  if (!contextWindow || configured === null) return contextWindow
  if (contextWindow.currentContextSize > configured) return contextWindow
  return deriveContextWindow(contextWindow.snapshots, contextWindow.modelName, configured, 'setting')
}
