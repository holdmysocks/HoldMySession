import { describe, expect, it } from 'vitest'
import { nodeIdleView, shouldApplyPolicy, type IdleChoice } from './idle-policy'

const at = (iso: string, over: Partial<IdleChoice> = {}): IdleChoice => ({ quit: true, minutes: 30, updatedAt: iso, ...over })

describe('shouldApplyPolicy', () => {
  it('takes a newer choice from the master that differs', () => {
    expect(shouldApplyPolicy(at('2026-01-01T10:00:00Z'), at('2026-01-01T11:00:00Z', { quit: false }))).toBe(true)
    expect(shouldApplyPolicy(at('2026-01-01T10:00:00Z'), at('2026-01-01T11:00:00Z', { minutes: 60 }))).toBe(true)
  })
  it('does not undo a later change made on the node', () => {
    expect(shouldApplyPolicy(at('2026-01-01T12:00:00Z', { quit: false }), at('2026-01-01T11:00:00Z'))).toBe(false)
  })
  it('does nothing when they already agree, or the master has chosen nothing', () => {
    expect(shouldApplyPolicy(at('2026-01-01T10:00:00Z'), at('2026-01-01T11:00:00Z'))).toBe(false)
    expect(shouldApplyPolicy(at('2026-01-01T10:00:00Z'), undefined)).toBe(false)
    expect(shouldApplyPolicy(at('2026-01-01T10:00:00Z'), null)).toBe(false)
  })
  it('a node that never changed it takes the master\'s choice', () => {
    expect(shouldApplyPolicy({ quit: true, minutes: 30 }, at('2026-01-01T11:00:00Z', { quit: false }))).toBe(true)
  })
  it('ignores a choice with no time, since nothing says it is newer', () => {
    expect(shouldApplyPolicy(at('2026-01-01T10:00:00Z'), { quit: false, minutes: 30 })).toBe(false)
  })
})

describe('nodeIdleView', () => {
  it('shows what the node reported when the master chose nothing', () => {
    expect(nodeIdleView(at('2026-01-01T10:00:00Z', { quit: false }), undefined)).toEqual({ quit: false, minutes: 30, pending: false })
  })
  it('shows the master\'s later choice as pending until the node has taken it', () => {
    expect(nodeIdleView(at('2026-01-01T10:00:00Z'), at('2026-01-01T11:00:00Z', { quit: false }))).toEqual({ quit: false, minutes: 30, pending: true })
  })
  it('is not pending once the node reports the same', () => {
    expect(nodeIdleView(at('2026-01-01T12:00:00Z', { quit: false }), at('2026-01-01T11:00:00Z', { quit: false }))).toEqual({ quit: false, minutes: 30, pending: false })
  })
  it('shows the node\'s later change over an old choice at the master', () => {
    expect(nodeIdleView(at('2026-01-01T12:00:00Z', { minutes: 120 }), at('2026-01-01T11:00:00Z'))).toEqual({ quit: true, minutes: 120, pending: false })
  })
  it('shows the master\'s choice, pending, for a node that has reported nothing', () => {
    expect(nodeIdleView(null, at('2026-01-01T11:00:00Z'))).toEqual({ quit: true, minutes: 30, pending: true })
  })
  it('is null with nothing from either', () => {
    expect(nodeIdleView(null, undefined)).toBeNull()
  })
})
