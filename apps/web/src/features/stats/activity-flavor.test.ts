import { describe, it, expect } from 'vitest'
import { activityFlavor, flavorReserve, flavorTier } from './activity-flavor'

describe('activity flavor text', () => {
  it('gets shorter as the history gets longer', () => {
    const seeds = [0, 0.2, 0.4, 0.6, 0.8, 0.99]
    const len = (weeks: number) => seeds.reduce((sum, seed) => sum + activityFlavor(weeks, seed).length, 0) / seeds.length
    expect(len(2)).toBeGreaterThan(len(8))
    expect(len(8)).toBeGreaterThan(len(20))
    expect(len(20)).toBeGreaterThan(len(35))
    expect(len(35)).toBeGreaterThan(len(50))
  })

  it('picks different lines for different seeds, and always a line', () => {
    expect(activityFlavor(2, 0)).not.toBe(activityFlavor(2, 0.99))
    expect(activityFlavor(2, 1)).toBeTruthy()
    expect(flavorTier(53)).toBe(4)
  })

  it('leaves less room for the text as the grid fills, and none on a narrow card or a full year', () => {
    expect(flavorReserve(2, 1000)).toBeGreaterThan(flavorReserve(30, 1000))
    expect(flavorReserve(52, 1000)).toBe(0)
    expect(flavorReserve(2, 500)).toBe(0)
  })
})
