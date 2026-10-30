import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { TimelineChart } from './TimelineChart'
import type { TimelineChartData } from './timeline-types'

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()

function data(startMs: number, endMs: number): TimelineChartData {
  return { startMs, endMs, durationMs: endMs - startMs, mainLane: [], agentLanes: [], skillMarkers: [], errorMarkers: [] }
}

function render900(chart: TimelineChartData) {
  const { container } = render(<TimelineChart data={chart} width={900} onHover={() => undefined} />)
  const svg = container.querySelector('svg')!
  const texts = () => Array.from(svg.querySelectorAll('text')).map((t) => t.textContent)
  return { svg, texts }
}

describe('TimelineChart axis', () => {
  it('names each day above hourly ticks for a session that runs for days, and the new day on midnight', () => {
    const { texts } = render900(data(at(2026, 3, 3, 10), at(2026, 3, 6, 16)))
    expect(texts()).toEqual(expect.arrayContaining(['Wednesday 4 March', 'Thursday 5 March', 'Wed 4 Mar', 'Thu 5 Mar', '12:00']))
  })

  it('shows months above week ticks for a session that runs for weeks', () => {
    const { texts } = render900(data(at(2026, 1, 5, 9), at(2026, 2, 23, 13)))
    expect(texts()).toEqual(expect.arrayContaining(['January 2026', 'February 2026', '12 Jan', '19 Jan']))
  })

  it('shows clock times for a short session', () => {
    const { texts } = render900(data(at(2026, 3, 3, 10, 2), at(2026, 3, 3, 10, 42)))
    expect(texts().some((t) => /^10:\d\d$/.test(t ?? ''))).toBe(true)
  })

  it('draws a gridline for every tick, and a stronger one where the day changes', () => {
    const { svg } = render900(data(at(2026, 3, 3, 10), at(2026, 3, 6, 16)))
    const tickTexts = Array.from(svg.querySelectorAll('g > text')).filter((t) => /\d/.test(t.textContent ?? '') && !/day|March/.test(t.textContent ?? ''))
    const gridlines = svg.querySelectorAll('g > line[stroke-dasharray], g > line[y2]')
    expect(tickTexts.length).toBeGreaterThan(0)
    expect(gridlines.length).toBeGreaterThan(tickTexts.length)
  })
})

describe('TimelineChart hover guide', () => {
  it('shows the exact time under the pointer, and goes when the pointer leaves', () => {
    const { svg } = render900(data(at(2026, 3, 3, 10), at(2026, 3, 6, 16)))
    expect(svg.querySelector('[data-hover-guide]')).toBeNull()
    fireEvent.mouseMove(svg, { clientX: 500, clientY: 60 })
    const guide = svg.querySelector('[data-hover-guide]')
    expect(guide).not.toBeNull()
    expect(guide!.textContent).toMatch(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} 2026 \d\d:\d\d:\d\d$/)
    fireEvent.mouseLeave(svg)
    expect(svg.querySelector('[data-hover-guide]')).toBeNull()
  })

  it('shows nothing while the pointer is over the lane labels, left of the chart', () => {
    const { svg } = render900(data(at(2026, 3, 3, 10), at(2026, 3, 6, 16)))
    fireEvent.mouseMove(svg, { clientX: 20, clientY: 60 })
    expect(svg.querySelector('[data-hover-guide]')).toBeNull()
  })

  it('reads a later time further along the chart', () => {
    const { svg } = render900(data(at(2026, 3, 3, 10), at(2026, 3, 6, 16)))
    fireEvent.mouseMove(svg, { clientX: 150, clientY: 60 })
    const early = svg.querySelector('[data-hover-guide]')!.textContent
    fireEvent.mouseMove(svg, { clientX: 800, clientY: 60 })
    const late = svg.querySelector('[data-hover-guide]')!.textContent
    expect(early).toContain('Tue 3 Mar')
    expect(late).toContain('Fri 6 Mar')
  })
})
