import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { readSubagentWriteTimes } from './subagent-discovery'

describe('readSubagentWriteTimes', () => {
  let sessionDir: string

  beforeEach(() => {
    sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'subagent-times-'))
  })

  afterEach(() => {
    fs.rmSync(sessionDir, { recursive: true, force: true })
  })

  it('returns the last-write time of each agent file, keyed by agent id', async () => {
    const dir = path.join(sessionDir, 'subagents')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'agent-abc.jsonl'), '{}\n')
    const old = new Date('2020-01-01T00:00:00Z')
    fs.writeFileSync(path.join(dir, 'agent-def.jsonl'), '{}\n')
    fs.utimesSync(path.join(dir, 'agent-def.jsonl'), old, old)

    const times = await readSubagentWriteTimes(sessionDir)
    expect(times.get('abc')).toBeGreaterThan(Date.now() - 60_000)
    expect(times.get('def')).toBe(old.getTime())
  })

  it('returns an empty map when there is no subagents folder', async () => {
    expect((await readSubagentWriteTimes(sessionDir)).size).toBe(0)
  })

  it('ignores files that are not agent transcripts', async () => {
    const dir = path.join(sessionDir, 'subagents')
    fs.mkdirSync(dir)
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'x')
    expect((await readSubagentWriteTimes(sessionDir)).size).toBe(0)
  })
})
