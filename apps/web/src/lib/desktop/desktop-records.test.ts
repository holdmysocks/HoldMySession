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
  it('reads archived, split, activity and parent fields from a record', () => {
    expect(
      parseDesktopRecord({
        cliSessionId: 'abc',
        sessionId: 'local_1',
        isArchived: true,
        lineageDetached: true,
        lastActivityAt: 1793280587490,
        spawnedFrom: { sessionId: 'local_0' },
      }),
    ).toEqual({
      cliSessionId: 'abc',
      localId: 'local_1',
      isArchived: true,
      lineageDetached: true,
      lastActivityAt: 1793280587490,
      parentLocalId: 'local_0',
      cwd: null,
      parentCliSessionId: null,
      priorCliSessionIds: [],
      superseded: false,
    })
  })

  it('reads the older transcripts of a session, keeping only non-empty strings', () => {
    expect(
      parseDesktopRecord({ cliSessionId: 'now', priorCliSessionIds: ['old-1', '', 7, null, 'old-2'] })?.priorCliSessionIds,
    ).toEqual(['old-1', 'old-2'])
    expect(parseDesktopRecord({ cliSessionId: 'now', priorCliSessionIds: 'old' })?.priorCliSessionIds).toEqual([])
    expect(parseDesktopRecord({ cliSessionId: 'now' })?.priorCliSessionIds).toEqual([])
  })

  it('does not nest a user fork or a side question under the session it came from', () => {
    expect(
      parseDesktopRecord({ cliSessionId: 'a', spawnedFrom: { sessionId: 'local_9', userFork: true } })?.parentLocalId,
    ).toBeNull()
    expect(
      parseDesktopRecord({ cliSessionId: 'a', spawnedFrom: { sessionId: 'local_9', btw: true } })?.parentLocalId,
    ).toBeNull()
    // A side session that is not a user fork still nests, as the app shows it.
    expect(
      parseDesktopRecord({ cliSessionId: 'a', spawnedFrom: { sessionId: 'local_9', sideSession: true } })?.parentLocalId,
    ).toBe('local_9')
  })

  it('reads the project folder, and treats a blank one as not set', () => {
    expect(parseDesktopRecord({ cliSessionId: 'a', cwd: 'D:\\MCLA' })?.cwd).toBe('D:\\MCLA')
    expect(parseDesktopRecord({ cliSessionId: 'a', cwd: '  ' })?.cwd).toBeNull()
  })

  it('treats missing or odd flags as not set', () => {
    expect(parseDesktopRecord({ cliSessionId: 'abc' })).toEqual({
      cliSessionId: 'abc',
      localId: '',
      isArchived: false,
      lineageDetached: false,
      lastActivityAt: null,
      parentLocalId: null,
      cwd: null,
      parentCliSessionId: null,
      priorCliSessionIds: [],
      superseded: false,
    })
    expect(parseDesktopRecord({ cliSessionId: 'abc', isArchived: 'yes', lineageDetached: null })).toMatchObject({
      isArchived: false,
      lineageDetached: false,
    })
  })

  it('accepts a split marker that is a timestamp, not only true', () => {
    expect(parseDesktopRecord({ cliSessionId: 'abc', lineageDetached: 1793280587490 })?.lineageDetached).toBe(true)
  })

  it('reads spawnedFrom whether it is a bare string or an object', () => {
    expect(parseDesktopRecord({ cliSessionId: 'a', spawnedFrom: 'local_9' })?.parentLocalId).toBe('local_9')
    expect(parseDesktopRecord({ cliSessionId: 'a', spawnedFrom: { sessionId: 'local_9' } })?.parentLocalId).toBe('local_9')
    expect(parseDesktopRecord({ cliSessionId: 'a', spawnedFrom: {} })?.parentLocalId).toBeNull()
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
    expect(flags.get('cli-1')).toMatchObject({ cliSessionId: 'cli-1', isArchived: true, lineageDetached: false })
    expect(flags.get('cli-2')).toMatchObject({ cliSessionId: 'cli-2', isArchived: false, lineageDetached: true })
  })

  it('resolves a spawnedFrom app ID to the parent transcript ID', async () => {
    writeRecord('account/local_parent.json', { sessionId: 'local_parent', cliSessionId: 'cli-parent' })
    writeRecord('account/local_child.json', {
      sessionId: 'local_child',
      cliSessionId: 'cli-child',
      spawnedFrom: { sessionId: 'local_parent' },
    })
    writeRecord('account/local_orphan.json', {
      sessionId: 'local_orphan',
      cliSessionId: 'cli-orphan',
      spawnedFrom: { sessionId: 'local_gone' },
    })

    const flags = await readDesktopSessionFlags(dir)
    expect(flags.get('cli-child')!.parentCliSessionId).toBe('cli-parent')
    expect(flags.get('cli-parent')!.parentCliSessionId).toBeNull()
    expect(flags.get('cli-orphan')!.parentCliSessionId).toBeNull()
  })

  it('ignores files that are not session records, and files that do not parse', async () => {
    writeRecord('account/archived-sessions.idx', { v: 1, archived: ['local_1'] })
    writeRecord('account/local_bad.json', '{ not json')
    writeRecord('account/local_empty.json', { sessionId: 'local_9' })
    const flags = await readDesktopSessionFlags(dir)
    expect(flags.size).toBe(0)
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
  it('returns all false or null when the desktop app has no record for the session', () => {
    expect(desktopFlagsFor(new Map(), 'unknown')).toEqual({
      isArchived: false,
      lineageDetached: false,
      desktopActivityAt: null,
      desktopParentId: null,
      isSuperseded: false,
      desktopRecordId: null,
    })
  })

  it('returns the activity time as ISO text and the resolved parent', () => {
    const flags = new Map([
      [
        'cli-child',
        {
          cliSessionId: 'cli-child',
          localId: 'local_child',
          isArchived: false,
          lineageDetached: false,
          lastActivityAt: 1793280587490,
          parentLocalId: 'local_parent',
          cwd: null,
          parentCliSessionId: 'cli-parent',
          priorCliSessionIds: [],
          superseded: false,
        },
      ],
    ])
    expect(desktopFlagsFor(flags, 'cli-child')).toEqual({
      isArchived: false,
      lineageDetached: false,
      desktopActivityAt: new Date(1793280587490).toISOString(),
      desktopParentId: 'cli-parent',
      isSuperseded: false,
      desktopRecordId: 'local_child',
    })
  })
})

