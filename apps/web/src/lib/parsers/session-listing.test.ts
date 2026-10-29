import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parseDetail, parseSummary } from './session-parser'
import { groupMapProjects, selectMapSessions } from '@/features/project-map/project-map.api'
import { paginateAndFilterSessions } from '@/features/sessions/sessions.api'
import type { SessionSummary } from './types'

const T0 = Date.parse('2026-01-01T10:00:00.000Z')
const at = (i: number) => new Date(T0 + i * 1000).toISOString()

function userLine(i: number, text: string): string {
  return JSON.stringify({
    type: 'user',
    uuid: `u${i}`,
    timestamp: at(i),
    cwd: '/work/app',
    gitBranch: 'main',
    message: { role: 'user', content: [{ type: 'text', text }] },
  })
}

function assistantLine(i: number, stopReason: string | null): string {
  return JSON.stringify({
    type: 'assistant',
    uuid: `a${i}`,
    timestamp: at(i),
    requestId: `req-${i}`,
    message: {
      model: 'claude-example-1',
      role: 'assistant',
      content: [{ type: 'text', text: `reply ${i}` }],
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      stop_reason: stopReason,
    },
  })
}

function queueLine(i: number): string {
  return JSON.stringify({ type: 'queue-operation', operation: 'enqueue', timestamp: at(i), content: 'queued while busy' })
}

/**
 * An interactive session that contains queue-operation lines at the start, the middle and
 * the end. Before the fix, the head or tail hit made the session look non-interactive.
 */
function interactiveSessionLines(): string[] {
  const lines: string[] = [queueLine(0), userLine(1, 'Fix the flaky login test')]
  for (let i = 2; i < 60; i++) {
    if (i === 30) lines.push(queueLine(i))
    else if (i % 2 === 0) lines.push(assistantLine(i, i === 58 ? 'end_turn' : 'tool_use'))
    else lines.push(userLine(i, `follow-up ${i}`))
  }
  lines.push(queueLine(60))
  return lines
}

describe('queue-operation lines do not hide a session', () => {
  let dir: string
  let filePath: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-listing-'))
    filePath = path.join(dir, 'interactive.jsonl')
    fs.writeFileSync(filePath, interactiveSessionLines().join('\n') + '\n')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('parseSummary returns the session with its name and last stop reason', async () => {
    const size = fs.statSync(filePath).size
    const summary = await parseSummary(filePath, 'interactive', '/work/app', 'app', 'My App', size)
    expect(summary).not.toBeNull()
    expect(summary!.sessionName).toBe('Fix the flaky login test')
    expect(summary!.lastStopReason).toBe('end_turn')
    expect(summary!.projectDisplayName).toBe('My App')
  })

  it('parseDetail returns the session with its name', async () => {
    const detail = await parseDetail(filePath, 'interactive', '/work/app', 'app')
    expect(detail.sessionName).toBe('Fix the flaky login test')
  })

  it('appears in the map and in the sessions list', async () => {
    const size = fs.statSync(filePath).size
    const summary = (await parseSummary(filePath, 'interactive', '/work/app', 'app', 'My App', size))!
    const other: SessionSummary = { ...summary, sessionId: 'other', lastActiveAt: at(5) }

    const sessions = [summary, other]
    expect(groupMapProjects(sessions)).toEqual([
      expect.objectContaining({ projectPath: '/work/app', sessionCount: 2, projectDisplayName: 'My App' }),
    ])
    expect(selectMapSessions(sessions, '/work/app').map((s) => s.sessionId)).toEqual(['interactive', 'other'])

    const page = await paginateAndFilterSessions(sessions, {
      page: 1, pageSize: 10, search: '', status: 'all', project: '', sort: 'lastActive', sortDir: 'desc',
    })
    expect(page.totalCount).toBe(2)
    expect(page.sessions.map((s) => s.sessionId)).toContain('interactive')
  })
})

describe('parseSummary name and stop reason details', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-names-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  function write(name: string, lines: string[]): { file: string; size: number } {
    const file = path.join(dir, `${name}.jsonl`)
    fs.writeFileSync(file, lines.join('\n') + '\n')
    return { file, size: fs.statSync(file).size }
  }

  it('prefers the summary line Claude Code writes over the first prompt', async () => {
    const { file, size } = write('titled', [
      JSON.stringify({ type: 'summary', summary: 'Auto title for the session', leafUuid: 'x' }),
      userLine(1, 'The first prompt'),
      assistantLine(2, 'end_turn'),
    ])
    const summary = (await parseSummary(file, 'titled', '/w', 'w', 'W', size))!
    expect(summary.sessionName).toBe('Auto title for the session')
  })

  it('reports a null stop reason when the newest assistant line has none', async () => {
    const { file, size } = write('streaming', [
      userLine(1, 'hi'),
      assistantLine(2, 'end_turn'),
      assistantLine(3, null),
    ])
    const summary = (await parseSummary(file, 'streaming', '/w', 'w', 'W', size))!
    expect(summary.lastStopReason).toBeNull()
  })

  it('does not take a stop reason from the head of a long file', async () => {
    // The head ends a turn, then the tail is only progress lines (a long subagent run).
    // The head's end_turn is stale, so the session must not look completed.
    const progress = Array.from({ length: 40 }, (_, i) =>
      JSON.stringify({ type: 'progress', timestamp: at(3 + i), data: {} }),
    )
    const { file, size } = write('long-run', [userLine(1, 'start'), assistantLine(2, 'end_turn'), ...progress])
    const summary = (await parseSummary(file, 'long-run', '/w', 'w', 'W', size))!
    expect(summary.lastStopReason).toBeNull()
  })

  it('has no name when there is no summary line and no user text', async () => {
    const { file, size } = write('empty-prompt', [assistantLine(1, 'end_turn')])
    const summary = (await parseSummary(file, 'empty-prompt', '/w', 'w', 'W', size))!
    expect(summary.sessionName).toBeNull()
  })
})
