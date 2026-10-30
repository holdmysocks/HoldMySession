import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { loadAutoCompactWindow, pickAutoCompactWindow, validAutoCompactWindow } from './auto-compact'

describe('validAutoCompactWindow', () => {
  it('accepts a whole number from 100,000 to 1,000,000, or text holding one', () => {
    expect(validAutoCompactWindow(400_000)).toBe(400_000)
    expect(validAutoCompactWindow(100_000)).toBe(100_000)
    expect(validAutoCompactWindow(1_000_000)).toBe(1_000_000)
    expect(validAutoCompactWindow('400000')).toBe(400_000)
  })

  it('ignores anything else, as Claude Code does', () => {
    for (const value of [99_999, 1_000_001, 0, -5, 400_000.5, '4e5', '400k', 'auto', null, undefined, {}, [], true, NaN]) {
      expect(validAutoCompactWindow(value)).toBeNull()
    }
  })
})

describe('pickAutoCompactWindow', () => {
  it('reads the value set for the model', () => {
    const settings = { modelSettings: { 'claude-haiku-5-5': { autoCompactWindow: 400_000 } } }
    expect(pickAutoCompactWindow([settings], 'claude-haiku-5-5')).toBe(400_000)
  })

  it('matches the model whatever its case, date suffix or [1m] tag', () => {
    const settings = { modelSettings: { 'Claude-Opus-5-5[1m]': { autoCompactWindow: 300_000 } } }
    expect(pickAutoCompactWindow([settings], 'claude-opus-5-5-20261001')).toBe(300_000)
    expect(pickAutoCompactWindow([settings], 'claude-opus-5-5')).toBe(300_000)
  })

  it('does not apply one model\'s value to another', () => {
    const settings = { modelSettings: { 'claude-haiku-5-5': { autoCompactWindow: 400_000 } } }
    expect(pickAutoCompactWindow([settings], 'claude-opus-5-5')).toBeNull()
  })

  it('uses the general value for any model, and a model\'s own value over it in the same file', () => {
    const settings = { autoCompactWindow: 500_000, modelSettings: { 'claude-haiku-5-5': { autoCompactWindow: 400_000 } } }
    expect(pickAutoCompactWindow([settings], 'claude-opus-5-5')).toBe(500_000)
    expect(pickAutoCompactWindow([settings], 'claude-haiku-5-5')).toBe(400_000)
  })

  it('lets the first file that sets anything decide, most specific first', () => {
    const local = { autoCompactWindow: 250_000 }
    const project = { modelSettings: { 'claude-haiku-5-5': { autoCompactWindow: 300_000 } } }
    const user = { modelSettings: { 'claude-haiku-5-5': { autoCompactWindow: 400_000 } }, autoCompactWindow: 600_000 }
    expect(pickAutoCompactWindow([local, project, user], 'claude-haiku-5-5')).toBe(250_000)
    expect(pickAutoCompactWindow([null, project, user], 'claude-haiku-5-5')).toBe(300_000)
    expect(pickAutoCompactWindow([null, null, user], 'claude-haiku-5-5')).toBe(400_000)
  })

  it('skips an invalid value and falls to the next, and copes with odd files', () => {
    const bad = { modelSettings: { 'claude-haiku-5-5': { autoCompactWindow: 5 } }, autoCompactWindow: 'big' }
    const good = { autoCompactWindow: 350_000 }
    expect(pickAutoCompactWindow([bad, good], 'claude-haiku-5-5')).toBe(350_000)
    expect(pickAutoCompactWindow([null, 'text', 7, [], { modelSettings: 'x' }, { modelSettings: { m: null } }], 'm')).toBeNull()
    expect(pickAutoCompactWindow([], 'claude-haiku-5-5')).toBeNull()
  })
})

describe('loadAutoCompactWindow', () => {
  let home: string
  let project: string

  beforeEach(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-compact-'))
    home = path.join(root, 'claude')
    project = path.join(root, 'project')
    fs.mkdirSync(home, { recursive: true })
    fs.mkdirSync(path.join(project, '.claude'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(path.dirname(home), { recursive: true, force: true })
  })

  const write = (file: string, body: unknown) => fs.writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body))

  it('reads the setting from the user settings, the way /autocompact writes it', async () => {
    write(path.join(home, 'settings.json'), { modelSettings: { 'claude-haiku-5-5': { autoCompactWindow: 400_000 } } })
    expect(await loadAutoCompactWindow(project, 'claude-haiku-5-5', home)).toBe(400_000)
  })

  it('prefers the project\'s local settings, then its settings, over the user\'s', async () => {
    write(path.join(home, 'settings.json'), { autoCompactWindow: 600_000 })
    write(path.join(project, '.claude', 'settings.json'), { autoCompactWindow: 500_000 })
    expect(await loadAutoCompactWindow(project, 'claude-opus-5-5', home)).toBe(500_000)
    write(path.join(project, '.claude', 'settings.local.json'), { autoCompactWindow: 300_000 })
    expect(await loadAutoCompactWindow(project, 'claude-opus-5-5', home)).toBe(300_000)
  })

  it('is null when nothing is set, files are missing, or a file is not valid JSON', async () => {
    expect(await loadAutoCompactWindow(project, 'claude-opus-5-5', home)).toBeNull()
    write(path.join(home, 'settings.json'), '{not json')
    expect(await loadAutoCompactWindow(project, 'claude-opus-5-5', home)).toBeNull()
  })

  it('reads only the user settings when the project path is not a real path here', async () => {
    write(path.join(home, 'settings.json'), { autoCompactWindow: 450_000 })
    expect(await loadAutoCompactWindow('D--MCLA', 'claude-opus-5-5', home)).toBe(450_000)
    expect(await loadAutoCompactWindow(null, 'claude-opus-5-5', home)).toBe(450_000)
  })
})
