import { describe, it, expect } from 'vitest'
import type { SessionDetail, SessionSummary, TokenUsage } from '@/lib/parsers/types'
import { openHistoryDb } from '@/lib/history/history-db'
import { ingestSessions } from '@/lib/history/ingest'
import { acceptPush } from './receive'
import { selfMachineId } from './machines'
import { includesSelf, remoteSessions } from './scope'
import { aggregateProjectAnalytics } from '@/features/project-analytics/project-analytics.api'

const usage = (o: Partial<TokenUsage>): TokenUsage => ({ inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, ...o })
const at = (d: number) => new Date(2026, 2, d, 12).toISOString()
const summary = (id: string) =>
  ({ sessionId: id, projectKey: 'k', projectPath: '/w/app', projectName: 'app', projectDisplayName: 'App', sessionName: id, cwd: '/w/app',
     startedAt: at(1), lastActiveAt: at(2), durationMs: 1000, messageCount: 4, toolCallCount: 1 }) as SessionSummary
const detail = (out: number) => ({ turns: [], tokensByModel: { m: usage({ outputTokens: out }) }, toolFrequency: {} }) as unknown as SessionDetail

function masterWithNodes() {
  const master = openHistoryDb(':memory:')
  ingestSessions(master, [{ summary: summary('mine'), detail: detail(5) }])
  const push = (machineId: string, name: string, id: string, out: number) =>
    acceptPush(master, {
      machine: { machineId, name, nameUpdatedAt: at(1), appVersion: '1', schemaVersion: 8 },
      sessions: [{
        session_key: `k:${id}`, session_id: id, project_key: 'k', project_path: '/w/app', project_display_name: 'App', session_name: id,
        started_at: at(1), last_active_at: at(3), duration_ms: 2000, message_count: 8, tool_call_count: 2, on_disk: 1, first_seen_at: at(1),
        cwd: '/w/app', project_name: 'app',
        usage: [{ day: '2026-03-02', model: 'm', input_tokens: 0, output_tokens: out, thinking_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }], activity: [],
      }],
    })
  push('node-aaaaaaaa', 'Laptop', 'a1', 100)
  push('node-bbbbbbbb', 'Desk', 'b1', 200)
  return master
}

describe('remoteSessions', () => {
  it('lists other machines\' sessions shaped like local ones, with their machine and output tokens', () => {
    const master = masterWithNodes()
    const all = remoteSessions(master)
    expect(all.map((s) => s.machineName).sort()).toEqual(['Desk', 'Laptop'])
    expect(all.find((s) => s.sessionId === 'a1')).toMatchObject({ outputTokens: 100, isActive: false, filePath: '', projectDisplayName: 'App', messageCount: 8 })
  })

  it('narrows to one machine, and never includes this machine\'s own sessions', () => {
    const master = masterWithNodes()
    expect(remoteSessions(master, 'node-aaaaaaaa').map((s) => s.sessionId)).toEqual(['a1'])
    expect(remoteSessions(master, selfMachineId(master))).toEqual([])
    expect(remoteSessions(master).some((s) => s.sessionId === 'mine')).toBe(false)
  })

  it('works with the project totals, so a project spans machines', () => {
    const master = masterWithNodes()
    const result = aggregateProjectAnalytics(remoteSessions(master))
    expect(result.projects).toHaveLength(1)
    expect(result.projects[0]).toMatchObject({ displayName: 'App', totalSessions: 2, outputTokens: 300 })
  })
})

describe('includesSelf', () => {
  it('is true for all machines and for this one, false for another', () => {
    const master = masterWithNodes()
    expect(includesSelf(master)).toBe(true)
    expect(includesSelf(master, selfMachineId(master))).toBe(true)
    expect(includesSelf(master, 'node-aaaaaaaa')).toBe(false)
  })
})
