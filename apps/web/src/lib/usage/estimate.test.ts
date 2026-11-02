import { describe, expect, it } from 'vitest'
import { FIVE_HOUR_MS } from './limits'
import { blocksOf, burnBySession, currentBlock, impliedLimit, medianLimit, totalsSince, type UsageEvent } from './estimate'

const H = 3_600_000
const T0 = Date.parse('2026-11-02T08:00:00Z')
const ev = (hours: number, tokens: number, session = 's1', usd = tokens / 1000): UsageEvent => ({ time: T0 + hours * H, session, tokens, usd })

describe('blocksOf', () => {
  it('puts answers within five hours of the first into one block', () => {
    const blocks = blocksOf([ev(0, 100), ev(1, 50), ev(4.9, 25)])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ start: T0, end: T0 + FIVE_HOUR_MS, tokens: 175, events: 3 })
  })
  it('starts a new block with the first answer after the last one ended', () => {
    const blocks = blocksOf([ev(0, 10), ev(5, 20), ev(7, 30)])
    expect(blocks.map((b) => [b.start - T0, b.tokens])).toEqual([[0, 10], [5 * H, 50]])
  })
  it('does not depend on the order given', () => {
    expect(blocksOf([ev(7, 30), ev(0, 10), ev(5, 20)])).toEqual(blocksOf([ev(0, 10), ev(5, 20), ev(7, 30)]))
  })
  it('is empty with no events', () => expect(blocksOf([])).toEqual([]))
})

describe('currentBlock', () => {
  it('is the block running now', () => {
    expect(currentBlock([ev(0, 10), ev(1, 5)], T0 + 2 * H)).toMatchObject({ tokens: 15 })
  })
  it('is null once the last block has ended', () => {
    expect(currentBlock([ev(0, 10)], T0 + 5 * H)).toBeNull()
  })
  it('ignores answers from the future', () => {
    expect(currentBlock([ev(3, 10)], T0)).toBeNull()
  })
})

describe('totalsSince', () => {
  it('adds the last seven days by default', () => {
    const now = T0 + 10 * 24 * H
    const t = totalsSince([ev(0, 100), ev(8 * 24, 40), ev(9 * 24, 2)], now)
    expect(t).toEqual({ tokens: 42, usd: 0.042, events: 2 })
  })
})

describe('burnBySession', () => {
  const events = [ev(0, 600, 'a'), ev(1, 100, 'b'), ev(2, 300, 'a'), ev(3, 100, 'c')]
  it('ranks sessions by tokens with their share', () => {
    const rows = burnBySession(events, T0, T0 + 5 * H)
    expect(rows.map((r) => r.session)).toEqual(['a', 'c', 'b']) // b and c tie, the later one first
    expect(rows[0]).toMatchObject({ tokens: 900, lastAt: T0 + 2 * H })
    expect(rows[0].share).toBeCloseTo(900 / 1100, 5)
  })
  it('limits the list and respects the period', () => {
    expect(burnBySession(events, T0, T0 + 5 * H, 1)).toHaveLength(1)
    expect(burnBySession(events, T0 + 2.5 * H, T0 + 5 * H).map((r) => r.session)).toEqual(['c'])
  })
  it('is empty with nothing in the period', () => {
    expect(burnBySession(events, T0 + 20 * H, T0 + 21 * H)).toEqual([])
  })
})

describe('impliedLimit and medianLimit', () => {
  it('works out the limit from a real percentage', () => {
    expect(impliedLimit(40, 2_000_000)).toBe(5_000_000)
  })
  it('says nothing when too little is used or there is nothing counted', () => {
    expect(impliedLimit(2, 1_000_000)).toBeNull()
    expect(impliedLimit(50, 0)).toBeNull()
  })
  it('takes the middle guess', () => {
    expect(medianLimit([])).toBeNull()
    expect(medianLimit([5])).toBe(5)
    expect(medianLimit([9, 1, 5])).toBe(5)
    expect(medianLimit([1, 3, 5, 100])).toBe(4)
  })
})
