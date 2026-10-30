import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { readLastRecordTime, readSubagentLastActivity } from './subagent-discovery'

const RECENT = new Date(Date.now() - 30_000).toISOString()
const OLD = '2020-01-01T00:00:00.000Z'

function record(timestamp: string): string {
  return JSON.stringify({ type: 'assistant', timestamp }) + '\n'
}

describe('readLastRecordTime and readSubagentLastActivity', () => {
  let sessionDir: string

  beforeEach(() => {
    sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subagent-activity-'))
  })

  afterEach(() => {
    fs.rmSync(sessionDir, { recursive: true, force: true })
  })

  it('uses the timestamp of the last record, not the file modification time', async () => {
    const file = path.join(sessionDir, 'agent-touched.jsonl')
    fs.writeFileSync(file, record(OLD) + record(OLD))
    // Something touched the file just now, but it has no new record.
    const now = new Date()
    fs.utimesSync(file, now, now)

    expect(await readLastRecordTime(file)).toBe(Date.parse(OLD))
  })

  it('reads the last record in a transcript larger than the tail it reads', async () => {
    const file = path.join(sessionDir, 'agent-big.jsonl')
    const filler = JSON.stringify({ type: 'user', timestamp: OLD, text: 'x'.repeat(2000) }) + '\n'
    fs.writeFileSync(file, filler.repeat(100) + record(RECENT))

    expect(await readLastRecordTime(file)).toBe(Date.parse(RECENT))
  })

  it('skips a partly written last line and uses the record before it', async () => {
    const file = path.join(sessionDir, 'agent-partial.jsonl')
    fs.writeFileSync(file, record(OLD) + '{"type":"assis')

    expect(await readLastRecordTime(file)).toBe(Date.parse(OLD))
  })

  it('is undefined for a file with no timestamped record, or no file', async () => {
    const file = path.join(sessionDir, 'agent-empty.jsonl')
    fs.writeFileSync(file, '{}\n')
    expect(await readLastRecordTime(file)).toBeUndefined()
    expect(await readLastRecordTime(path.join(sessionDir, 'missing.jsonl'))).toBeUndefined()
  })

  it('returns the last-record time of each agent, keyed by agent id', async () => {
    const dir = path.join(sessionDir, 'subagents')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'agent-abc.jsonl'), record(RECENT))
    fs.writeFileSync(path.join(dir, 'agent-def.jsonl'), record(OLD))

    const times = await readSubagentLastActivity(sessionDir)
    expect(times.get('abc')).toBe(Date.parse(RECENT))
    expect(times.get('def')).toBe(Date.parse(OLD))
  })

  it('returns an empty map when there is no subagents folder', async () => {
    expect((await readSubagentLastActivity(sessionDir)).size).toBe(0)
  })

  it('ignores files that are not agent transcripts', async () => {
    const dir = path.join(sessionDir, 'subagents')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'notes.txt'), record(RECENT))
    expect((await readSubagentLastActivity(sessionDir)).size).toBe(0)
  })
})
