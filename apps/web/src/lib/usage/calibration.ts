/**
 * What a window's limit is in tokens, learned from real reports. Every time Claude Code says "40% used" while
 * the transcripts add up to 2 million tokens in that window, the limit is about 5 million. The middle of the
 * last few guesses is kept, so a share can be estimated when no report is fresh. Pure; the file is in overview.ts.
 */
import { medianLimit } from './estimate'

export interface Calibration {
  fiveHour: number[]
  sevenDay: number[]
}

export const EMPTY_CALIBRATION: Calibration = { fiveHour: [], sevenDay: [] }

/** How many guesses are kept for each window. */
export const KEEP_GUESSES = 15

export function calibrationFromStored(value: unknown): Calibration {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0).slice(-KEEP_GUESSES) : [])
  if (typeof value !== 'object' || value === null) return { ...EMPTY_CALIBRATION }
  const o = value as Record<string, unknown>
  return { fiveHour: list(o.fiveHour), sevenDay: list(o.sevenDay) }
}

/** The calibration with one more guess, unless it repeats the last one. */
export function withGuess(calibration: Calibration, window: keyof Calibration, guess: number | null): Calibration {
  if (guess === null || guess <= 0) return calibration
  const list = calibration[window]
  if (list[list.length - 1] === guess) return calibration
  return { ...calibration, [window]: [...list, guess].slice(-KEEP_GUESSES) }
}

export function limitOf(calibration: Calibration, window: keyof Calibration): number | null {
  return medianLimit(calibration[window])
}

/** The share of the limit the tokens make, in percent, uncapped. Null with no known limit. */
export function estimatedPercentage(tokens: number, limit: number | null): number | null {
  return limit && limit > 0 ? (tokens / limit) * 100 : null
}
