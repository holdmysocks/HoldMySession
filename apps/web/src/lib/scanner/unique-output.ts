/**
 * Output tokens counted once across session files. A forked or resumed session's file can hold its
 * parent's earlier messages, so summing each file's own output total counts the same request more
 * than once. Here the file that started first keeps a request, and later files get only the
 * requests that are new to them. Pure, so it can be tested without files.
 */

export interface OutputEntry {
  /** Identifies the file. Not the session ID, which two folders can share. */
  id: string
  startedAt: string
  /** Output tokens by request ID, from the file's main-conversation assistant records. */
  requestOutputs: ReadonlyMap<string, number>
  /** Output tokens from records that have no request ID, so they cannot be matched across files. */
  untrackedOutputTokens: number
}

/** For each entry's `id`, its output tokens without any request an earlier-started file already holds. */
export function uniqueOutputByFile(entries: ReadonlyArray<OutputEntry>): Map<string, number> {
  const ordered = [...entries].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
  const claimed = new Set<string>()
  const result = new Map<string, number>()
  for (const entry of ordered) {
    let total = entry.untrackedOutputTokens
    for (const [requestId, tokens] of entry.requestOutputs) {
      if (claimed.has(requestId)) continue
      claimed.add(requestId)
      total += tokens
    }
    result.set(entry.id, total)
  }
  return result
}
