import * as fs from 'node:fs'
import * as path from 'node:path'
import { getProjectsDir } from '../utils/claude-path'

const ACTIVE_THRESHOLD_MS = 120_000 // 2 minutes

/**
 * True when the session's last record is recent. Together with the file check below, this
 * decides active. A file that is only touched (opened or copied) without a new record stays idle.
 */
export function hasRecentRecord(lastActiveAt: string, nowMs: number = Date.now()): boolean {
  const time = Date.parse(lastActiveAt)
  return !Number.isNaN(time) && nowMs - time <= ACTIVE_THRESHOLD_MS
}

/**
 * Check if a session is active by examining:
 * 1. mtime of the JSONL file (within last 2 minutes)
 * 2. Existence of a lock directory (session ID without .jsonl extension)
 */
export async function isSessionActive(
  projectDirName: string,
  sessionId: string,
  projectsDirOverride?: string,
): Promise<boolean> {
  const projectsDir = projectsDirOverride ?? getProjectsDir()
  const jsonlPath = path.join(projectsDir, projectDirName, `${sessionId}.jsonl`)
  const lockDirPath = path.join(projectsDir, projectDirName, sessionId)

  // Check mtime
  const stat = await fs.promises.stat(jsonlPath).catch(() => null)
  if (!stat) return false

  const age = Date.now() - stat.mtimeMs
  if (age > ACTIVE_THRESHOLD_MS) return false

  // Also check for lock directory existence
  const lockStat = await fs.promises.stat(lockDirPath).catch(() => null)
  return lockStat?.isDirectory() ?? false
}
