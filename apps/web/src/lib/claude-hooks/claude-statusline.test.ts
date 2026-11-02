import { describe, expect, it } from 'vitest'
import { addStatusLine, foreignStatusLine, installedStatusLineCommand, isOurStatusLine, removeStatusLine, statusLineCommand } from './claude-statusline'

const OURS = '"C:/HoldMySession/HoldMySession.exe" --holdmysession-statusline'
const THEIRS = { type: 'command', command: '~/.claude/statusline.sh', padding: 2 }

describe('statusLineCommand', () => {
  it('uses the installed program with forward slashes', () => {
    expect(statusLineCommand({ exePath: 'C:\\HoldMySession\\HoldMySession.exe', appDir: 'x' })).toBe(OURS)
  })
  it('uses node and the script from a checkout', () => {
    expect(statusLineCommand({ appDir: 'C:\\src\\apps\\web' })).toBe('node "C:/src/apps/web/bin/holdmysession-statusline.mjs"')
  })
})

describe('detecting ours', () => {
  it('knows both forms and nothing else', () => {
    expect(isOurStatusLine({ type: 'command', command: OURS })).toBe(true)
    expect(isOurStatusLine({ type: 'command', command: 'node "/a/bin/holdmysession-statusline.mjs"' })).toBe(true)
    expect(isOurStatusLine(THEIRS)).toBe(false)
    for (const v of [null, undefined, 'x', [], {}, { command: 5 }]) expect(isOurStatusLine(v)).toBe(false)
  })
  it('reads the installed command and the foreign status line', () => {
    expect(installedStatusLineCommand({ statusLine: { type: 'command', command: OURS } })).toBe(OURS)
    expect(installedStatusLineCommand({ statusLine: THEIRS })).toBeNull()
    expect(installedStatusLineCommand({})).toBeNull()
    expect(foreignStatusLine({ statusLine: THEIRS })).toEqual(THEIRS)
    expect(foreignStatusLine({ statusLine: { command: OURS } })).toBeNull()
    expect(foreignStatusLine(null)).toBeNull()
  })
})

describe('addStatusLine', () => {
  it('adds ours to settings that have none and keeps everything else', () => {
    const next = addStatusLine({ model: 'x', hooks: { Stop: [] } }, OURS)
    expect(next).toEqual({ model: 'x', hooks: { Stop: [] }, statusLine: { type: 'command', command: OURS } })
  })
  it('replaces a status line of someone else, keeping its padding', () => {
    expect(addStatusLine({ statusLine: THEIRS }, OURS).statusLine).toEqual({ padding: 2, type: 'command', command: OURS })
  })
  it('updates our own command in place, for a moved install', () => {
    const once = addStatusLine({}, OURS)
    expect(addStatusLine(once, '"D:/New/HoldMySession.exe" --holdmysession-statusline').statusLine).toEqual({ type: 'command', command: '"D:/New/HoldMySession.exe" --holdmysession-statusline' })
  })
  it('does not change its input', () => {
    const settings = { statusLine: THEIRS }
    addStatusLine(settings, OURS)
    expect(settings).toEqual({ statusLine: THEIRS })
  })
  it('starts from an empty object for non-object settings', () => {
    expect(addStatusLine(null, OURS)).toEqual({ statusLine: { type: 'command', command: OURS } })
  })
})

describe('removeStatusLine', () => {
  const installed = { model: 'x', statusLine: { type: 'command', command: OURS } }
  it('puts the previous status line back exactly', () => {
    expect(removeStatusLine(installed, THEIRS)).toEqual({ model: 'x', statusLine: THEIRS })
  })
  it('removes the entry when there was no previous one', () => {
    expect(removeStatusLine(installed, null)).toEqual({ model: 'x' })
    expect(removeStatusLine(installed, { command: '' })).toEqual({ model: 'x' })
  })
  it('never touches a status line that is not ours', () => {
    expect(removeStatusLine({ statusLine: THEIRS }, { command: 'other' })).toEqual({ statusLine: THEIRS })
  })
  it('does nothing when there is no status line', () => {
    expect(removeStatusLine({ a: 1 }, THEIRS)).toEqual({ a: 1 })
  })
})
