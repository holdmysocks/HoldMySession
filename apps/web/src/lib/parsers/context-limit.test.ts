import { describe, it, expect } from 'vitest'
import { applyAutoCompactWindow, contextLimitFor, deriveContextWindow, WINDOW_1M, WINDOW_200K } from './context-limit'

describe('contextLimitFor', () => {
  it('gives the current model families a 1M window', () => {
    for (const model of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1', 'claude-opus-5', 'claude-opus-4-8', 'claude-sonnet-4-6']) {
      expect(contextLimitFor(model, 50_000)).toEqual({ tokens: WINDOW_1M, source: 'model' })
    }
  })

  it('gives older models their known 200K, and a model it does not recognise a 200K default', () => {
    for (const model of ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-sonnet-4', 'claude-opus-4-5', 'claude-opus-4-1', 'claude-opus-4', 'claude-haiku-3-5', 'claude-haiku-3']) {
      expect(contextLimitFor(model, 50_000)).toEqual({ tokens: WINDOW_200K, source: 'model' })
    }
    expect(contextLimitFor('unknown', 0)).toEqual({ tokens: WINDOW_200K, source: 'default' })
    expect(contextLimitFor('', 0)).toEqual({ tokens: WINDOW_200K, source: 'default' })
  })

  it('ignores a date suffix', () => {
    expect(contextLimitFor('claude-opus-5-5-20261001', 1).tokens).toBe(WINDOW_1M)
    expect(contextLimitFor('claude-haiku-4-5-20251001', 1).tokens).toBe(WINDOW_200K)
  })

  it('reads a [1m] marker as a 1M window for any model', () => {
    expect(contextLimitFor('claude-sonnet-4-5[1m]', 10)).toEqual({ tokens: WINDOW_1M, source: 'model' })
  })

  it('widens a 200K model to 1M when the session used more than 200K', () => {
    expect(contextLimitFor('claude-sonnet-4-5', 676_000)).toEqual({ tokens: WINDOW_1M, source: 'observed' })
    expect(contextLimitFor('unknown', 250_000)).toEqual({ tokens: WINDOW_1M, source: 'observed' })
  })

  it('does not widen a window the session never filled, and keeps exactly 200K as 200K', () => {
    expect(contextLimitFor('claude-haiku-4-5', 200_000)).toEqual({ tokens: WINDOW_200K, source: 'model' })
  })

  it('rounds up to the next whole million when a session used more than 1M', () => {
    expect(contextLimitFor('claude-opus-5-5', 1_200_000)).toEqual({ tokens: 2_000_000, source: 'observed' })
    expect(contextLimitFor('claude-haiku-4-5', 1_200_000).tokens).toBe(2_000_000)
  })
})

describe('applying the auto-compact setting', () => {
  const snapshots = (...sizes: number[]) =>
    sizes.map((contextSize, turnIndex) => ({ turnIndex, timestamp: '', contextSize, outputTokens: 0 }))
  const detected = (...sizes: number[]) => deriveContextWindow(snapshots(...sizes), 'claude-haiku-5-5', WINDOW_1M, 'model')

  it('makes the setting the limit, and works everything else out from it', () => {
    const result = applyAutoCompactWindow(detected(10_000, 300_000), 400_000)!
    expect(result.contextLimit).toBe(400_000)
    expect(result.contextLimitSource).toBe('setting')
    expect(result.usagePercent).toBe(75)
    expect(result.freeSpace).toBe(100_000)
    expect(result.autocompactBuffer).toBe(66_000)
    expect(result.currentContextSize).toBe(300_000)
    expect(result.modelName).toBe('claude-haiku-5-5')
    expect(result.snapshots).toHaveLength(2)
  })

  it('leaves the detected window alone when nothing is set', () => {
    const window = detected(10_000, 300_000)
    expect(applyAutoCompactWindow(window, null)).toBe(window)
    expect(applyAutoCompactWindow(null, 400_000)).toBeNull()
  })

  it('keeps the detected window when the session already holds more than the setting', () => {
    const window = detected(10_000, 450_000)
    expect(applyAutoCompactWindow(window, 400_000)).toBe(window)
  })

  it('uses a setting that exactly matches the current context', () => {
    expect(applyAutoCompactWindow(detected(10_000, 400_000), 400_000)!.usagePercent).toBe(100)
  })
})
