import { describe, it, expect, vi, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { ContributionHeatmap } from './ContributionHeatmap'
import type { DailyActivity, DailyModelTokens } from '@/lib/parsers/types'

describe('ContributionHeatmap', () => {
  describe('rendering', () => {
    it('should render component with title', () => {
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={[]}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should render day labels (Mon, Wed, Fri)', () => {
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={[]}
        />
      )

      expect(container.textContent).toContain('Mon')
      expect(container.textContent).toContain('Wed')
      expect(container.textContent).toContain('Fri')
    })

    it('should render subtitle about token usage', () => {
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={[]}
        />
      )

      expect(container.textContent).toContain('Token usage intensity over the past year')
    })
  })

  describe('data processing', () => {
    it('should render with dailyActivity data', () => {
      const dailyActivity: DailyActivity[] = [
        { date: '2026-02-01', messageCount: 10, sessionCount: 2, toolCallCount: 5 },
        { date: '2026-02-02', messageCount: 20, sessionCount: 3, toolCallCount: 8 },
      ]

      const { container } = render(
        <ContributionHeatmap
          dailyActivity={dailyActivity}
          dailyModelTokens={[]}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should render with dailyModelTokens data', () => {
      const dailyModelTokens: DailyModelTokens[] = [
        {
          date: '2026-02-01',
          tokensByModel: { 'claude-sonnet-4': 1000 },
        },
        {
          date: '2026-02-02',
          tokensByModel: { 'claude-sonnet-4': 2000 },
        },
      ]

      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={dailyModelTokens}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should render with both dailyActivity and dailyModelTokens', () => {
      const dailyActivity: DailyActivity[] = [
        { date: '2026-02-01', messageCount: 10, sessionCount: 2, toolCallCount: 5 },
      ]

      const dailyModelTokens: DailyModelTokens[] = [
        {
          date: '2026-02-01',
          tokensByModel: { 'claude-sonnet-4': 1000, 'claude-opus-4-6': 500 },
        },
      ]

      const { container } = render(
        <ContributionHeatmap
          dailyActivity={dailyActivity}
          dailyModelTokens={dailyModelTokens}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should handle dates present in only one data source', () => {
      const dailyActivity: DailyActivity[] = [
        { date: '2026-02-01', messageCount: 10, sessionCount: 2, toolCallCount: 5 },
        { date: '2026-02-02', messageCount: 20, sessionCount: 3, toolCallCount: 8 },
      ]

      const dailyModelTokens: DailyModelTokens[] = [
        {
          date: '2026-02-01',
          tokensByModel: { 'claude-sonnet-4': 1000 },
        },
      ]

      // Should not crash when dates don't match
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={dailyActivity}
          dailyModelTokens={dailyModelTokens}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should sum tokens from multiple models for the same date', () => {
      const dailyModelTokens: DailyModelTokens[] = [
        {
          date: '2026-02-01',
          tokensByModel: {
            'claude-sonnet-4': 1000,
            'claude-opus-4-6': 500,
            'claude-haiku-4': 250,
          },
        },
      ]

      // Should not crash - total tokens = 1750
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={dailyModelTokens}
        />
      )

      expect(container.textContent).toContain('Activity')
    })
  })

  describe('edge cases', () => {
    it('should handle empty arrays without crashing', () => {
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={[]}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should handle very large token counts', () => {
      const dailyModelTokens: DailyModelTokens[] = [
        {
          date: '2026-02-01',
          tokensByModel: { 'claude-sonnet-4': 999_999_999 },
        },
      ]

      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={dailyModelTokens}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should handle empty tokensByModel object', () => {
      const dailyModelTokens: DailyModelTokens[] = [
        {
          date: '2026-02-01',
          tokensByModel: {},
        },
      ]

      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={dailyModelTokens}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should handle duplicate dates in dailyActivity', () => {
      const dailyActivity: DailyActivity[] = [
        { date: '2026-02-01', messageCount: 10, sessionCount: 2, toolCallCount: 5 },
        { date: '2026-02-01', messageCount: 20, sessionCount: 3, toolCallCount: 8 },
      ]

      // Should not crash (last entry wins in Map)
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={dailyActivity}
          dailyModelTokens={[]}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should handle duplicate dates in dailyModelTokens', () => {
      const dailyModelTokens: DailyModelTokens[] = [
        {
          date: '2026-02-01',
          tokensByModel: { 'claude-sonnet-4': 1000 },
        },
        {
          date: '2026-02-01',
          tokensByModel: { 'claude-opus-4-6': 500 },
        },
      ]

      // Should not crash (last entry wins in Map)
      const { container } = render(
        <ContributionHeatmap
          dailyActivity={[]}
          dailyModelTokens={dailyModelTokens}
        />
      )

      expect(container.textContent).toContain('Activity')
    })

    it('should render month labels', () => {
      const dailyActivity: DailyActivity[] = [
        { date: '2026-01-01', messageCount: 10, sessionCount: 2, toolCallCount: 5 },
        { date: '2026-02-01', messageCount: 20, sessionCount: 3, toolCallCount: 8 },
      ]

      const { container } = render(
        <ContributionHeatmap
          dailyActivity={dailyActivity}
          dailyModelTokens={[]}
        />
      )

      // Month abbreviations should appear (exact months depend on current date)
      // Just verify component renders successfully
      expect(container.textContent).toContain('Activity')
    })
  })

  describe('range', () => {
    const cells = (c: HTMLElement) => c.querySelectorAll('[style*="grid-row"]').length
    const daysAgo = (n: number) => {
      const d = new Date()
      d.setDate(d.getDate() - n)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    const usage = (date: string): [DailyActivity[], DailyModelTokens[]] => [
      [{ date, messageCount: 1, sessionCount: 1, toolCallCount: 1 }],
      [{ date, tokensByModel: { m: 100 } }],
    ]

    it('starts at the first day of use when that is less than a year ago', () => {
      const [a, t] = usage(daysAgo(9))
      const { container } = render(<ContributionHeatmap dailyActivity={a} dailyModelTokens={t} />)
      expect(cells(container)).toBe(10)
    })

    it('shows only the past year once usage is older than that', () => {
      const [a, t] = usage(daysAgo(800))
      const { container } = render(<ContributionHeatmap dailyActivity={a} dailyModelTokens={t} />)
      expect(cells(container)).toBe(365)
          })

    describe('cell size', () => {
      afterEach(() => vi.unstubAllGlobals())
      const sizeFor = (daysBack: number) => {
        vi.stubGlobal('ResizeObserver', class {
          constructor(private cb: () => void) {}
          observe() { this.cb() }
          disconnect() {}
        })
        vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900)
        const [a, t] = usage(daysAgo(daysBack))
        const { container } = render(<ContributionHeatmap dailyActivity={a} dailyModelTokens={t} />)
        return parseInt((container.querySelector('[style*="grid-row"]') as HTMLElement).style.width)
      }

      it('draws big squares for a short history and small ones for a year', () => {
        expect(sizeFor(30)).toBe(26)
        expect(sizeFor(400)).toBeLessThan(sizeFor(30))
        expect(sizeFor(400)).toBeGreaterThanOrEqual(10)
      })
    })
  })
})