describe('older transcripts of a session', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-prior-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function writeRecord(relative: string, body: unknown) {
    const full = path.join(dir, relative)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, JSON.stringify(body))
  }

  // Shaped like a real record: one desktop session whose app moved on to a new transcript twice.
  const session = (extra: object = {}) => ({
    sessionId: 'local_ui',
    cliSessionId: 'current-1906',
    title: 'UI',
    isArchived: false,
    priorCliSessionIds: ['old-4ee8', 'old-a9c7'],
    rewindEdges: [{ parent: 'old-4ee8', child: 'old-a9c7' }, { parent: 'old-a9c7', child: 'current-1906' }],
    ...extra,
  })

  it('marks each older transcript as superseded, and the current one as a session', async () => {
    writeRecord('a/b/local_ui.json', session())
    const flags = await readDesktopSessionFlags(dir)
    expect(desktopFlagsFor(flags, 'current-1906').isSuperseded).toBe(false)
    expect(desktopFlagsFor(flags, 'old-4ee8').isSuperseded).toBe(true)
    expect(desktopFlagsFor(flags, 'old-a9c7').isSuperseded).toBe(true)
  })

  it('gives an older transcript its record\'s archived flag, so it is hidden either way', async () => {
    writeRecord('a/b/local_ui.json', session({ isArchived: true }))
    const flags = await readDesktopSessionFlags(dir)
    expect(desktopFlagsFor(flags, 'old-4ee8')).toMatchObject({ isArchived: true, isSuperseded: true })
    expect(desktopFlagsFor(flags, 'current-1906')).toMatchObject({ isArchived: true, isSuperseded: false })
  })

  it('leaves a transcript alone that has a record of its own, even if another record lists it', async () => {
    writeRecord('a/b/local_ui.json', session())
    writeRecord('a/b/local_other.json', { sessionId: 'local_other', cliSessionId: 'old-a9c7', title: 'Own session' })
    const flags = await readDesktopSessionFlags(dir)
    expect(desktopFlagsFor(flags, 'old-a9c7')).toMatchObject({ isSuperseded: false })
    expect(desktopFlagsFor(flags, 'old-4ee8').isSuperseded).toBe(true)
  })

  it('does not mark the current transcript superseded when a record lists itself', async () => {
    writeRecord('a/b/local_ui.json', session({ priorCliSessionIds: ['current-1906', 'old-4ee8'] }))
    const flags = await readDesktopSessionFlags(dir)
    expect(desktopFlagsFor(flags, 'current-1906').isSuperseded).toBe(false)
  })

  it('knows nothing about a transcript no record mentions', async () => {
    writeRecord('a/b/local_ui.json', session())
    expect(desktopFlagsFor(await readDesktopSessionFlags(dir), 'cli-terminal').isSuperseded).toBe(false)
  })
})
