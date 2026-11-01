import { describe, it, expect } from 'vitest'
import { describeWaiting, WAITING_TAG } from './waiting'

describe('describeWaiting', () => {
  it('puts an open question first, in its own words', () => {
    expect(describeWaiting({ question: 'Which environment should it run against?', notification: { message: 'Claude needs your permission to use Bash', type: 'permission_prompt' } })).toEqual({
      kind: 'question',
      text: 'Which environment should it run against?',
    })
  })

  it('reads a permission message as what the session wants to run', () => {
    expect(describeWaiting({ notification: { message: 'Claude needs your permission to use Bash', type: 'permission_prompt' } })).toEqual({ kind: 'permission', text: 'Wants to run Bash' })
    expect(describeWaiting({ notification: { message: 'Claude needs your permission to use Edit.', type: null } }).text).toBe('Wants to run Edit')
  })

  it('knows a permission prompt even when the message is unusual', () => {
    expect(describeWaiting({ notification: { message: 'Approve this?', type: 'permission_prompt' } })).toEqual({ kind: 'permission', text: 'Approve this?' })
  })

  it('says an idle session is waiting for the next message', () => {
    expect(describeWaiting({ notification: { message: 'Claude is waiting for your input', type: 'idle_prompt' } }).kind).toBe('idle')
  })

  it('tells a plan apart, and falls back to the message or a plain line', () => {
    expect(describeWaiting({ notification: { message: 'The plan is ready to approve', type: null } }).kind).toBe('plan')
    expect(describeWaiting({ notification: { message: 'Something else', type: null } })).toEqual({ kind: 'other', text: 'Something else' })
    expect(describeWaiting({})).toEqual({ kind: 'other', text: 'Waiting on you' })
  })

  it('cuts a very long message', () => {
    expect(describeWaiting({ question: 'x'.repeat(500) }).text.length).toBeLessThanOrEqual(140)
  })

  it('has a tag for every kind', () => {
    expect(Object.keys(WAITING_TAG).sort()).toEqual(['idle', 'other', 'permission', 'plan', 'question'])
  })
})

import { waitingSentence } from './waiting'
describe('waitingSentence', () => {
  it('reads as a sentence about the session', () => {
    expect(waitingSentence('Upgrade dependencies', { kind: 'permission', text: 'Wants to run Bash' })).toBe('Upgrade dependencies wants to run Bash')
    expect(waitingSentence('Migrate', { kind: 'question', text: 'Which environment?' })).toBe('Migrate asks: Which environment?')
    expect(waitingSentence('Notes', { kind: 'plan', text: 'Plan is ready' })).toBe('Notes: Plan is ready')
  })
})
