import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

/**
 * Background tasks a session started (for example a long shell command with run_in_background).
 * Claude Code writes each task's output to
 * %TEMP%\claude\<project folder>\<session ID>\tasks\<task ID>.output. When the task exits, the
 * file ends with a line like "[exited with code 0]". A running task has no such line, so it is
 * counted as running even when it is quiet. The transcript records none of this.
 */

/**
 * Bytes read from the end of an output file. Long enough to hold a transcript's last record,
 * which is one JSON line that can be long. The exit line is checked at the very end.
 */
const TAIL_BYTES = 64 * 1024

/**
 * A task with no exit line whose output is older than this is treated as finished. It guards
 * against a task that was killed without writing its exit line.
 */
export const BACKGROUND_TASK_MAX_AGE_MS = 24 * 60 * 60_000

const EXIT_LINE = /\[exited with code -?\d+\]\s*$/

/**
 * The tasks folder also holds subagent entries: each is an `.output` that links to the subagent's
 * JSON transcript. Those never get an exit line, so a transcript is not a background task. The
 * subagents are drawn on the map from their own files.
 */
export function isTranscriptTail(tail: string): boolean {
  const lines = tail.split('\n').filter((line) => line.trim() !== '')
  const last = lines[lines.length - 1]
  if (last === undefined) return false
  try {
    const parsed: unknown = JSON.parse(last)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

/** The folder where Claude Code keeps a session's task output. Only exists on the machine that ran the session. */
export function backgroundTaskDir(
  projectDirName: string,
  sessionId: string,
  tempDir: string = os.tmpdir(),
): string {
  return path.join(tempDir, 'claude', projectDirName, sessionId, 'tasks')
}

/** True when the output ends with an exit line, so its task has finished. Pure, for tests. */
export function hasExitLine(tail: string): boolean {
  return EXIT_LINE.test(tail)
}

async function readTail(file: string, size: number): Promise<string> {
  const handle = await fs.promises.open(file, 'r')
  try {
    const length = Math.min(size, TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    return buffer.toString('utf8')
  } finally {
    await handle.close()
  }
}

/**
 * How many tasks in `dir` are still running: a shell task whose output has no exit line and is not
 * stale. Subagent transcripts in the same folder are not counted.
 */
export async function countRunningBackgroundTasks(dir: string, nowMs: number = Date.now()): Promise<number> {
  try {
    const entries = await fs.promises.readdir(dir)
    let count = 0
    for (const entry of entries) {
      if (!entry.endsWith('.output')) continue
      const file = path.join(dir, entry)
      const stat = await fs.promises.stat(file).catch(() => null)
      if (!stat || nowMs - stat.mtimeMs > BACKGROUND_TASK_MAX_AGE_MS) continue
      const tail = await readTail(file, stat.size)
      if (isTranscriptTail(tail) || hasExitLine(tail)) continue
      count++
    }
    return count
  } catch {
    return 0
  }
}

/** True when at least one task in `dir` is still running. */
export async function hasRunningBackgroundTask(dir: string, nowMs: number = Date.now()): Promise<boolean> {
  return (await countRunningBackgroundTasks(dir, nowMs)) > 0
}
