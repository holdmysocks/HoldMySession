import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'
import { getProjectsDir } from '@/lib/utils/claude-path'
import type { ModelPricing } from '@/features/settings/settings.types'
import { normalizeModelId } from '@/features/settings/settings.types'
import { SEVEN_DAY_MS } from './limits'
import type { UsageEvent } from './estimate'

const FALLBACK_MODEL_ID = 'claude-sonnet-4'

/** What one answer used, before it is priced. */
interface RawEvent {
  time: number
  session: string
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** The last read of each transcript, so a file that has not changed is not read again. */
const cache = new Map<string, { mtimeMs: number; size: number; events: RawEvent[] }>()

/** The usage in one transcript line, or null if it is not an answer with usage. Exported for tests. */
export function rawEventFromLine(line: string, session: string): (RawEvent & { key: string | null }) | null {
  if (!line.includes('"usage"')) return null
  let record: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any -- transcript lines have arbitrary shape
  try {
    record = JSON.parse(line)
  } catch {
    return null
  }
  const message = record?.message
  const usage = message?.usage
  if (record?.type !== 'assistant' || !usage || typeof record.timestamp !== 'string') return null
  const time = Date.parse(record.timestamp)
  if (Number.isNaN(time)) return null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const request = typeof record.requestId === 'string' ? record.requestId : ''
  const id = typeof message.id === 'string' ? message.id : ''
  return {
    key: request || id ? `${request}|${id}` : null,
    time,
    session,
    model: typeof message.model === 'string' ? message.model : '',
    input: num(usage.input_tokens),
    output: num(usage.output_tokens),
    cacheRead: num(usage.cache_read_input_tokens),
    cacheWrite: num(usage.cache_creation_input_tokens),
  }
}

async function readFileEvents(file: string, session: string): Promise<RawEvent[]> {
  const events: RawEvent[] = []
  const seen = new Set<string>()
  const lines = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf-8' }), crlfDelay: Infinity })
  for await (const line of lines) {
    const e = rawEventFromLine(line, session)
    if (!e) continue
    // The same answer can be written to a transcript more than once while it streams. Count it once.
    if (e.key) {
      if (seen.has(e.key)) continue
      seen.add(e.key)
    }
    events.push({ time: e.time, session: e.session, model: e.model, input: e.input, output: e.output, cacheRead: e.cacheRead, cacheWrite: e.cacheWrite })
  }
  return events
}

function transcriptFiles(projectsDir: string, sinceMs: number): Array<{ file: string; session: string; mtimeMs: number; size: number }> {
  const found: Array<{ file: string; session: string; mtimeMs: number; size: number }> = []
  let projects: string[]
  try {
    projects = fs.readdirSync(projectsDir)
  } catch {
    return found
  }
  for (const project of projects) {
    const dir = path.join(projectsDir, project)
    let names: string[]
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue
      const file = path.join(dir, name)
      try {
        const stat = fs.statSync(file)
        if (stat.mtimeMs >= sinceMs) found.push({ file, session: name.slice(0, -'.jsonl'.length), mtimeMs: stat.mtimeMs, size: stat.size })
      } catch {
        // Gone since it was listed.
      }
    }
  }
  return found
}

/** Prices one answer at the table's price for its model. */
function priced(e: RawEvent, table: Record<string, ModelPricing>): UsageEvent {
  const pricing = table[normalizeModelId(e.model)] ?? table[FALLBACK_MODEL_ID]
  const usd = pricing
    ? (e.input / 1e6) * pricing.inputPerMTok +
      (e.output / 1e6) * pricing.outputPerMTok +
      (e.cacheRead / 1e6) * pricing.cacheReadPerMTok +
      (e.cacheWrite / 1e6) * pricing.cacheWritePerMTok
    : 0
  return { time: e.time, session: e.session, tokens: e.input + e.output + e.cacheWrite, usd }
}

/**
 * Every answer in the last seven days from this computer's transcripts, priced. Subagent transcripts live
 * in a folder below a session's, so they are not listed here; the session that started them is a close enough
 * stand-in for who used the window.
 */
export async function readRecentEvents(
  table: Record<string, ModelPricing>,
  nowMs: number = Date.now(),
  projectsDir: string = getProjectsDir(),
): Promise<UsageEvent[]> {
  const since = nowMs - SEVEN_DAY_MS
  const files = transcriptFiles(projectsDir, since)
  const live = new Set(files.map((f) => f.file))
  for (const key of cache.keys()) if (!live.has(key)) cache.delete(key)
  const out: UsageEvent[] = []
  for (const f of files) {
    let entry = cache.get(f.file)
    if (!entry || entry.mtimeMs !== f.mtimeMs || entry.size !== f.size) {
      try {
        entry = { mtimeMs: f.mtimeMs, size: f.size, events: await readFileEvents(f.file, f.session) }
      } catch {
        continue
      }
      cache.set(f.file, entry)
    }
    for (const e of entry.events) if (e.time >= since && e.time <= nowMs) out.push(priced(e, table))
  }
  return out
}
