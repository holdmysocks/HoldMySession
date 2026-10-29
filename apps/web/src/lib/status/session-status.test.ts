import { describe, it, expect } from 'vitest'
import { deriveSessionStatus, COMPLETED_WINDOW_MS, type SessionStatusInput } from './session-status'

const LAST_WRITE = '2026-01-01T11:00:00.000Z'
const LAST_WRITE_MS = Date.parse(LAST_WRITE)

function input(overrides: Partial<SessionStatusInput> = {}): SessionStatusInput {
  return {
    isActive: false,
    lastActiveAt: LAST_WRITE,
    lastStopReason: null,
    lastNotificationAt: null,
    hasOpenQuestion: false,
    ...overrides,
  }
}

describe('COMPLETED_WINDOW_MS', () => {
  it('is 1 hour', () => {
    expect(COMPLETED_WINDOW_MS).toBe(3_600_000)
  })
})

describe('deriveSessionStatus', () => {
  describe('needs-you', () => {
    it('applies to an active session with an open question', () => {
      expect(deriveSessionStatus(input({ isActive: true, hasOpenQuestion: true }), LAST_WRITE_MS)).toBe('needs-you')
    })

    it('applies to an active session with a Notification newer than the last write', () => {
      expect(
        deriveSessionStatus(
          input({ isActive: true, lastNotificationAt: '2026-01-01T11:00:30.000Z' }),
          LAST_WRITE_MS,
        ),
      ).toBe('needs-you')
    })

    it('does not apply to a Notification older than the last write', () => {
      expect(
        deriveSessionStatus(
          input({ isActive: true, lastNotificationAt: '2026-01-01T10:59:00.000Z' }),
          LAST_WRITE_MS,
        ),
      ).toBe('active')
    })

    it('compares the Notification and the last write as instants', () => {
      // 12:00+01:00 is 11:00Z, the same instant as the last write, so it is not newer.
      expect(
        deriveSessionStatus(
          input({ isActive: true, lastNotificationAt: '2026-01-01T12:00:00+01:00' }),
          LAST_WRITE_MS,
        ),
      ).toBe('active')
    })

    it('does not apply to an idle session with an open question (abandoned)', () => {
      expect(
        deriveSessionStatus(
          input({ isActive: false, hasOpenQuestion: true, lastStopReason: 'tool_use' }),
          LAST_WRITE_MS,
        ),
      ).toBe('idle')
    })

    it('does not apply to an idle session with a newer Notification', () => {
      expect(
        deriveSessionStatus(
          input({ isActive: false, lastNotificationAt: '2026-01-01T11:00:30.000Z' }),
          LAST_WRITE_MS,
        ),
      ).toBe('idle')
    })
  })

  describe('active', () => {
    it('applies to an active session with no question and no newer Notification', () => {
      expect(deriveSessionStatus(input({ isActive: true }), LAST_WRITE_MS)).toBe('active')
    })
  })

  describe('completed', () => {
    it('applies to an inactive session whose last stop was end_turn, within the 1-hour window', () => {
      const now = LAST_WRITE_MS + 60_000
      expect(deriveSessionStatus(input({ lastStopReason: 'end_turn' }), now)).toBe('completed')
    })

    it('applies 59 minutes after the last write', () => {
      const now = LAST_WRITE_MS + 59 * 60_000
      expect(deriveSessionStatus(input({ lastStopReason: 'end_turn' }), now)).toBe('completed')
    })

    it('still applies exactly at the 1-hour boundary', () => {
      const now = LAST_WRITE_MS + COMPLETED_WINDOW_MS
      expect(deriveSessionStatus(input({ lastStopReason: 'end_turn' }), now)).toBe('completed')
    })

    it('becomes idle one millisecond after the 1-hour window', () => {
      const now = LAST_WRITE_MS + COMPLETED_WINDOW_MS + 1
      expect(deriveSessionStatus(input({ lastStopReason: 'end_turn' }), now)).toBe('idle')
    })

    it('does not apply when the last stop was not end_turn', () => {
      expect(deriveSessionStatus(input({ lastStopReason: 'tool_use' }), LAST_WRITE_MS)).toBe('idle')
    })

    it('does not apply when the stop reason is missing', () => {
      expect(deriveSessionStatus(input({ lastStopReason: null }), LAST_WRITE_MS)).toBe('idle')
    })
  })

  describe('idle', () => {
    it('is the fallback for an inactive session that is not completed', () => {
      expect(deriveSessionStatus(input(), LAST_WRITE_MS)).toBe('idle')
    })

    it('is used when the last write time cannot be parsed', () => {
      expect(
        deriveSessionStatus(input({ lastActiveAt: 'not a date', lastStopReason: 'end_turn' }), LAST_WRITE_MS),
      ).toBe('idle')
    })
  })

  describe('priority', () => {
    it('needs-you beats active', () => {
      expect(
        deriveSessionStatus(input({ isActive: true, hasOpenQuestion: true, lastStopReason: 'end_turn' }), LAST_WRITE_MS),
      ).toBe('needs-you')
    })

    it('active beats completed, since an active session is never completed', () => {
      expect(deriveSessionStatus(input({ isActive: true, lastStopReason: 'end_turn' }), LAST_WRITE_MS)).toBe('active')
    })
  })
})
