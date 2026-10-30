import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

/**
 * Where the dashboard keeps its own data: settings, map layouts, the cache, the hook event log and
 * the history database. Never under ~/.claude. `bin/claude-dashboard-hook.mjs` repeats this rule,
 * and the hook test checks the two agree.
 */
export const DATA_DIR_NAME = '.holdmysession'
/** The folder name before the rename. Its contents are copied to the new one on first use. */
export const LEGACY_DATA_DIR_NAME = '.claude-dashboard'

/** The environment variables that move the folder, in the order they are tried. The last two are the old names. */
const OVERRIDES = ['HOLDMYSESSION_DIR', 'CLAUDE_DASHBOARD_DIR', 'CLAUDE_DASHBOARD_HOME'] as const

let legacyChecked = false

/**
 * Copies the old folder to the new name when the new one does not exist yet. A copy, not a move:
 * if it fails nothing is lost, and another install still reading the old folder keeps working.
 * Returns false if the copy failed, so the caller can keep using the old folder.
 */
function copyLegacyFolder(home: string): boolean {
  const next = path.join(home, DATA_DIR_NAME)
  const legacy = path.join(home, LEGACY_DATA_DIR_NAME)
  if (fs.existsSync(next) || !fs.existsSync(legacy)) return true
  try {
    fs.cpSync(legacy, next, { recursive: true })
    return true
  } catch {
    fs.rmSync(next, { recursive: true, force: true })
    return false
  }
}

export function dataDir(): string {
  for (const name of OVERRIDES) {
    const value = process.env[name]
    if (value) return value
  }
  const home = os.homedir()
  if (!legacyChecked) {
    legacyChecked = true
    if (!copyLegacyFolder(home)) return path.join(home, LEGACY_DATA_DIR_NAME)
  }
  return path.join(home, DATA_DIR_NAME)
}

/** For tests: forget that the old folder has been looked at. */
export function resetLegacyCheck(): void {
  legacyChecked = false
}
