import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const shared = vi.hoisted(() => ({ root: '' }))

vi.mock('@/lib/utils/claude-path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils/claude-path')>()
  return {
    ...actual,
    getProjectsDir: () => path.join(shared.root, 'projects'),
    getProjectsDirFor: () => path.join(shared.root, 'projects'),
    getDataSources: async () => [],
  }
})

import { scanAllSessionsWithPaths } from './session-scanner'
import { clearProjectCwdCache } from './project-scanner'
import { clearProjectDisplayNameCache } from './project-display-name'
import { parseFullScan, parseSummary } from '../parsers/session-parser'

const T0 = Date.parse('2026-01-01T10:00:00.000Z')
const at = (i: number) => new Date(T0 + i * 1000).toISOString()

interface Opts {
  cwd: string
  forkedFrom?: string
  sessionId: string
}

function userFirst(i: number, text: string, o: Opts): string {
  const record: Record<string, unknown> = {
    type: 'user',
    uuid: `u-${o.sessionId}-${i}`,
    sessionId: o.sessionId,
    timestamp: at(i),
    cwd: o.cwd,
    gitBranch: 'main',
    isSidechain: false,
    message: { role: 'user', content: text },
  }
  if (o.forkedFrom) record.forkedFrom = { sessionId: o.forkedFrom, messageUuid: `u-${o.forkedFrom}-0` }
  return JSON.stringify(record)
}

function assistant(i: number, o: Opts): string {
  return JSON.stringify({
    type: 'assistant',
    uuid: `a-${o.sessionId}-${i}`,
    sessionId: o.sessionId,
    timestamp: at(i),
    cwd: o.cwd,
    requestId: `req-${o.sessionId}-${i}`,
    message: {
      model: 'claude-example-1',
      role: 'assistant',
      content: [{ type: 'text', text: `reply ${i}` }],
      usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      stop_reason: i === 99 ? 'end_turn' : null,
    },
  })
}

function customTitle(text: string, sessionId: string): string {
  return JSON.stringify({ type: 'custom-title', customTitle: text, sessionId })
}

/** A long session: a rename near the start, a later rename in the middle, and a last rename near the end. */
function longSession(o: Opts, lastName?: string): string[] {
  const lines: string[] = [userFirst(0, 'Plan the parser', o)]
  for (let i = 1; i < 100; i++) {
    if (i === 20) lines.push(customTitle('Early name', o.sessionId))
    if (i === 60) lines.push(customTitle('Middle rename', o.sessionId))
    lines.push(assistant(i, o))
  }
  if (lastName) lines.push(customTitle(lastName, o.sessionId))
  return lines
}

function writeSession(dirName: string, sessionId: string, lines: string[]) {
  const dir = path.join(shared.root, 'projects', dirName)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), lines.join('\n') + '\n')
}

