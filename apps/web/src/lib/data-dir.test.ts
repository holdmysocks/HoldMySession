import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { dataDir, resetLegacyCheck } from './data-dir'

describe('dataDir', () => {
  let home: string
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'datadir-'))
    vi.stubEnv('HOME', home)
    vi.stubEnv('USERPROFILE', home)
    for (const name of ['HOLDMYSESSION_DIR', 'CLAUDE_DASHBOARD_DIR', 'CLAUDE_DASHBOARD_HOME']) vi.stubEnv(name, '')
    resetLegacyCheck()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('is ~/.holdmysession by default', () => {
    expect(dataDir()).toBe(path.join(home, '.holdmysession'))
  })

  it('takes the new override first, then the old names', () => {
    vi.stubEnv('CLAUDE_DASHBOARD_HOME', '/old/home')
    expect(dataDir()).toBe('/old/home')
    vi.stubEnv('CLAUDE_DASHBOARD_DIR', '/old/dir')
    expect(dataDir()).toBe('/old/dir')
    vi.stubEnv('HOLDMYSESSION_DIR', '/new/dir')
    expect(dataDir()).toBe('/new/dir')
  })

  it('copies the old folder to the new one on first use, and leaves the old one in place', () => {
    const legacy = path.join(home, '.claude-dashboard')
    fs.mkdirSync(path.join(legacy, 'cache'), { recursive: true })
    fs.writeFileSync(path.join(legacy, 'settings.json'), '{"a":1}')
    fs.writeFileSync(path.join(legacy, 'cache', 'x.json'), '{}')
    expect(dataDir()).toBe(path.join(home, '.holdmysession'))
    expect(fs.readFileSync(path.join(home, '.holdmysession', 'settings.json'), 'utf-8')).toBe('{"a":1}')
    expect(fs.existsSync(path.join(home, '.holdmysession', 'cache', 'x.json'))).toBe(true)
    expect(fs.existsSync(path.join(legacy, 'settings.json'))).toBe(true)
  })

  it('does not touch a new folder that already exists, even if the old one is still there', () => {
    fs.mkdirSync(path.join(home, '.claude-dashboard'), { recursive: true })
    fs.writeFileSync(path.join(home, '.claude-dashboard', 'settings.json'), 'old')
    fs.mkdirSync(path.join(home, '.holdmysession'), { recursive: true })
    fs.writeFileSync(path.join(home, '.holdmysession', 'settings.json'), 'new')
    dataDir()
    expect(fs.readFileSync(path.join(home, '.holdmysession', 'settings.json'), 'utf-8')).toBe('new')
  })

  it('does nothing when neither folder exists yet', () => {
    dataDir()
    expect(fs.existsSync(path.join(home, '.holdmysession'))).toBe(false)
  })
})
