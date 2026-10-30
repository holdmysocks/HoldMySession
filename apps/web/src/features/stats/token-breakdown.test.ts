import { describe, it, expect } from 'vitest'
import { tokenBreakdown } from './token-breakdown'

describe('tokenBreakdown', () => {
  it('splits generated tokens into answer and reasoning, and adds cache to the prompt', () => {
    const result = tokenBreakdown({
      'claude-a': { inputTokens: 100, outputTokens: 1000, cacheReadInputTokens: 50_000, cacheCreationInputTokens: 2_000, thinkingTokens: 400 },
      'claude-b': { inputTokens: 10, outputTokens: 200, cacheReadInputTokens: 5_000, cacheCreationInputTokens: 0, thinkingTokens: 50 },
    })
    expect(result.uncachedInput).toBe(110)
    expect(result.cacheRead).toBe(55_000)
    expect(result.cacheWrite).toBe(2_000)
    expect(result.input).toBe(57_110)
    expect(result.reasoning).toBe(450)
    expect(result.output).toBe(750)
    expect(result.total).toBe(57_110 + 750 + 450)
  })

  it('treats a model with no reasoning figure as having none, so nothing is lost or counted twice', () => {
    const result = tokenBreakdown({
      'claude-a': { inputTokens: 1, outputTokens: 99, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
    })
    expect(result.reasoning).toBe(0)
    expect(result.output).toBe(99)
    expect(result.total).toBe(100)
  })

  it('never reports more reasoning than output', () => {
    const result = tokenBreakdown({
      'claude-a': { inputTokens: 0, outputTokens: 10, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, thinkingTokens: 50 },
    })
    expect(result.reasoning).toBe(10)
    expect(result.output).toBe(0)
    expect(result.total).toBe(10)
  })

  it('is all zero for no usage', () => {
    expect(tokenBreakdown({}).total).toBe(0)
  })
})
