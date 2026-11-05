import * as fs from 'node:fs'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { dataDir } from '@/lib/data-dir'
import { parseDetail, type RequestUsageSink } from '@/lib/parsers/session-parser'
import { discoverSubagentFiles } from '@/lib/parsers/subagent-discovery'
import type { SessionDetail, TokenUsage, Turn } from '@/lib/parsers/types'
import type { SessionSummaryWithPath } from '@/lib/scanner/session-scanner'
import type { IngestEntry } from './ingest'

/**
 * A scan used to read every transcript in full each time and keep every parsed session in memory until the end, so its cost
 * grew with the whole history: on a master with gigabytes of transcripts, gigabytes read from disk and gigabytes of memory, at
 * every scan, however little had changed.
 *
 * Here each session is reduced once to a digest: the small part of its parse the history is built from. The digest is kept in
 * a file, labelled with what the session's files looked like, and a session whose files have not changed is not read again.
 * Requests that sit in more than one session (a forked session holds its parent's) are counted once, as before, in the
 * order the sessions started, and sessions are handed on one at a time, so memory no longer grows with the history.
 */

/** Raise to make every digest be made again, such as when what a digest holds changes. */
const DIGEST_VERSION = 1

const TYPES: Turn['type'][] = ['user', 'assistant', 'system', 'progress']

/** Input, output, cache read, cache write and thinking tokens, in that order. */
type UsageTuple = [number, number, number, number, number]

export interface SessionDigest {
  /** What the session's files looked like, so that a changed session is read again. */
  key: string
  /** Each turn: its type's index in TYPES, its model, its time, and how many tool calls it made. */
  turns: Array<[number, string, string, number]>
  toolTotal: number
  byModel: Record<string, UsageTuple>
  /** Every request whose tokens the session counted: its id, model and tokens. In the order they were found. */
  requests: Array<[string, string, ...UsageTuple]>
}

export interface DigestCounts {
  /** Sessions read from their transcripts, because they were new or had changed. */
  parsed: number
  /** Sessions that were not read, because their digest was still good. */
  reused: number
  /** Sessions that could not be read in full. */
  failed: number
}

const tupleOf = (u: TokenUsage): UsageTuple => [u.inputTokens, u.outputTokens, u.cacheReadInputTokens, u.cacheCreationInputTokens, u.thinkingTokens ?? 0]

const usageOf = (t: UsageTuple): TokenUsage => ({
  inputTokens: t[0], outputTokens: t[1], cacheReadInputTokens: t[2], cacheCreationInputTokens: t[3], thinkingTokens: t[4],
})

const subtractClamped = (target: UsageTuple, source: UsageTuple): void => {
  for (let i = 0; i < 5; i++) target[i] = Math.max(0, target[i] - source[i])
}

export function digestDir(): string {
  return path.join(dataDir(), 'digests')
}

export function digestFile(transcriptPath: string): string {
  return path.join(digestDir(), `${createHash('sha1').update(transcriptPath).digest('hex').slice(0, 32)}.json`)
}

/** What a session's files look like: the transcript and the subagent transcripts its totals include, by size and time. */
export async function sessionSignature(transcriptPath: string, version: string): Promise<string | null> {
  let main: fs.Stats
  try {
    main = await fs.promises.stat(transcriptPath)
  } catch {
    return null
  }
  const parts: Array<string | number> = [DIGEST_VERSION, version, main.size, main.mtimeMs]
  const subagents = await discoverSubagentFiles(transcriptPath.replace(/\.jsonl$/, ''))
  for (const [id, file] of [...subagents].sort((a, b) => a[0].localeCompare(b[0]))) {
    try {
      const s = await fs.promises.stat(file)
      parts.push(id, s.size, s.mtimeMs)
    } catch {
      // Gone since it was listed.
    }
  }
  return createHash('sha1').update(parts.join('|')).digest('hex')
}

/** Reduces a full parse to what the history needs. */
export function buildDigest(key: string, detail: SessionDetail, sink: RequestUsageSink): SessionDigest {
  const byModel: Record<string, UsageTuple> = {}
  for (const [model, usage] of Object.entries(detail.tokensByModel)) byModel[model] = tupleOf(usage)
  return {
    key,
    turns: detail.turns.map((t) => [Math.max(0, TYPES.indexOf(t.type)), t.model ?? '', t.timestamp, t.toolCalls.length]),
    toolTotal: Object.values(detail.toolFrequency).reduce((a, b) => a + b, 0),
    byModel,
    requests: [...sink].map(([id, { model, usage }]) => [id, model, ...tupleOf(usage)] as SessionDigest['requests'][number]),
  }
}

function readDigest(file: string): SessionDigest | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as SessionDigest
    return parsed && typeof parsed.key === 'string' && Array.isArray(parsed.turns) && Array.isArray(parsed.requests) ? parsed : null
  } catch {
    return null
  }
}

function writeDigest(file: string, digest: SessionDigest): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(digest), 'utf-8')
  fs.renameSync(tmp, file)
}

