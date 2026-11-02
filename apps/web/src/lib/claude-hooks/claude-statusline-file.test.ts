import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const THEIRS = { type: 'command', command: '~/.claude/statusline.sh', padding: 1 }

describe('setStatusLine on a real settings file', () => {
  let root: string
  let claude: string
  let data: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'statusline-file-'))
    claude = path.join(root, 'claude')
    data = path.join(root, 'data')
    fs.mkdirSync(claude)
    vi.stubEnv('CLAUDE_CONFIG_DIR', claude)
    vi.stubEnv('HOLDMYSESSION_DIR', data)
    vi.stubEnv('HOLDMYSESSION_EXE', 'C:\\HoldMySession\\HoldMySession.exe')
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const load = () => import('./claude-settings-file')
  const write = (value: unknown) => fs.writeFileSync(path.join(claude, 'settings.json'), typeof value === 'string' ? value : JSON.stringify(value))
  const read = () => JSON.parse(fs.readFileSync(path.join(claude, 'settings.json'), 'utf-8'))

  it('creates the file when there is none, and removes the entry again', async () => {
    const { setStatusLine, readStatusLineState } = await load()
    expect(readStatusLineState()).toMatchObject({ installed: false, otherStatusLine: false, readable: true })
    expect(setStatusLine(true)).toMatchObject({ installed: true, stale: false })
    expect(read().statusLine).toEqual({ type: 'command', command: '"C:/HoldMySession/HoldMySession.exe" --holdmysession-statusline' })
    expect(setStatusLine(false).installed).toBe(false)
    expect(read()).toEqual({})
  })

  it('keeps another status line, and puts it back exactly', async () => {
    write({ model: 'x', statusLine: THEIRS })
    const { setStatusLine, readStatusLineState } = await load()
    expect(readStatusLineState().otherStatusLine).toBe(true)
    setStatusLine(true)
    expect(JSON.parse(fs.readFileSync(path.join(data, 'statusline-previous.json'), 'utf-8'))).toEqual(THEIRS)
    expect(read().model).toBe('x')
    expect(read().statusLine.command).toContain('--holdmysession-statusline')
    setStatusLine(false)
    expect(read()).toEqual({ model: 'x', statusLine: THEIRS })
    expect(fs.existsSync(path.join(data, 'statusline-previous.json'))).toBe(false)
  })

  it('enabling twice keeps the saved status line', async () => {
    write({ statusLine: THEIRS })
    const { setStatusLine } = await load()
    setStatusLine(true)
    setStatusLine(true)
    setStatusLine(false)
    expect(read()).toEqual({ statusLine: THEIRS })
  })

  it('reports a moved install as stale and fixes it on enable', async () => {
    write({ statusLine: { type: 'command', command: '"D:/Old/HoldMySession.exe" --holdmysession-statusline' } })
    const { setStatusLine, readStatusLineState } = await load()
    expect(readStatusLineState()).toMatchObject({ installed: true, stale: true })
    expect(setStatusLine(true).stale).toBe(false)
  })

  it('leaves the file alone, and says why, when it is not valid JSON', async () => {
    write('{ "statusLine": ')
    const { setStatusLine, readStatusLineState } = await load()
    expect(readStatusLineState()).toMatchObject({ readable: false })
    expect(() => setStatusLine(true)).toThrow(/not valid JSON/)
    expect(fs.readFileSync(path.join(claude, 'settings.json'), 'utf-8')).toBe('{ "statusLine": ')
  })

  it('keeps a copy of the file from before it changed it', async () => {
    write({ statusLine: THEIRS })
    const { setStatusLine } = await load()
    setStatusLine(true)
    const backups = fs.readdirSync(path.join(data, 'claude-settings-backups'))
    expect(backups).toHaveLength(1)
    expect(JSON.parse(fs.readFileSync(path.join(data, 'claude-settings-backups', backups[0]), 'utf-8'))).toEqual({ statusLine: THEIRS })
  })

  it('does not touch a status line that someone set after ours was removed', async () => {
    write({ statusLine: THEIRS })
    const { setStatusLine } = await load()
    setStatusLine(false)
    expect(read()).toEqual({ statusLine: THEIRS })
  })
})
