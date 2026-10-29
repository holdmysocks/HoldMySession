import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  getEventLogPath,
  HookEventSchema,
  latestNotificationBySession,
  parseEventLines,
  readRecentEvents,
  type HookEvent,
} from './event-inbox'

function line(overrides: Partial<HookEvent> = {}): string {
  return JSON.stringify({
    ts: '2026-01-01T10:00:00.000Z',
    event: 'Notification',
    sessionId: 'session-a',
    cwd: '/work/app',
    message: 'Claude needs your permission',
    ...overrides,
  })
}

describe('HookEventSchema', () => {
  it('accepts an event with optional fields omitted', () => {
    const result = HookEventSchema.safeParse({ ts: 't', event: 'Stop', sessionId: 's' })
    expect(result.success).toBe(true)
  })

  it('accepts explicit nulls for cwd and message', () => {
    const result = HookEventSchema.safeParse({
      ts: 't',
      event: 'Stop',
      sessionId: 's',
      cwd: null,
      message: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects an event without a session id', () => {
    expect(HookEventSchema.safeParse({ ts: 't', event: 'Stop' }).success).toBe(false)
  })
})

describe('getEventLogPath', () => {
  const originalHome = process.env.CLAUDE_DASHBOARD_HOME

  afterEach(() => {
    if (originalHome === undefined) delete process.env.CLAUDE_DASHBOARD_HOME
    else process.env.CLAUDE_DASHBOARD_HOME = originalHome
  })

  it('uses CLAUDE_DASHBOARD_HOME when set', () => {
    process.env.CLAUDE_DASHBOARD_HOME = '/custom/home'
    expect(getEventLogPath()).toBe(path.join('/custom/home', 'events.jsonl'))
  })

  it('defaults to ~/.claude-dashboard when the variable is unset', () => {
    delete process.env.CLAUDE_DASHBOARD_HOME
    expect(getEventLogPath()).toBe(path.join(os.homedir(), '.claude-dashboard', 'events.jsonl'))
  })

  it('treats an empty variable as unset', () => {
    process.env.CLAUDE_DASHBOARD_HOME = ''
    expect(getEventLogPath()).toBe(path.join(os.homedir(), '.claude-dashboard', 'events.jsonl'))
  })
})

describe('parseEventLines', () => {
  it('returns an empty list for empty text', () => {
    expect(parseEventLines('', 10)).toEqual([])
  })

  it('skips blank lines, invalid JSON and schema mismatches', () => {
    const text = [
      line({ sessionId: 'good-1' }),
      '',
      '   ',
      '{not json',
      JSON.stringify({ ts: 't', event: 'Stop' }),
      line({ sessionId: 'good-2' }),
    ].join('\n')

    const events = parseEventLines(text, 10)
    expect(events.map((e) => e.sessionId)).toEqual(['good-1', 'good-2'])
  })

  it('returns the last `limit` events in file order', () => {
    const text = ['a', 'b', 'c', 'd', 'e'].map((id) => line({ sessionId: id })).join('\n')
    expect(parseEventLines(text, 2).map((e) => e.sessionId)).toEqual(['d', 'e'])
  })

  it('returns everything when the file holds fewer than the limit', () => {
    const text = ['a', 'b'].map((id) => line({ sessionId: id })).join('\n')
    expect(parseEventLines(text, 500).map((e) => e.sessionId)).toEqual(['a', 'b'])
  })

  it('does not count invalid lines towards the limit', () => {
    const text = [line({ sessionId: 'keep' }), 'garbage', 'garbage', line({ sessionId: 'last' })].join('\n')
    expect(parseEventLines(text, 2).map((e) => e.sessionId)).toEqual(['keep', 'last'])
  })

  it('handles a trailing newline and CRLF endings', () => {
    const text = line({ sessionId: 'crlf' }) + '\r\n' + line({ sessionId: 'tail' }) + '\n'
    expect(parseEventLines(text, 10).map((e) => e.sessionId)).toEqual(['crlf', 'tail'])
  })

  it('returns an empty list for a non-positive limit', () => {
    expect(parseEventLines(line(), 0)).toEqual([])
    expect(parseEventLines(line(), -1)).toEqual([])
  })
})

describe('readRecentEvents', () => {
  let dir: string
  const originalHome = process.env.CLAUDE_DASHBOARD_HOME

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-inbox-'))
    process.env.CLAUDE_DASHBOARD_HOME = dir
  })

  afterEach(() => {
    if (originalHome === undefined) delete process.env.CLAUDE_DASHBOARD_HOME
    else process.env.CLAUDE_DASHBOARD_HOME = originalHome
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns [] when the events file does not exist', async () => {
    expect(await readRecentEvents()).toEqual([])
  })

  it('reads events from the configured home directory', async () => {
    fs.writeFileSync(path.join(dir, 'events.jsonl'), line({ sessionId: 'from-file' }) + '\n')
    const events = await readRecentEvents()
    expect(events).toHaveLength(1)
    expect(events[0].sessionId).toBe('from-file')
  })

  it('applies the limit to the file contents', async () => {
    const text = Array.from({ length: 10 }, (_, i) => line({ sessionId: `s${i}` })).join('\n')
    fs.writeFileSync(path.join(dir, 'events.jsonl'), text + '\n')
    const events = await readRecentEvents(3)
    expect(events.map((e) => e.sessionId)).toEqual(['s7', 's8', 's9'])
  })
})

describe('latestNotificationBySession', () => {
  it('returns an empty map when there are no notifications', () => {
    const events: HookEvent[] = [{ ts: 't', event: 'Stop', sessionId: 's1' }]
    expect(latestNotificationBySession(events).size).toBe(0)
  })

  it('keeps the greatest timestamp per session', () => {
    const events: HookEvent[] = [
      { ts: '2026-01-01T10:00:00.000Z', event: 'Notification', sessionId: 's1' },
      { ts: '2026-01-01T12:00:00.000Z', event: 'Notification', sessionId: 's1' },
      { ts: '2026-01-01T11:00:00.000Z', event: 'Notification', sessionId: 's1' },
      { ts: '2026-01-01T09:00:00.000Z', event: 'Notification', sessionId: 's2' },
    ]
    const latest = latestNotificationBySession(events)
    expect(latest.get('s1')).toBe('2026-01-01T12:00:00.000Z')
    expect(latest.get('s2')).toBe('2026-01-01T09:00:00.000Z')
  })

  it('ignores non-Notification events', () => {
    const events: HookEvent[] = [
      { ts: '2026-01-01T12:00:00.000Z', event: 'Stop', sessionId: 's1' },
      { ts: '2026-01-01T10:00:00.000Z', event: 'Notification', sessionId: 's1' },
    ]
    expect(latestNotificationBySession(events).get('s1')).toBe('2026-01-01T10:00:00.000Z')
  })

  it('compares offsets as instants', () => {
    const events: HookEvent[] = [
      { ts: '2026-01-01T12:00:00+02:00', event: 'Notification', sessionId: 's1' },
      { ts: '2026-01-01T11:00:00.000Z', event: 'Notification', sessionId: 's1' },
    ]
    // 12:00+02:00 is 10:00Z, earlier than 11:00Z
    expect(latestNotificationBySession(events).get('s1')).toBe('2026-01-01T11:00:00.000Z')
  })

  it('ignores unparseable timestamps', () => {
    const events: HookEvent[] = [
      { ts: 'not a date', event: 'Notification', sessionId: 's1' },
    ]
    expect(latestNotificationBySession(events).has('s1')).toBe(false)
  })
})
