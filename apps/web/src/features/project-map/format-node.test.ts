import { describe, it, expect } from 'vitest'
import { kindLabel, shortModelName, statusLabel, truncateLabel } from './format-node'

describe('statusLabel', () => {
  it('labels every status', () => {
    expect(statusLabel('active')).toBe('Active')
    expect(statusLabel('idle')).toBe('Idle')
    expect(statusLabel('done')).toBe('Done')
    expect(statusLabel('unknown')).toBe('Unknown')
  })
})

describe('kindLabel', () => {
  it('distinguishes sessions from subagents', () => {
    expect(kindLabel({ kind: 'session' })).toBe('Session')
    expect(kindLabel({ kind: 'subagent' })).toBe('Subagent')
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
