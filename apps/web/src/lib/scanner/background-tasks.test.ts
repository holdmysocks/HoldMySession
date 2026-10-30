import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { backgroundTaskDir, hasRecentBackgroundTask } from './background-tasks'

describe('backgroundTaskDir', () => {
  it('puts the tasks folder under the temp folder, by project and session', () => {
    expect(backgroundTaskDir('D--MCLA', 'abc', 'T')).toBe(path.join('T', 'claude', 'D--MCLA', 'abc', 'tasks'))
  })
})

describe('hasRecentBackgroundTask', () => {
  const NOW = Date.parse('2026-01-01T12:00:00.000Z')
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-tasks-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function output(name: string, writtenAt: number) {
    const file = path.join(dir, name)
    fs.writeFileSync(file, 'x')
    const when = new Date(writtenAt)
    fs.utimesSync(file, when, when)
  }

  it('is true when a task output was written inside the window', async () => {
    output('bmm79.output', NOW - 60_000)
    expect(await hasRecentBackgroundTask(dir, NOW)).toBe(true)
  })

  it('is false when every task output is older than the window', async () => {
    output('old.output', NOW - 10 * 60_000)
    expect(await hasRecentBackgroundTask(dir, NOW)).toBe(false)
  })

  it('ignores files that are not task outputs', async () => {
    output('notes.txt', NOW - 1_000)
    expect(await hasRecentBackgroundTask(dir, NOW)).toBe(false)
  })

  it('is false for a folder that does not exist', async () => {
    expect(await hasRecentBackgroundTask(path.join(dir, 'missing'), NOW)).toBe(false)
  })
})
