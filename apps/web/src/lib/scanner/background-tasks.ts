import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

/**
 * Background tasks a session started (for example a long shell command with run_in_background).
 * Claude Code writes each task's output to
 * %TEMP%\claude\<project folder>\<session ID>\tasks\<task ID>.output. When a task exits, its
 * output ends with a line like "[exited with code 0]". The transcript records none of this.
 *
 * The same folder also holds subagent entries, which link to their JSON transcripts. A task
 * counts as running only when its output has no exit line, is not a transcript, is not empty, and
 * was written recently. The recency test drops killed and abandoned tasks, which write no exit line.
 */

/** Bytes read from the end of an output file. Long enough to hold one long JSON record. */
const TAIL_BYTES = 64 * 1024

/**
 * A task that has not written for this long is treated as not running. A quiet task drops out of
 * the count until it writes again.
 */
export const BACKGROUND_TASK_QUIET_MS = 10 * 60_000

/** Lines at the end of the output checked for an exit line, so a little trailing text is allowed. */
const EXIT_TAIL_LINES = 3

const EXIT_MARKER = /\bexit(?:ed)?(?: with)? code:?\s*-?\d+/i

/** The last `count` non-empty lines of `text`. */
function lastLines(text: string, count: number): string[] {
  return text.split('\n').filter((line) => line.trim() !== '').slice(-count)
}

/** True when the output's last lines show its task has finished. Pure, for tests. */
export function hasExitLine(tail: string): boolean {
  return lastLines(tail, EXIT_TAIL_LINES).some((line) => EXIT_MARKER.test(line))
}

/**
 * True when the output's last line is a JSON object, which is how a subagent transcript ends.
 * A shell task whose latest line is JSON is not counted; that is rare. Pure, for tests.
 */
export function isTranscriptTail(tail: string): boolean {
  const last = lastLines(tail, 1)[0]
  if (last === undefined) return false
  try {
    const parsed: unknown = JSON.parse(last)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

/**
 * Where Claude Code keeps task output has changed between versions: `<temp>/claude/...` before, and now
 * `<temp>/claude-<user id>/...`. So every folder directly under a temp folder that is named `claude` or `claude-` and a
 * number is looked in. On a Mac or Linux, /tmp is tried as well as the system's temp folder, which on a Mac is not /tmp.
 */
const CLAUDE_FOLDER = /^claude(?:-\d+)?$/

function tempRoots(tempDir?: string): string[] {
  const roots = tempDir !== undefined ? [tempDir] : [os.tmpdir(), ...(process.platform === 'win32' ? [] : ['/tmp', '/private/tmp'])]
  return [...new Set(roots)]
}

/**
 * Every folder a session's task output could be in. Only one exists, on the computer that ran the session, and only
 * while the session has tasks.
 */
export function backgroundTaskDirs(projectDirName: string, sessionId: string, tempDir?: string): string[] {
  const found: string[] = []
  for (const root of tempRoots(tempDir)) {
    let names: string[]
    try {
      names = fs.readdirSync(root)
    } catch {
      continue
    }
    for (const name of names) {
      if (!CLAUDE_FOLDER.test(name)) continue
      const dir = path.join(root, name, projectDirName, sessionId, 'tasks')
      if (!found.includes(dir) && fs.existsSync(dir)) found.push(dir)
    }
  }
  return found
}

/** The folder where Claude Code kept a session's task output in the older layout. Only exists on the machine that ran the session. */
export function backgroundTaskDir(
  projectDirName: string,
  sessionId: string,
  tempDir: string = os.tmpdir(),
): string {
  return path.join(tempDir, 'claude', projectDirName, sessionId, 'tasks')
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
 * How many tasks in `dir` are running: output with no exit line, not a transcript, not empty, and
 * written within BACKGROUND_TASK_QUIET_MS of `nowMs`.
 */
export async function countRunningBackgroundTasks(dirOrDirs: string | string[], nowMs: number = Date.now()): Promise<number> {
  if (Array.isArray(dirOrDirs)) {
    let total = 0
    for (const dir of dirOrDirs) total += await countRunningBackgroundTasks(dir, nowMs)
    return total
  }
  const dir = dirOrDirs
  try {
    const entries = await fs.promises.readdir(dir)
    let count = 0
    for (const entry of entries) {
      if (!entry.endsWith('.output')) continue
      const file = path.join(dir, entry)
      const stat = await fs.promises.stat(file).catch(() => null)
      if (!stat || stat.size === 0 || nowMs - stat.mtimeMs > BACKGROUND_TASK_QUIET_MS) continue
      const tail = await readTail(file, stat.size)
      if (hasExitLine(tail) || isTranscriptTail(tail)) continue
      count++
    }
    return count
  } catch {
    return 0
  }
}

/** True when at least one task in `dir` is still running. */
export async function hasRunningBackgroundTask(dir: string | string[], nowMs: number = Date.now()): Promise<boolean> {
  return (await countRunningBackgroundTasks(dir, nowMs)) > 0
}