/** A session's digest: the one kept, if its files have not changed, and otherwise one made by reading the transcript now. */
async function digestOf(summary: SessionSummaryWithPath, version: string, counts: DigestCounts): Promise<SessionDigest | null> {
  const key = await sessionSignature(summary.filePath, version)
  if (key === null) {
    counts.failed += 1
    return null
  }
  const file = digestFile(summary.filePath)
  const kept = readDigest(file)
  if (kept && kept.key === key) {
    counts.reused += 1
    return kept
  }
  try {
    const sink: RequestUsageSink = new Map()
    const detail = await parseDetail(summary.filePath, summary.sessionId, summary.projectPath, summary.projectName, sink)
    const digest = buildDigest(key, detail, sink)
    writeDigest(file, digest)
    counts.parsed += 1
    return digest
  } catch {
    counts.failed += 1
    return null
  }
}

/** The part of a parse that the history reads, in the shape it reads it. */
export function digestToDetail(summary: SessionSummaryWithPath, digest: SessionDigest, byModel: Record<string, UsageTuple> = digest.byModel): SessionDetail {
  const tokensByModel: Record<string, TokenUsage> = {}
  for (const [model, tuple] of Object.entries(byModel)) tokensByModel[model] = usageOf(tuple)
  const total: UsageTuple = [0, 0, 0, 0, 0]
  for (const tuple of Object.values(byModel)) for (let i = 0; i < 5; i++) total[i] += tuple[i]
  return {
    sessionId: summary.sessionId,
    projectPath: summary.projectPath,
    projectName: summary.projectName,
    branch: null,
    sessionName: null,
    // Only the type, model, time and number of tool calls of a turn are read, so that is all that is rebuilt.
    turns: digest.turns.map(([type, model, timestamp, toolCalls]) => ({
      uuid: '', type: TYPES[type] ?? 'user', timestamp, ...(model ? { model } : {}), toolCalls: new Array(toolCalls),
    })) as Turn[],
    totalTokens: usageOf(total),
    tokensByModel,
    toolFrequency: { all: digest.toolTotal },
    errors: [], models: [], agents: [], skills: [], tasks: [], contextWindow: null,
  }
}

const BATCH = 10

/**
 * The sessions of a scan, ready to be written to the history, one at a time. Sessions are first looked at in the order they
 * started, so that a request in more than one of them stays with the first, as it always has; then they are handed on in the
 * order given. Reading happens only for sessions whose files changed.
 */
export async function digestEntries(
  summaries: SessionSummaryWithPath[],
  version: string,
): Promise<{ entries: Iterable<IngestEntry>; counts: DigestCounts }> {
  const counts: DigestCounts = { parsed: 0, reused: 0, failed: 0 }
  const ordered = [...summaries].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.filePath.localeCompare(b.filePath))
  const claimed = new Set<string>()
  const adjusted = new Map<string, Record<string, UsageTuple>>()
  /** The sessions whose digest is good, as opposed to a leftover from an older version or no digest at all. */
  const good = new Set<string>()

  for (let i = 0; i < ordered.length; i += BATCH) {
    const chunk = ordered.slice(i, i + BATCH)
    const digests = await Promise.all(chunk.map((s) => digestOf(s, version, counts)))
    chunk.forEach((summary, n) => {
      const digest = digests[n]
      if (!digest) return
      good.add(summary.filePath)
      let copy: Record<string, UsageTuple> | null = null
      for (const [id, model, ...tuple] of digest.requests) {
        if (!claimed.has(id)) {
          claimed.add(id)
          continue
        }
        // Already counted in a session that started earlier: take it out of this one.
        copy ??= JSON.parse(JSON.stringify(digest.byModel)) as Record<string, UsageTuple>
        if (copy[model]) subtractClamped(copy[model], tuple as UsageTuple)
      }
      if (copy) adjusted.set(summary.filePath, copy)
    })
  }

  function* entries(): Generator<IngestEntry> {
    for (const summary of summaries) {
      const digest = good.has(summary.filePath) ? readDigest(digestFile(summary.filePath)) : null
      if (!digest) counts.failed += good.has(summary.filePath) ? 1 : 0
      yield { summary, detail: digest ? digestToDetail(summary, digest, adjusted.get(summary.filePath)) : null }
    }
  }
  return { entries: entries(), counts }
}

/** Removes the digests of sessions that are no longer on disk. Only called after a scan that found sessions. */
export function pruneDigests(summaries: SessionSummaryWithPath[]): number {
  const keep = new Set(summaries.map((s) => path.basename(digestFile(s.filePath))))
  let removed = 0
  let names: string[]
  try {
    names = fs.readdirSync(digestDir())
  } catch {
    return 0
  }
  for (const name of names) {
    if (!name.endsWith('.json') || keep.has(name)) continue
    try {
      fs.unlinkSync(path.join(digestDir(), name))
      removed += 1
    } catch {
      // Already gone.
    }
  }
  return removed
}
