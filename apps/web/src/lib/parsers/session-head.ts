import * as fs from 'node:fs'
import * as readline from 'node:readline'
import type { ForkedFrom, RawJsonlMessage } from './types'

/**
 * Lines read from the top of a transcript for lookups that need the first records: the
 * working directory, the fork link and the first user prompt. Fork records are copied
 * from the start of the parent, so they are in view here. Nothing beyond these lines is read.
 */
export const HEAD_SCAN_LINES = 50

/** Parsed records from the first `count` lines. Blank and invalid lines are skipped. */
export async function readHeadRecords(
  filePath: string,
  count: number = HEAD_SCAN_LINES,
): Promise<RawJsonlMessage[]> {
  const records: RawJsonlMessage[] = []
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  let read = 0

  try {
    for await (const line of rl) {
      read++
      if (read > count) break
      const record = parseRecord(line)
      if (record) records.push(record)
    }
  } finally {
    rl.close()
    stream.destroy()
  }
  return records
}

/** Working directory from the first record that has a string `cwd`, or null. */
export function findCwd(records: RawJsonlMessage[]): string | null {
  for (const record of records) {
    if (typeof record.cwd === 'string' && record.cwd.trim() !== '') return record.cwd
  }
  return null
}

/**
 * The parent session of a fork, read from `forkedFrom` on the first record that has it.
 * Returns null when no record has a usable session id.
 */
export function findForkedFrom(records: RawJsonlMessage[]): ForkedFrom | null {
  for (const record of records) {
    const ref = record.forkedFrom
    if (!ref || typeof ref !== 'object') continue
    if (typeof ref.sessionId !== 'string' || ref.sessionId === '') continue
    return {
      sessionId: ref.sessionId,
      messageUuid: typeof ref.messageUuid === 'string' ? ref.messageUuid : null,
    }
  }
  return null
}

export function parseRecord(line: string): RawJsonlMessage | null {
  if (!line.trim()) return null
  try {
    const parsed: unknown = JSON.parse(line)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    return parsed as RawJsonlMessage
  } catch {
    return null
  }
}
