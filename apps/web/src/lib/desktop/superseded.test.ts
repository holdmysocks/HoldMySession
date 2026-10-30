import { describe, it, expect } from 'vitest'
import { keepOneTranscriptPerSession } from './superseded'

const entry = (sessionId: string, lastActiveAt: string, desktopRecordId: string | null, isSuperseded = false) => ({
  sessionId,
  lastActiveAt,
  desktopRecordId,
  isSuperseded,
})

describe('keepOneTranscriptPerSession', () => {
  it('leaves a session alone when its current transcript is present', () => {
    const sessions = [
      entry('now', '2026-03-03', 'local_ui'),
      entry('old-1', '2026-03-01', 'local_ui', true),
      entry('old-2', '2026-03-02', 'local_ui', true),
    ]
    expect(keepOneTranscriptPerSession(sessions)).toBe(sessions)
  })

  it('shows the newest older transcript when the current one is not among the files', () => {
    const result = keepOneTranscriptPerSession([
      entry('old-1', '2026-03-01', 'local_ui', true),
      entry('old-3', '2026-03-05', 'local_ui', true),
      entry('old-2', '2026-03-02', 'local_ui', true),
    ])
    expect(result.map((s) => [s.sessionId, s.isSuperseded])).toEqual([
      ['old-1', true],
      ['old-3', false],
      ['old-2', true],
    ])
  })

  it('treats each desktop session separately, and ignores transcripts that have no record', () => {
    const result = keepOneTranscriptPerSession([
      entry('a-now', '2026-03-03', 'local_a'),
      entry('a-old', '2026-03-01', 'local_a', true),
      entry('b-old-1', '2026-03-01', 'local_b', true),
      entry('b-old-2', '2026-03-02', 'local_b', true),
      entry('terminal', '2026-03-04', null),
    ])
    const flags = Object.fromEntries(result.map((s) => [s.sessionId, s.isSuperseded]))
    expect(flags).toEqual({ 'a-now': false, 'a-old': true, 'b-old-1': true, 'b-old-2': false, terminal: false })
  })

  it('shows a lone older transcript whose record has no current one on disk', () => {
    expect(keepOneTranscriptPerSession([entry('old', '2026-03-01', 'local_x', true)])[0].isSuperseded).toBe(false)
  })

  it('does not change the input', () => {
    const sessions = [entry('old', '2026-03-01', 'local_x', true)]
    keepOneTranscriptPerSession(sessions)
    expect(sessions[0].isSuperseded).toBe(true)
  })
})
