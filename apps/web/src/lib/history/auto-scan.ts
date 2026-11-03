import * as fs from 'node:fs'
import * as path from 'node:path'
import { readSettingsFile } from '@/lib/settings-file'
import { getProjectsDir } from '@/lib/utils/claude-path'
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
  /** Whether any transcript was written since this time. A scan reads them all, so it is not worth doing when none were. */
  changedSince: (sinceMs: number) => boolean
}

/**
 * Whether a session transcript under the Claude folder was written after `sinceMs`. Looks at file times only, which is far
 * cheaper than the scan it saves. Errs toward yes when the folder cannot be read.
 */
export function transcriptsChangedSince(sinceMs: number, projectsDir: string = getProjectsDir()): boolean {
  let projects: string[]
  try {
    projects = fs.readdirSync(projectsDir)
  } catch {
    return true
  }
  for (const project of projects) {
    let names: string[]
    try {
      names = fs.readdirSync(path.join(projectsDir, project))
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue
      try {
        if (fs.statSync(path.join(projectsDir, project, name)).mtimeMs > sinceMs) return true
      } catch {
        // Gone since it was listed.
      }
    }
  }
  return false
}

/** When a due scan last found nothing changed, so it is not looked into again until the interval has passed. */
let lastUnchangedCheckMs: number | null = null

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
  changedSince: (sinceMs) => transcriptsChangedSince(sinceMs),
}

/** One look at the clock: scans if it is due. The setting is read every time, so changes apply without a restart. */
export async function autoScanTick(deps: AutoScanDeps = defaultDeps): Promise<'scanned' | 'skipped'> {
  const { enabled, intervalMinutes } = deps.settings()
  const now = deps.now()
  const lastFinishedMs = enabled ? deps.lastFinishedMs() : null
  if (!isScanDue({ enabled, intervalMinutes, lastFinishedMs, now })) return 'skipped'
  // Nothing written since the last scan means nothing new to find. Looking again waits for the interval.
  if (lastFinishedMs !== null) {
    if (lastUnchangedCheckMs !== null && now - lastUnchangedCheckMs < intervalMinutes * 60_000) return 'skipped'
    if (!deps.changedSince(lastFinishedMs)) {
      lastUnchangedCheckMs = now
      return 'skipped'
    }
  }
  lastUnchangedCheckMs = null
  await deps.scan()
  return 'scanned'
}

/** For tests: forget the last check. */
export function resetAutoScanState(): void {
  lastUnchangedCheckMs = null
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
  const tick = () => {
    void autoScanTick().catch((error) => console.warn('Automatic scan failed:', error))
    // A master asks connected nodes for fresh stats while someone is looking.
    void import('@/lib/link/master-sync').then((m) => m.masterSyncTick()).catch(() => undefined)
  }
  // On Windows, a machine that listens on the network asks for the firewall permission it needs, once.
  void import('@/lib/link/firewall').then((m) =>
    m.ensureFirewallOnStart(Number(process.env.HOLDMYSESSION_PORT_IN_USE) || 3000, ['0.0.0.0', '::'].includes(process.env.HOLDMYSESSION_LISTEN_HOST ?? '')),
  ).catch(() => undefined)
  // A node keeps a request open to its master, so the master can ask it for live data.
  void import('@/lib/link/node-agent').then((m) => m.startNodeAgent()).catch(() => undefined)
  const timer = setInterval(tick, TICK_MS)
  timer.unref?.()
  tick()
}
