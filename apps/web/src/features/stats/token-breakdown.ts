import type { StatsCache } from '@/lib/parsers/types'

export interface TokenBreakdown {
  /** Prompt tokens: new input plus cache reads plus cache writes. */
  input: number
  uncachedInput: number
  cacheRead: number
  cacheWrite: number
  /** Answer tokens: generated output without the reasoning. */
  output: number
  /** Reasoning tokens, a part of the billed output. */
  reasoning: number
  /** input + output + reasoning, which is every token processed. */
  total: number
}

/**
 * Adds up every model's usage into input, output and reasoning. The transcripts report reasoning
 * as a part of the output tokens, so it is taken out of the output figure and the three add up to
 * the total without counting anything twice.
 */
export function tokenBreakdown(modelUsage: StatsCache['modelUsage']): TokenBreakdown {
  let uncachedInput = 0
  let cacheRead = 0
  let cacheWrite = 0
  let generated = 0
  let reasoning = 0
  for (const usage of Object.values(modelUsage)) {
    uncachedInput += usage.inputTokens
    cacheRead += usage.cacheReadInputTokens
    cacheWrite += usage.cacheCreationInputTokens
    generated += usage.outputTokens
    reasoning += Math.min(usage.thinkingTokens ?? 0, usage.outputTokens)
  }
  const input = uncachedInput + cacheRead + cacheWrite
  const output = generated - reasoning
  return { input, uncachedInput, cacheRead, cacheWrite, output, reasoning, total: input + output + reasoning }
}
