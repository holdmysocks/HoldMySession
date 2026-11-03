import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  BACKGROUND_TASK_QUIET_MS,
  backgroundTaskDir,
  backgroundTaskDirs,
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
    expect(hasExitLine('started\r\n[exited with code 0]\r\n')).toBe(true)
  })

  it('is true for a bare "exit code" line and for a little trailing text', () => {
    expect(hasExitLine('work\nexit code 0\n')).toBe(true)
    expect(hasExitLine('[exited with code 0]\n\n')).toBe(true)
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

  it('counts a task that wrote recently and has no exit line', async () => {
    output('sleep.output', 'tick 1\n', NOW - 30_000)
    expect(await countRunningBackgroundTasks(dir, NOW)).toBe(1)
    expect(await hasRunningBackgroundTask(dir, NOW)).toBe(true)
  })

  it('does not count a task with no exit line that has been silent past the quiet window', async () => {
    output('killed.output', 'started\n', NOW - BACKGROUND_TASK_QUIET_MS - 60_000)
    expect(await countRunningBackgroundTasks(dir, NOW)).toBe(0)
    expect(await hasRunningBackgroundTask(dir, NOW)).toBe(false)
  })

  it('does not count a task that has exited, even if it wrote a moment ago', async () => {
    output('done.output', 'started\n\n[exited with code 0]', NOW - 1_000)
    expect(await countRunningBackgroundTasks(dir, NOW)).toBe(0)
  })

  it('does not count an output that is empty', async () => {
    output('empty.output', '', NOW)
    expect(await countRunningBackgroundTasks(dir, NOW)).toBe(0)
  })

  it('counts only the running tasks among several', async () => {
    output('running-a.output', 'tick 1\n', NOW)
    output('running-b.output', 'tick 2\n', NOW - 1_000)
    output('finished.output', 'x\n[exited with code 0]', NOW)
    output('empty.output', '', NOW)
    output('killed.output', 'started\n', NOW - BACKGROUND_TASK_QUIET_MS - 1)
    output('notes.txt', 'tick', NOW)
    expect(await countRunningBackgroundTasks(dir, NOW)).toBe(2)
  })

  it('does not count a subagent transcript kept in the tasks folder', async () => {
    output('agent-a1.output', '{"type":"user","timestamp":"2026-01-01"}\n{"type":"assistant","timestamp":"2026-01-01"}\n', NOW)
    expect(await countRunningBackgroundTasks(dir, NOW)).toBe(0)
  })

  it('is 0 for a folder that does not exist', async () => {
    expect(await countRunningBackgroundTasks(path.join(dir, 'missing'), NOW)).toBe(0)
  })
})

describe('backgroundTaskDirs', () => {
  let temp: string

  beforeEach(() => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-dirs-'))
  })
  afterEach(() => {
    fs.rmSync(temp, { recursive: true, force: true })
  })

  const make = (...parts: string[]) => fs.mkdirSync(path.join(temp, ...parts), { recursive: true })

  it('finds the current layout, with the user id in the folder name', () => {
    make('claude-501', '-Users-me-app', 'abc', 'tasks')
    expect(backgroundTaskDirs('-Users-me-app', 'abc', temp)).toEqual([path.join(temp, 'claude-501', '-Users-me-app', 'abc', 'tasks')])
  })

  it('finds the older layout, with no user id', () => {
    make('claude', 'D--MCLA', 'abc', 'tasks')
    expect(backgroundTaskDirs('D--MCLA', 'abc', temp)).toEqual([path.join(temp, 'claude', 'D--MCLA', 'abc', 'tasks')])
  })

  it('finds both when both are there, and only this session', () => {
    make('claude', 'p', 'abc', 'tasks')
    make('claude-0', 'p', 'abc', 'tasks')
    make('claude-0', 'p', 'other', 'tasks')
    expect(backgroundTaskDirs('p', 'abc', temp).sort()).toEqual([path.join(temp, 'claude', 'p', 'abc', 'tasks'), path.join(temp, 'claude-0', 'p', 'abc', 'tasks')].sort())
  })

  it('ignores folders that only look similar', () => {
    make('claude-0Jtbmh', 'p', 'abc', 'tasks')
    make('claudette', 'p', 'abc', 'tasks')
    make('not-claude', 'p', 'abc', 'tasks')
    expect(backgroundTaskDirs('p', 'abc', temp)).toEqual([])
  })

  it('is empty when there is no temp folder or no tasks', () => {
    expect(backgroundTaskDirs('p', 'abc', path.join(temp, 'missing'))).toEqual([])
    make('claude-0', 'p', 'abc')
    expect(backgroundTaskDirs('p', 'abc', temp)).toEqual([])
  })

  it('counts the running tasks in every folder it finds', async () => {
    make('claude', 'p', 'abc', 'tasks')
    make('claude-7', 'p', 'abc', 'tasks')
    for (const [folder, name] of [['claude', 'a.output'], ['claude-7', 'b.output'], ['claude-7', 'c.output']]) {
      const file = path.join(temp, folder, 'p', 'abc', 'tasks', name)
      fs.writeFileSync(file, 'working\n')
      fs.utimesSync(file, new Date(NOW - 1000), new Date(NOW - 1000))
    }
    expect(await countRunningBackgroundTasks(backgroundTaskDirs('p', 'abc', temp), NOW)).toBe(3)
    expect(await hasRunningBackgroundTask(backgroundTaskDirs('p', 'abc', temp), NOW)).toBe(true)
    expect(await countRunningBackgroundTasks([], NOW)).toBe(0)
  })
})
