import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  desktopFlagsFor,
  desktopSessionsDir,
  parseDesktopRecord,
  readDesktopSessionFlags,
} from './desktop-records'

describe('parseDesktopRecord', () => {
  it('reads archived and split flags from a record', () => {
    expect(
      parseDesktopRecord({ cliSessionId: 'abc', isArchived: true, lineageDetached: true, sessionId: 'local_1' }),
    ).toEqual({ cliSessionId: 'abc', isArchived: true, lineageDetached: true })
  })

  it('treats missing or odd flags as not set', () => {
    expect(parseDesktopRecord({ cliSessionId: 'abc' })).toEqual({
      cliSessionId: 'abc',
      isArchived: false,
      lineageDetached: false,
    })
    expect(parseDesktopRecord({ cliSessionId: 'abc', isArchived: 'yes', lineageDetached: null })).toEqual({
      cliSessionId: 'abc',
      isArchived: false,
      lineageDetached: false,
    })
  })

  it('accepts a split marker that is a timestamp, not only true', () => {
    expect(parseDesktopRecord({ cliSessionId: 'abc', lineageDetached: 1793280587490 })?.lineageDetached).toBe(true)
  })

  it('returns null without a transcript session ID, or for a non-object', () => {
    expect(parseDesktopRecord({ sessionId: 'local_1' })).toBeNull()
    expect(parseDesktopRecord({ cliSessionId: '' })).toBeNull()
    expect(parseDesktopRecord(null)).toBeNull()
    expect(parseDesktopRecord([])).toBeNull()
    expect(parseDesktopRecord('abc')).toBeNull()
  })
})

describe('desktopSessionsDir', () => {
  it('uses the override first, then %APPDATA%\\Claude\\claude-code-sessions', () => {
    expect(desktopSessionsDir({ CLAUDE_DESKTOP_SESSIONS_DIR: '/tmp/x', APPDATA: '/a' })).toBe(path.resolve('/tmp/x'))
    expect(desktopSessionsDir({ APPDATA: path.join('a', 'b') })).toBe(
      path.join('a', 'b', 'Claude', 'claude-code-sessions'),
    )
  })

  it('is null when neither is set (no desktop app data on this machine)', () => {
    expect(desktopSessionsDir({})).toBeNull()
  })
})

describe('readDesktopSessionFlags', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-records-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function writeRecord(relative: string, body: unknown) {
    const full = path.join(dir, relative)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body))
  }

  it('reads every local_*.json at any depth, keyed by transcript session ID', async () => {
    writeRecord('account/org/local_1.json', { sessionId: 'local_1', cliSessionId: 'cli-1', isArchived: true })
    writeRecord('account/org/nested/local_2.json', { cliSessionId: 'cli-2', lineageDetached: true })

    const flags = await readDesktopSessionFlags(dir)
    expect(flags.get('cli-1')).toEqual({ cliSessionId: 'cli-1', isArchived: true, lineageDetached: false })
    expect(flags.get('cli-2')).toEqual({ cliSessionId: 'cli-2', isArchived: false, lineageDetached: true })
  })

  it('ignores files that are not session records, and files that do not parse', () => {
    writeRecord('account/archived-sessions.idx', { v: 1, archived: ['local_1'] })
    writeRecord('account/local_bad.json', '{ not json')
    writeRecord('account/local_empty.json', { sessionId: 'local_9' })
    return readDesktopSessionFlags(dir).then((flags) => expect(flags.size).toBe(0))
  })

  it('is empty for a folder that does not exist', async () => {
    const flags = await readDesktopSessionFlags(path.join(dir, 'missing'))
    expect(flags.size).toBe(0)
  })

  it('reflects a changed record on the next read', async () => {
    writeRecord('account/local_1.json', { cliSessionId: 'cli-1', isArchived: false })
    expect((await readDesktopSessionFlags(dir)).get('cli-1')!.isArchived).toBe(false)

    const file = path.join(dir, 'account', 'local_1.json')
    fs.writeFileSync(file, JSON.stringify({ cliSessionId: 'cli-1', isArchived: true }))
    const later = new Date(Date.now() + 5000)
    fs.utimesSync(file, later, later)
    expect((await readDesktopSessionFlags(dir)).get('cli-1')!.isArchived).toBe(true)
  })
})

describe('desktopFlagsFor', () => {
  it('returns both flags false when the desktop app has no record for the session', () => {
    expect(desktopFlagsFor(new Map(), 'unknown')).toEqual({ isArchived: false, lineageDetached: false })
  })
})
