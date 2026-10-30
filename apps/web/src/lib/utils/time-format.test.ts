import { describe, it, expect, afterEach } from 'vitest'
import { format } from 'date-fns'
import { clockPattern, getClockFormat, setClockFormat, subscribeClockFormat } from './time-format'

describe('clockPattern', () => {
  const at = new Date(2026, 2, 5, 14, 5, 9)
  it('leaves a 24-hour pattern alone', () => {
    expect(format(at, clockPattern('HH:mm:ss', '24h'))).toBe('14:05:09')
  })
  it('turns the time part into 12-hour with AM or PM, and keeps the date part', () => {
    expect(format(at, clockPattern('HH:mm:ss', '12h'))).toBe('2:05:09 PM')
    expect(format(at, clockPattern('HH:mm', '12h'))).toBe('2:05 PM')
    expect(format(at, clockPattern('d MMM HH:mm', '12h'))).toBe('5 Mar 2:05 PM')
    expect(format(new Date(2026, 2, 5, 0, 5), clockPattern('HH:mm', '12h'))).toBe('12:05 AM')
  })
  it('leaves a pattern with no time alone', () => {
    expect(clockPattern('EEE d MMM', '12h')).toBe('EEE d MMM')
  })
})

describe('the stored choice', () => {
  afterEach(() => setClockFormat('24h'))
  it('is used when no format is given, and tells listeners when it changes', () => {
    let calls = 0
    const stop = subscribeClockFormat(() => calls++)
    setClockFormat('12h')
    expect(getClockFormat()).toBe('12h')
    expect(clockPattern('HH:mm')).toBe('h:mm a')
    expect(calls).toBe(1)
    stop()
    setClockFormat('24h')
    expect(calls).toBe(1)
  })
})
