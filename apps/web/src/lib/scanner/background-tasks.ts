import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

/**
 * Background tasks a session started (for example a long shell command with run_in_background).
 * Claude Code writes each task's output to
 * %TEMP%\claude\<project folder>\<session ID>\tasks\<task ID>.output, and the file grows while
 * the task runs. The transcript records none of this, so a session running a background task
 * looks idle unless we look here.
 *
 * A task that prints nothing may not touch its file, so it is not seen until it writes again.
 */

/** A task output written this recently means its session is running. Same as the active window. */
export const BACKGROUND_TASK_WINDOW_MS = 2 * 60_000

/** The folder where Claude Code keeps a session's task output. Only exists on the machine that ran the session. */
export function backgroundTaskDir(
  projectDirName: string,
  sessionId: string,
  tempDir: string = os.tmpdir(),
): string {
  return path.join(tempDir, 'claude', projectDirName, sessionId, 'tasks')
}

/** True when any task output in `dir` was written inside the window. A missing folder is false. */
export async function hasRecentBackgroundTask(dir: string, nowMs: number = Date.now()): Promise<boolean> {
  try {
    const entries = await fs.promises.readdir(dir)
    for (const entry of entries) {
      if (!entry.endsWith('.output')) continue
      const stat = await fs.promises.stat(path.join(dir, entry)).catch(() => null)
      if (stat && nowMs - stat.mtimeMs <= BACKGROUND_TASK_WINDOW_MS) return true
    }
    return false
  } catch {
    return false
  }
}
