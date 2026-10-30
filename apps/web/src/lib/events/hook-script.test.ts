import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getEventLogPath, parseEventLines, readRecentEvents } from './event-inbox'

const HOOK_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../bin/claude-dashboard-hook.mjs')

describe('bin/claude-dashboard-hook.mjs', () => {
  let home: string
  const originalHome = process.env.CLAUDE_DASHBOARD_HOME

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-script-'))
  })

  afterEach(() => {
    if (originalHome === undefined) delete process.env.CLAUDE_DASHBOARD_HOME
    else process.env.CLAUDE_DASHBOARD_HOME = originalHome
    fs.rmSync(home, { recursive: true, force: true })
  })

  function run(stdin: string, dashboardHome = home) {
    return spawnSync(process.execPath, [HOOK_SCRIPT], {
      input: stdin,
      encoding: 'utf-8',
      env: { ...process.env, CLAUDE_DASHBOARD_HOME: dashboardHome },
      timeout: 15_000,
    })
  }

  function logLines(): string[] {
    const file = path.join(home, 'events.jsonl')
    if (!fs.existsSync(file)) return []
    return fs.readFileSync(file, 'utf-8').split('\n').filter((l) => l.trim() !== '')
  }

  it('appends a Notification event with the payload fields', () => {
    const result = run(
      JSON.stringify({
        hook_event_name: 'Notification',
        session_id: 'sess-1',
        cwd: '/work/app',
        message: 'Claude needs your permission to use Bash',
      }),
    )

    expect(result.status).toBe(0)
    const lines = logLines()
    expect(lines).toHaveLength(1)
    const record = JSON.parse(lines[0])
    expect(record).toMatchObject({
      event: 'Notification',
      sessionId: 'sess-1',
      cwd: '/work/app',
      message: 'Claude needs your permission to use Bash',
      notificationType: null,
      title: null,
    })
    expect(Number.isNaN(Date.parse(record.ts))).toBe(false)
  })

  it('records notification_type and title from a Notification payload', () => {
    const result = run(
      JSON.stringify({
        hook_event_name: 'Notification',
        session_id: 'sess-typed',
        notification_type: 'permission_prompt',
        title: 'Permission needed',
        message: 'Claude needs your permission to use Bash',
      }),
    )
    expect(result.status).toBe(0)
    expect(JSON.parse(logLines()[0])).toMatchObject({
      event: 'Notification',
      notificationType: 'permission_prompt',
      title: 'Permission needed',
      message: 'Claude needs your permission to use Bash',
    })
  })

  it('records notificationType and title as null when the payload omits them', () => {
    run(JSON.stringify({ hook_event_name: 'Notification', session_id: 'sess-bare', message: 'hi' }))
    const record = JSON.parse(logLines()[0])
    expect(record.notificationType).toBeNull()
    expect(record.title).toBeNull()
  })

  it('records non-string notification_type and title as null', () => {
    run(JSON.stringify({ hook_event_name: 'Notification', session_id: 's', notification_type: 7, title: ['x'] }))
    const record = JSON.parse(logLines()[0])
    expect(record.notificationType).toBeNull()
    expect(record.title).toBeNull()
  })

  it('records Stop events with null for absent cwd and message', () => {
    const result = run(JSON.stringify({ hook_event_name: 'Stop', session_id: 'sess-2' }))

    expect(result.status).toBe(0)
    const record = JSON.parse(logLines()[0])
    expect(record.event).toBe('Stop')
    expect(record.sessionId).toBe('sess-2')
    expect(record.cwd).toBeNull()
    expect(record.message).toBeNull()
  })

  it('records non-string cwd and message as null', () => {
    run(
      JSON.stringify({ hook_event_name: 'Stop', session_id: 's', cwd: 42, message: { nested: true } }),
    )
    const record = JSON.parse(logLines()[0])
    expect(record.cwd).toBeNull()
    expect(record.message).toBeNull()
  })

  it('ignores events it does not record', () => {
    const result = run(JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 's', cwd: '/x' }))
    expect(result.status).toBe(0)
    expect(logLines()).toEqual([])
  })

  it('exits 0 and writes nothing for non-JSON input', () => {
    const result = run('this is not json {{{')
    expect(result.status).toBe(0)
    expect(logLines()).toEqual([])
  })

  it('exits 0 and writes nothing for empty input', () => {
    const result = run('')
    expect(result.status).toBe(0)
    expect(logLines()).toEqual([])
  })

  it('exits 0 and writes nothing for a JSON value that is not an object', () => {
    expect(run('null').status).toBe(0)
    expect(run('"Stop"').status).toBe(0)
    expect(run('[1,2,3]').status).toBe(0)
    expect(logLines()).toEqual([])
  })

  it('exits 0 and writes nothing when session_id is missing', () => {
    const result = run(JSON.stringify({ hook_event_name: 'Stop' }))
    expect(result.status).toBe(0)
    expect(logLines()).toEqual([])
  })

  it('creates the dashboard directory when it does not exist yet', () => {
    const nested = path.join(home, 'not', 'yet', 'there')
    const result = run(JSON.stringify({ hook_event_name: 'Stop', session_id: 's' }), nested)
    expect(result.status).toBe(0)
    expect(fs.existsSync(path.join(nested, 'events.jsonl'))).toBe(true)
  })

  it('appends to an existing log rather than overwriting it', () => {
    run(JSON.stringify({ hook_event_name: 'Stop', session_id: 'first' }))
    run(JSON.stringify({ hook_event_name: 'Stop', session_id: 'second' }))
    const sessions = logLines().map((l) => JSON.parse(l).sessionId)
    expect(sessions).toEqual(['first', 'second'])
  })

  it('writes to the same path the dashboard reads from', async () => {
    process.env.CLAUDE_DASHBOARD_HOME = home
    expect(getEventLogPath()).toBe(path.join(home, 'events.jsonl'))

    run(JSON.stringify({ hook_event_name: 'Notification', session_id: 'round-trip', message: 'hi' }))

    const events = await readRecentEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ event: 'Notification', sessionId: 'round-trip', message: 'hi' })
  })

  it('produces lines that parseEventLines accepts', () => {
    run(JSON.stringify({ hook_event_name: 'Stop', session_id: 'valid' }))
    const parsed = parseEventLines(logLines().join('\n'), 10)
    expect(parsed.map((e) => e.sessionId)).toEqual(['valid'])
  })

  describe('which folder it writes to', () => {
    const payload = JSON.stringify({ hook_event_name: 'Stop', session_id: 's', cwd: '/w' })
    function runIn(userHome: string) {
      const env = { ...process.env, HOME: userHome, USERPROFILE: userHome } as Record<string, string | undefined>
      for (const name of ['HOLDMYSESSION_DIR', 'CLAUDE_DASHBOARD_DIR', 'CLAUDE_DASHBOARD_HOME']) delete env[name]
      return spawnSync(process.execPath, [HOOK_SCRIPT], { input: payload, encoding: 'utf-8', env, timeout: 15_000 })
    }

    it('uses ~/.holdmysession on a fresh machine', () => {
      runIn(home)
      expect(fs.existsSync(path.join(home, '.holdmysession', 'events.jsonl'))).toBe(true)
    })

    it('keeps using the old folder until the dashboard has copied it across', () => {
      fs.mkdirSync(path.join(home, '.claude-dashboard'))
      runIn(home)
      expect(fs.existsSync(path.join(home, '.claude-dashboard', 'events.jsonl'))).toBe(true)
      expect(fs.existsSync(path.join(home, '.holdmysession'))).toBe(false)
    })

    it('uses the new folder once it exists, even if the old one is still there', () => {
      fs.mkdirSync(path.join(home, '.claude-dashboard'))
      fs.mkdirSync(path.join(home, '.holdmysession'))
      runIn(home)
      expect(fs.existsSync(path.join(home, '.holdmysession', 'events.jsonl'))).toBe(true)
    })
  })
})
