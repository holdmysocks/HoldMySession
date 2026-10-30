import { describe, it, expect } from 'vitest'
import { expiredSubagentsLabel, kindLabel, shortModelName, statusLabel, truncateLabel } from './format-node'

describe('expiredSubagentsLabel', () => {
  it('uses the singular for one and the plural otherwise', () => {
    expect(expiredSubagentsLabel(1)).toBe('1 expired subagent hidden')
    expect(expiredSubagentsLabel(0)).toBe('0 expired subagents hidden')
    expect(expiredSubagentsLabel(3)).toBe('3 expired subagents hidden')
  })
})

describe('statusLabel', () => {
  it('labels every status', () => {
    expect(statusLabel('needs-you')).toBe('Needs you')
    expect(statusLabel('active')).toBe('Active')
    expect(statusLabel('completed')).toBe('Completed')
    expect(statusLabel('idle')).toBe('Idle')
    expect(statusLabel('running')).toBe('Running')
  })
})

describe('kindLabel', () => {
  it('distinguishes sessions, forks and subagents', () => {
    expect(kindLabel({ kind: 'session', parentRelation: null })).toBe('Session')
    expect(kindLabel({ kind: 'session', parentRelation: 'fork' })).toBe('Forked session')
    expect(kindLabel({ kind: 'session', parentRelation: 'sub-session' })).toBe('Sub-session')
    expect(kindLabel({ kind: 'subagent', parentRelation: null })).toBe('Subagent')
  })
})

describe('shortModelName', () => {
  it('strips the claude- prefix and the date suffix', () => {
    expect(shortModelName('claude-example-2-20250101')).toBe('example-2')
  })

  it('keeps names without a date suffix', () => {
    expect(shortModelName('claude-example-1')).toBe('example-1')
  })

  it('returns null for a missing model', () => {
    expect(shortModelName(null)).toBeNull()
  })
})

describe('truncateLabel', () => {
  it('returns short text unchanged', () => {
    expect(truncateLabel('abc', 10)).toBe('abc')
  })

  it('cuts long text to max characters including the ellipsis', () => {
    const out = truncateLabel('abcdefghijkl', 6)
    expect(out).toBe('abcde…')
    expect(out).toHaveLength(6)
  })

  it('returns text of exactly max length unchanged', () => {
    expect(truncateLabel('abcdef', 6)).toBe('abcdef')
  })
})
