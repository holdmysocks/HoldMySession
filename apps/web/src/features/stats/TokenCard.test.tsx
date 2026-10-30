import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TokenCard } from './TokenCard'
import { tokenBreakdown } from './token-breakdown'

const breakdown = tokenBreakdown({
  'claude-a': { inputTokens: 245_000, outputTokens: 68_400_000, cacheReadInputTokens: 30_400_000_000, cacheCreationInputTokens: 435_000_000, thinkingTokens: 27_100_000 },
})

describe('TokenCard', () => {
  it('shows only the total until the arrow is used', () => {
    render(<TokenCard breakdown={breakdown} />)
    expect(screen.getByText('30.9B')).toBeTruthy()
    expect(screen.queryByText('Reasoning')).toBeNull()
    expect(screen.queryByText('cache read')).toBeNull()
    expect(screen.getByRole('button', { name: /Total Tokens/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('opens the breakdown, and closes it again', () => {
    render(<TokenCard breakdown={breakdown} />)
    const toggle = screen.getByRole('button', { name: /Total Tokens/ })
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    for (const label of ['Input (prompt)', 'new', 'cache read', 'cache write', 'Output (answer)', 'Reasoning']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
    expect(screen.getByText('27.1M')).toBeTruthy()
    fireEvent.click(toggle)
    expect(screen.queryByText('Reasoning')).toBeNull()
  })
})