describe('session identity from transcripts', () => {
  let work: string

  beforeEach(() => {
    shared.root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-identity-'))
    work = path.join(shared.root, 'work', 'mcla-folder')
    fs.mkdirSync(work, { recursive: true })
    fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'rusty-mcla' }))
    clearProjectCwdCache()
    clearProjectDisplayNameCache()
  })

  afterEach(() => {
    fs.rmSync(shared.root, { recursive: true, force: true })
  })

  it('names the project from package.json at the recorded cwd, under a directory name that does not match the folder', async () => {
    // The directory name says MCLA; the folder on disk is mcla-folder with package name rusty-mcla.
    writeSession('D--MCLA', 'root-1', longSession({ cwd: work, sessionId: 'root-1' }))

    const [session] = await scanAllSessionsWithPaths()
    expect(session.projectKey).toBe('D--MCLA')
    expect(session.projectPath).toBe(work)
    expect(session.projectName).toBe('mcla-folder')
    expect(session.projectDisplayName).toBe('rusty-mcla')
  })

  it('shows the newest custom-title even when it is in the middle of a long file', async () => {
    writeSession('-work', 'named-1', longSession({ cwd: work, sessionId: 'named-1' }))
    const [session] = await scanAllSessionsWithPaths()
    expect(session.sessionName).toBe('Middle rename')
  })

  it('prefers a custom-title at the very end over earlier ones', async () => {
    writeSession('-work', 'named-2', longSession({ cwd: work, sessionId: 'named-2' }, 'Final name'))
    const [session] = await scanAllSessionsWithPaths()
    expect(session.sessionName).toBe('Final name')
  })

  it('links a fork to its parent, and leaves a split-out session unlinked', async () => {
    writeSession('-work', 'parent-x', longSession({ cwd: work, sessionId: 'parent-x' }, 'Parent'))
    // A fork: its copied records carry forkedFrom and the new session id.
    writeSession('-work', 'fork-x', [
      userFirst(0, 'Plan the parser', { cwd: work, sessionId: 'fork-x', forkedFrom: 'parent-x' }),
      assistant(1, { cwd: work, sessionId: 'fork-x' }),
    ])
    // A session with no forkedFrom is not linked to anything, even if it looks similar.
    writeSession('-work', 'split-x', [userFirst(0, 'Plan the parser', { cwd: work, sessionId: 'split-x' })])

    const sessions = await scanAllSessionsWithPaths()
    const byId = Object.fromEntries(sessions.map((s) => [s.sessionId, s]))
    expect(byId['fork-x'].forkedFrom).toEqual({ sessionId: 'parent-x', messageUuid: 'u-parent-x-0' })
    expect(byId['parent-x'].forkedFrom).toBeNull()
    expect(byId['split-x'].forkedFrom).toBeNull()
  })

  it('does not treat a continuation (context ran out) as a fork', async () => {
    writeSession('-work', 'cont-x', [
      userFirst(
        0,
        'This session is being continued from a previous conversation that ran out of context.',
        { cwd: work, sessionId: 'cont-x' },
      ),
    ])
    const [session] = await scanAllSessionsWithPaths()
    expect(session.forkedFrom).toBeNull()
  })

  it('finds the fork link only in the first lines, and does not scan the rest of the file', async () => {
    const lines = Array.from({ length: 120 }, (_, i) => assistant(i + 1, { cwd: work, sessionId: 'late' }))
    lines.unshift(userFirst(0, 'hello', { cwd: work, sessionId: 'late' }))
    // A forkedFrom record after the head window must not count.
    lines.splice(80, 0, JSON.stringify({ type: 'user', forkedFrom: { sessionId: 'elsewhere' } }))
    const dir = path.join(shared.root, 'projects', '-work')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'late.jsonl'), lines.join('\n') + '\n')

    const [session] = await scanAllSessionsWithPaths()
    expect(session.forkedFrom).toBeNull()
  })

  it('reads the full-file scan: last custom-title and output tokens', async () => {
    const file = path.join(shared.root, 'scan.jsonl')
    fs.writeFileSync(file, longSession({ cwd: work, sessionId: 's' }).join('\n') + '\n')
    const result = await parseFullScan(file)
    expect(result.customTitle).toBe('Middle rename')
    expect(result.outputTokens).toBe(99 * 2)
  })

  it('parseSummary sets projectKey from the directory, and the cwd from the records', async () => {
    const dir = path.join(shared.root, 'projects', 'D--MCLA')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'k.jsonl')
    fs.writeFileSync(file, [userFirst(0, 'hi', { cwd: 'D:\\MCLA', sessionId: 'k' })].join('\n') + '\n')
    const summary = await parseSummary(file, 'k', 'D:\\MCLA', 'MCLA', 'MCLA', fs.statSync(file).size)
    expect(summary).not.toBeNull()
    expect(summary!.projectKey).toBe('D--MCLA')
    expect(summary!.cwd).toBe('D:\\MCLA')
  })
})
