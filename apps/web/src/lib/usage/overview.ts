import * as fs from 'node:fs'
import * as path from 'node:path'
import { dataDir } from '@/lib/data-dir'
import { readSettingsFile } from '@/lib/settings-file'
import { getMergedPricing } from '@/features/cost-estimation/cost-calculator'
import { scanAllSessionsWithPaths } from '@/lib/scanner/session-scanner'
import { readStatusLineState, type StatusLineState } from '@/lib/claude-hooks/claude-settings-file'
import { EMPTY_CALIBRATION, calibrationFromStored, estimatedPercentage, limitOf, withGuess, type Calibration } from './calibration'
import { burnBySession, currentBlock, impliedLimit, totalsSince, type Block, type Totals } from './estimate'
import { FIVE_HOUR_MS, SEVEN_DAY_MS, liveWindow, paceOf, type LimitWindow, type Pace } from './limits'
import { readRecentEvents } from './recent-events'
import { readUsageSnapshot } from './usage-file'

export interface LimitView extends LimitWindow {
  pace: Pace
}

export interface BurnRow {
  sessionId: string
  title: string
  projectName: string
  tokens: number
  usd: number
  /** Share of the period's tokens, 0 to 1. */
  share: number
  lastAt: number
}

export interface WindowEstimate {
  /** Tokens and cost of the answers in the window, from the transcripts. */
  tokens: number
  usd: number
  /** The share of the limit these make, learned from earlier real reports. Null until there are some. */
  percentage: number | null
  burn: BurnRow[]
}

export interface UsageOverview {
  /** Epoch milliseconds the overview was made. */
  now: number
  /** What Claude Code last reported: exact, while it is fresh. */
  real: {
    fiveHour: LimitView | null
    sevenDay: LimitView | null
    /** ISO time of the report, or null if there has never been one on this computer. */
    updatedAt: string | null
  }
  /** What the transcripts add up to, for when there is no fresh report. */
  estimate: {
    /** The 5-hour block running now. Null when the last one has ended. */
    block: (Block & WindowEstimate) | null
    week: Totals & WindowEstimate
  }
  statusLine: StatusLineState
}

const calibrationPath = () => path.join(dataDir(), 'usage-calibration.json')

function readCalibration(): Calibration {
  try {
    return calibrationFromStored(JSON.parse(fs.readFileSync(calibrationPath(), 'utf-8')))
  } catch {
    return { ...EMPTY_CALIBRATION }
  }
}

function saveCalibration(c: Calibration): void {
  try {
    fs.mkdirSync(dataDir(), { recursive: true })
    fs.writeFileSync(calibrationPath(), JSON.stringify(c), 'utf-8')
  } catch {
    // Calibration is a convenience. Not saving it only means the estimate learns more slowly.
  }
}

/** Everything the Limits views need, for this computer. Server only. */
export async function buildUsageOverview(nowMs: number = Date.now()): Promise<UsageOverview> {
  const snapshot = readUsageSnapshot()
  const fiveHour = liveWindow(snapshot?.fiveHour ?? null, nowMs)
  const sevenDay = liveWindow(snapshot?.sevenDay ?? null, nowMs)

  const events = await readRecentEvents(getMergedPricing(readSettingsFile()), nowMs)
  const block = currentBlock(events, nowMs)
  const weekFrom = sevenDay ? sevenDay.resetsAt * 1000 - SEVEN_DAY_MS : nowMs - SEVEN_DAY_MS
  const week = totalsSince(events, nowMs)
  const weekSinceReset = totalsSince(events, nowMs, nowMs - weekFrom)

  // Learn what the limits are in tokens from the real reports there are.
  let calibration = readCalibration()
  const before = calibration
  if (fiveHour && block) calibration = withGuess(calibration, 'fiveHour', impliedLimit(fiveHour.usedPercentage, block.tokens))
  if (sevenDay) calibration = withGuess(calibration, 'sevenDay', impliedLimit(sevenDay.usedPercentage, weekSinceReset.tokens))
  if (calibration !== before) saveCalibration(calibration)

  // Names for the sessions that used the most. A session that is gone from disk keeps its id.
  const names = new Map<string, { title: string; projectName: string }>()
  try {
    for (const s of await scanAllSessionsWithPaths()) names.set(s.sessionId, { title: s.sessionName ?? 'Untitled session', projectName: s.projectDisplayName })
  } catch {
    // Without names the rows show ids.
  }
  const rows = (from: number): BurnRow[] =>
    burnBySession(events, from, nowMs).map((b) => ({
      sessionId: b.session,
      title: names.get(b.session)?.title ?? b.session.slice(0, 8),
      projectName: names.get(b.session)?.projectName ?? '',
      tokens: b.tokens,
      usd: b.usd,
      share: b.share,
      lastAt: b.lastAt,
    }))

  return {
    now: nowMs,
    real: {
      fiveHour: fiveHour && { ...fiveHour, pace: paceOf(fiveHour, FIVE_HOUR_MS, nowMs) },
      sevenDay: sevenDay && { ...sevenDay, pace: paceOf(sevenDay, SEVEN_DAY_MS, nowMs) },
      updatedAt: snapshot?.updatedAt ?? null,
    },
    estimate: {
      block: block && {
        ...block,
        percentage: estimatedPercentage(block.tokens, limitOf(calibration, 'fiveHour')),
        burn: rows(block.start),
      },
      week: {
        ...week,
        percentage: estimatedPercentage(week.tokens, limitOf(calibration, 'sevenDay')),
        burn: rows(nowMs - SEVEN_DAY_MS),
      },
    },
    statusLine: readStatusLineState(),
  }
}
