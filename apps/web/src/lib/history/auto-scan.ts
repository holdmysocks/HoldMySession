import { readSettingsFile } from '@/lib/settings-file'
import { openHistoryDb } from './history-db'
import { runHistoryScan } from './scan'

/** How often the scheduler looks at the clock. The interval itself is the user's setting. */
const TICK_MS = 30_000

export function isScanDue(args: {
  enabled: boolean
  intervalMinutes: number
  /** When the last scan finished, or null if there has never been one. */
  lastFinishedMs: number | null
  now: number
}): boolean {
  if (!args.enabled) return false
  if (args.lastFinishedMs === null) return true
  return args.now - args.lastFinishedMs >= args.intervalMinutes * 60_000
}

export interface AutoScanDeps {
  settings: () => { enabled: boolean; intervalMinutes: number }
  lastFinishedMs: () => number | null
  scan: () => Promise<unknown>
  now: () => number
}

const defaultDeps: AutoScanDeps = {
  settings: () => readSettingsFile().autoScan,
  lastFinishedMs: () => {
    const db = openHistoryDb()
    try {
      const row = db.prepare('SELECT finished_at FROM scan_log WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1').get()
      return row?.finished_at ? new Date(String(row.finished_at)).getTime() : null
    } finally {
      db.close()
    }
  },
  scan: () => runHistoryScan(),
  now: () => Date.now(),
}

/** One look at the clock: scans if it is due. The setting is read every time, so changes apply without a restart. */
export async function autoScanTick(deps: AutoScanDeps = defaultDeps): Promise<'scanned' | 'skipped'> {
  const { enabled, intervalMinutes } = deps.settings()
  if (!isScanDue({ enabled, intervalMinutes, lastFinishedMs: enabled ? deps.lastFinishedMs() : null, now: deps.now() })) {
    return 'skipped'
  }
  await deps.scan()
  return 'scanned'
}

let started = false

/**
 * Starts the scheduler in this server process. Safe to call any number of times. It runs a first
 * check at once, so a scan that is overdue happens at start, then checks every 30 seconds. A failed
 * scan is logged in the scan log, not thrown, and tried again after the interval.
 */
export function startAutoScan(): void {
  if (started) return
  started = true
  const tick = () => void autoScanTick().catch((error) => console.warn('Automatic scan failed:', error))
  const timer = setInterval(tick, TICK_MS)
  timer.unref?.()
  tick()
}
