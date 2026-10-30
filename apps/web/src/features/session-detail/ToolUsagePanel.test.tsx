import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ToolUsagePanel } from './ToolUsagePanel'

describe('ToolUsagePanel', () => {
  const frequency = { Bash: 2171, Read: 100, Edit: 91, Grep: 4 }

  it('lists tools by use, with each count in its own column after the bar', () => {
    const { container } = render(<ToolUsagePanel toolFrequency={frequency} />)
    const rows = Array.from(container.querySelectorAll('li'))
    expect(rows.map((row) => row.textContent)).toEqual(['Bash2171', 'Read100', 'Edit91', 'Grep4'])
    for (const row of rows) {
      // Name, bar track and count are siblings in one centred row, so a count sits level with its bar.
      expect(row.className).toContain('items-center')
      expect(row.children).toHaveLength(3)
      expect(row.querySelector('[data-bar]')).not.toBeNull()
      expect(row.lastElementChild!.className).toContain('text-right')
    }
  })

  it('sizes each bar against the most used tool', () => {
    const { container } = render(<ToolUsagePanel toolFrequency={frequency} />)
    const widths = Array.from(container.querySelectorAll<HTMLElement>('[data-bar]')).map((bar) => bar.style.width)
    expect(widths[0]).toContain('100%')
    expect(widths[1]).toContain(`${(100 / 2171) * 100}%`)
  })

  it('keeps a rarely used tool visible with a minimum width', () => {
    const { container } = render(<ToolUsagePanel toolFrequency={{ Bash: 100000, Grep: 1 }} />)
    const bars = Array.from(container.querySelectorAll<HTMLElement>('[data-bar]'))
    expect(bars[1].style.minWidth).toBe('3px')
  })

  it('shows the totals, and says so when nothing was used', () => {
    const { rerender } = render(<ToolUsagePanel toolFrequency={frequency} />)
    expect(screen.getByText('4 tools, 2366 calls')).toBeTruthy()
    rerender(<ToolUsagePanel toolFrequency={{}} />)
    expect(screen.getByText('No tools used')).toBeTruthy()
  })
})
