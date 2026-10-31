import { describe, it, expect } from 'vitest'
import { STATUS_BORDER, STATUS_PULSE } from './session-status-style'
import type { SessionStatus } from '@/lib/status/session-status'

const STATUSES: SessionStatus[] = ['needs-you', 'active', 'completed', 'idle']

describe('STATUS_BORDER', () => {
  it('gives each status its border colour', () => {
    expect(STATUS_BORDER).toEqual({
      'needs-you': 'border-yellow-400',
      active: 'border-green-500',
      completed: 'border-indigo-400',
      idle: 'border-gray-600',
    })
  })

  it('has a colour for every status, and no border width (the card sets border-2)', () => {
    for (const status of STATUSES) {
      expect(STATUS_BORDER[status]).toMatch(/^border-[a-z]+-\d+$/)
    }
  })
})

describe('STATUS_PULSE', () => {
  it('pulses needs-you and active only', () => {
    expect(STATUS_PULSE['needs-you']).toBe('status-pulse-needs-you')
    expect(STATUS_PULSE.active).toBe('status-pulse-active')
  })

  it('does not pulse completed or idle', () => {
    expect(STATUS_PULSE.completed).toBe('')
    expect(STATUS_PULSE.idle).toBe('')
  })
})
