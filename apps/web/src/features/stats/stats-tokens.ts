import type { StatsCache, TokenUsage } from '@/lib/parsers/types'

export const EMPTY_TOKENS_BY_MODEL: Record<string, TokenUsage> = {}

/** Per-model token totals from a StatsCache, in the shape the cost calculator takes. */
export function tokensByModelOf(stats: StatsCache | null | undefined): Record<string, TokenUsage> {
  if (!stats) return EMPTY_TOKENS_BY_MODEL
  const result: Record<string, TokenUsage> = {}
  for (const [model, usage] of Object.entries(stats.modelUsage)) {
    result[model] = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      thinkingTokens: usage.thinkingTokens,
    }
  }
  return result
}
