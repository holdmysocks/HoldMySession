import { describe, expect, it } from 'vitest'
import { KEEP_GUESSES, calibrationFromStored, estimatedPercentage, limitOf, withGuess } from './calibration'

describe('calibration', () => {
  it('reads junk as empty and keeps only good numbers', () => {
    expect(calibrationFromStored(null)).toEqual({ fiveHour: [], sevenDay: [] })
    expect(calibrationFromStored('x')).toEqual({ fiveHour: [], sevenDay: [] })
    expect(calibrationFromStored({ fiveHour: [1, 'a', -2, NaN, 3], sevenDay: 7 })).toEqual({ fiveHour: [1, 3], sevenDay: [] })
  })
  it('adds a guess, skips a repeat and a missing one, and keeps the latest few', () => {
    let c = calibrationFromStored(null)
    c = withGuess(c, 'fiveHour', 100)
    expect(withGuess(c, 'fiveHour', 100)).toBe(c)
    expect(withGuess(c, 'fiveHour', null)).toBe(c)
    for (let i = 1; i <= KEEP_GUESSES + 5; i++) c = withGuess(c, 'fiveHour', 1000 + i)
    expect(c.fiveHour).toHaveLength(KEEP_GUESSES)
    expect(c.fiveHour[KEEP_GUESSES - 1]).toBe(1000 + KEEP_GUESSES + 5)
    expect(c.sevenDay).toEqual([])
  })
  it('takes the middle as the limit, and estimates a share from it', () => {
    const c = { fiveHour: [90, 100, 5000], sevenDay: [] }
    expect(limitOf(c, 'fiveHour')).toBe(100)
    expect(limitOf(c, 'sevenDay')).toBeNull()
    expect(estimatedPercentage(50, 100)).toBe(50)
    expect(estimatedPercentage(150, 100)).toBe(150)
    expect(estimatedPercentage(50, null)).toBeNull()
    expect(estimatedPercentage(50, 0)).toBeNull()
  })
})
