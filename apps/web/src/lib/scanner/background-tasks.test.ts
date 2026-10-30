import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  BACKGROUND_TASK_MAX_AGE_MS,
  backgroundTaskDir,
  countRunningBackgroundTasks,
  hasExitLine,
  hasRunningBackgroundTask,
  isTranscriptTail,
} from './background-tasks'

const NOW = Date.parse('2026-01-01T12:00:00.000Z')

describe('backgroundTaskDir', () => {
  it('puts the tasks folder under the temp folder, by project and session', () => {
    expect(backgroundTaskDir('D--MCLA', 'abc', 'T')).toBe(path.join('T', 'claude', 'D--MCLA', 'abc', 'tasks'))
  })
})

describe('hasExitLine', () => {
  it('is true when the output ends with an exit line', () => {
    expect(hasExitLine('started\n\n[exited with code 0]')).toBe(true)
    expect(hasExitLine('[exited with code 1]\n')).toBe(true)
  })

  it('is false while the task has printed no exit line', () => {
    expect(hasExitLine('tick 3\n')).toBe(false)
    expect(hasExitLine('')).toBe(false)
  })
})

describe('isTranscriptTail', () => {
  it('is true when the last line is a JSON transcript record', () => {
    expect(isTranscriptTail('{"type":"user"}\n{"type":"assistant","timestamp":"2026-01-01"}\n')).toBe(true)
  })

  it('is false for plain shell output, even when it contains JSON earlier', () => {
    expect(isTranscriptTail('{"a":1}\ntick 3\n')).toBe(false)
    expect(isTranscriptTail('')).toBe(false)
  })
})

describe('countRunningBackgroundTasks', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-running-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function output(name: string, text: string, writtenAt: number = NOW) {
    const file = path.join(dir, name)
    fs.writeFileSync(file, text)
    const when = new Date(writtenAt)
    fs.utimesSync(file, when, when)
  }

  it('counts a quiet task with no exit line as running, however long ago it last wrote', async () => {
    output('sleep.output', 'started\n', NOW - 60 * 60_000)
    expect(await countRunningBackgroundTasks(dir, NOW)).toBe(1)
    expect(await hasRunningBackgroundTask(dir, NOW)).toBe(true)
  })

  it('does not count a task that has exited, even if it wrote a moment ago', async () => {
    output('done.output', 'started\n\n[exited with code 0]', NOW - 1_000)
    expect(await countRunningBackgroundTasks(dir, NOW)).toBe(0)
    expect(await hasRunningBackgroundTask(dir, NOW)).toBe(false)
  })

  it('counts only the running tasks among several', async () => {
    output('running-a.output', 'tick 1\n', NOW)
    output('running-b.output', '', NOW)
    output('finished.output', 'x\n[exited with code 0]', NOW)
    output('notes.txt', 'tick', NOW)
    expect(await countRunningBackgroundTasks(dir, NOW)).toBe(2)
  })

  it('does not count a subagent transcript kept in the tasks folder', async () => {
    output('agent-a1.output', '{"type":"user","timestamp":"2026-01-01"}\n{"type":"assistant","timestamp":"2026-01-01"}\n', NOW)
    expect(await countRunningBackgroundTasks(dir, NOW)).toBe(0)
  })

  it('treats an output older than the maximum age as finished', async () => {
    output('stale.output', 'started\n', NOW - BACKGROUND_TASK_MAX_AGE_MS - 60_000)
    expect(await countRunningBackgroundTasks(dir, NOW)).toBe(0)
  })

  it('is 0 for a folder that does not exist', async () => {
    expect(await countRunningBackgroundTasks(path.join(dir, 'missing'), NOW)).toBe(0)
  })
})
