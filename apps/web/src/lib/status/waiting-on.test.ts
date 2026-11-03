import { describe, expect, it } from 'vitest'
import { QUIET_BEFORE_WAITING_MS, isQuiet, waitingOnText } from './waiting-on'

describe('waitingOnText', () => {
  it('says nothing when nothing is running', () => {
    expect(waitingOnText({ agents: 0, tasks: 0, quiet: true })).toBeNull()
  })
  it('says what a quiet session waits on', () => {
    expect(waitingOnText({ agents: 2, tasks: 0, quiet: true })).toBe('Waiting on 2 agents')
    expect(waitingOnText({ agents: 1, tasks: 0, quiet: true })).toBe('Waiting on 1 agent')
    expect(waitingOnText({ agents: 0, tasks: 1, quiet: true })).toBe('Waiting on 1 background task')
    expect(waitingOnText({ agents: 0, tasks: 3, quiet: true })).toBe('Waiting on 3 background tasks')
    expect(waitingOnText({ agents: 2, tasks: 1, quiet: true })).toBe('Waiting on 2 agents and 1 background task')
  })
  it('says a busy session works with them', () => {
    expect(waitingOnText({ agents: 0, tasks: 2, quiet: false })).toBe('Working with 2 background tasks')
    expect(waitingOnText({ agents: 1, tasks: 1, quiet: false })).toBe('Working with 1 agent and 1 background task')
  })
  it('is shorter for a Map card', () => {
    expect(waitingOnText({ agents: 0, tasks: 1, quiet: true, compact: true })).toBe('Waiting on 1 task')
    expect(waitingOnText({ agents: 2, tasks: 3, quiet: true, compact: true })).toBe('Waiting on 2 agents, 3 tasks')
  })
})

describe('isQuiet', () => {
  const now = Date.parse('2026-01-01T12:00:00Z')
  it('is quiet after two minutes', () => {
    expect(isQuiet(new Date(now - QUIET_BEFORE_WAITING_MS - 1000).toISOString(), now)).toBe(true)
    expect(isQuiet(new Date(now - 60_000).toISOString(), now)).toBe(false)
  })
})
