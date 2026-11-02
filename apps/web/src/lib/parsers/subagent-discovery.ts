import * as fs from 'node:fs'
import * as path from 'node:path'

/** Pattern matching subagent JSONL filenames like agent-abc123.jsonl */
const AGENT_FILE_PATTERN = /^agent-(.+)\.jsonl$/

/**
 * Discover subagent JSONL files by scanning the session directory.
 *
 * Checks `<sessionDir>/subagents/` first, then falls back to `<sessionDir>/agents/`.
 * Returns a Map of agentId -> absolute file path.
 *
 * If neither directory exists, returns an empty map.
 */
export async function discoverSubagentFiles(
  sessionDir: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()

  const candidateDirs = [
    path.join(sessionDir, 'subagents'),
    path.join(sessionDir, 'agents'),
  ]

  for (const dir of candidateDirs) {
    try {
      const entries = await fs.promises.readdir(dir)
      for (const entry of entries) {
        const match = AGENT_FILE_PATTERN.exec(entry)
        if (match) {
          const agentId = match[1]
          // Only add if not already found (subagents/ takes priority over agents/)
          if (!result.has(agentId)) {
            result.set(agentId, path.join(dir, entry))
          }
        }
      }
    } catch {
      // Directory doesn't exist or isn't readable — skip
    }
  }

  return result
}

/** Bytes read from the end of a transcript to find its last record. */
const TAIL_BYTES = 64 * 1024

/** The `timestamp` of one JSONL line as epoch ms, or undefined when the line has none. */
function lineTime(line: string): number | undefined {
  try {
    const record = JSON.parse(line) as { timestamp?: unknown }
    if (typeof record.timestamp !== 'string') return undefined
    const time = Date.parse(record.timestamp)
    return Number.isNaN(time) ? undefined : time
  } catch {
    return undefined
  }
}

/**
 * Time (epoch ms) of the last record in a JSONL transcript, read from the file's tail.
 * This is the record's own timestamp, not the file's modification time. Something that
 * touches a file (an app opening it, a copy, a backup) changes the modification time but
 * adds no record, so the last record stays old and the file is not treated as active.
 * Undefined when no record in the tail has a timestamp, or the file cannot be read.
 */
export async function readLastRecordTime(filePath: string): Promise<number | undefined> {
  const handle = await fs.promises.open(filePath, 'r').catch(() => null)
  if (!handle) return undefined
  try {
    const { size } = await handle.stat()
    const length = Math.min(size, TAIL_BYTES)
    if (length === 0) return undefined
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    const lines = buffer.toString('utf8').split('\n').reverse()
    for (const line of lines) {
      const time = lineTime(line)
      if (time !== undefined) return time
    }
    return undefined
  } finally {
    await handle.close()
  }
}

/**
 * Last-record time (epoch ms) of each subagent transcript under a session directory.
 * The map uses it to tell a running subagent (recent record) from a finished one.
 * Keyed by agentId, like discoverSubagentFiles. A subagent with no readable record is absent.
 */
export async function readSubagentLastActivity(sessionDir: string): Promise<Map<string, number>> {
  const times = new Map<string, number>()
  const files = await discoverSubagentFiles(sessionDir)
  for (const [agentId, filePath] of files) {
    const time = await readLastRecordTime(filePath)
    if (time !== undefined) times.set(agentId, time)
  }
  return times
}

/**
 * How many subagents of a session are running: transcripts with a record inside `windowMs`. A transcript that has not been
 * touched for longer than the window cannot hold such a record, so only the recently written ones are read.
 */
export async function countRunningSubagents(sessionDir: string, nowMs: number = Date.now(), windowMs: number = 5 * 60_000): Promise<number> {
  const files = await discoverSubagentFiles(sessionDir)
  let running = 0
  for (const filePath of files.values()) {
    const stat = await fs.promises.stat(filePath).catch(() => null)
    if (!stat || nowMs - stat.mtimeMs > windowMs + 60_000) continue
    const time = await readLastRecordTime(filePath)
    if (time !== undefined && nowMs - time <= windowMs) running += 1
  }
  return running
}
