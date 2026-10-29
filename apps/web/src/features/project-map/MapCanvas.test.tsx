import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MapCanvas } from './MapCanvas'
import { PrivacyProvider } from '@/features/privacy/PrivacyContext'
import { buildProjectMap, type MapSessionInput } from '@/lib/map/project-map'
import { layoutProjectMap } from '@/lib/map/layout'
import type { AgentInvocation, SessionSummary } from '@/lib/parsers/types'

function summary(sessionId: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId,
    projectPath: '/work/app',
    projectName: 'app',
    branch: 'feature/map',
    cwd: '/work/app',
    startedAt: '2026-01-01T10:00:00.000Z',
    lastActiveAt: '2026-01-01T11:00:00.000Z',
    durationMs: 60_000,
    messageCount: 4,
    userMessageCount: 2,
    assistantMessageCount: 2,
    isActive: false,
    toolCallCount: 1,
    model: 'claude-example-1',
    version: '2.1.0',
    fileSizeBytes: 100,
    isInteractive: true,
    ...overrides,
  }
}

const agent: AgentInvocation = {
  subagentType: 'Explore',
  description: 'find the router config',
  timestamp: '2026-01-01T10:30:00.000Z',
  toolUseId: 'toolu_1',
  agentId: 'agent-1',
  durationMs: 2000,
}

function buildLayout(inputs: MapSessionInput[]) {
  return layoutProjectMap(buildProjectMap('/work/app', 'app', inputs))
}

function renderCanvas(layout: ReturnType<typeof buildLayout>, onSelect = vi.fn(), selectedId: string | null = null) {
  render(
    <PrivacyProvider>
      <MapCanvas layout={layout} selectedId={selectedId} onSelect={onSelect} />
    </PrivacyProvider>,
  )
  return onSelect
}

describe('MapCanvas', () => {
  const layout = buildLayout([
    {
      summary: summary('aaaaaaaa-1111', { isActive: true }),
      agents: [agent],
      pendingQuestions: [],
      lastNotificationAt: null,
      totalTokens: 500,
    },
    {
      summary: summary('bbbbbbbb-2222'),
      agents: [],
      pendingQuestions: [
        { toolUseId: 'q', timestamp: '2026-01-01T10:00:00Z', questions: [{ header: 'H', question: 'Q?' }] },
      ],
      lastNotificationAt: null,
      totalTokens: 0,
    },
  ])

  it('renders one focusable button per node', () => {
    renderCanvas(layout)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(layout.nodes.length)
    for (const button of buttons) {
      expect(button.getAttribute('tabindex')).toBe('0')
    }
  })

  it('labels session and subagent nodes with kind, title, status and needs-you', () => {
    renderCanvas(layout)
    expect(screen.getByRole('button', { name: 'Session, feature/map, Active' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Subagent, Explore, Done' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Session, feature/map, Idle, needs you' })).toBeTruthy()
  })

  it('selects a node on click', () => {
    const onSelect = renderCanvas(layout)
    fireEvent.click(screen.getByRole('button', { name: 'Subagent, Explore, Done' }))
    expect(onSelect).toHaveBeenCalledWith(layout.nodes.find((n) => n.kind === 'subagent')!.id)
  })

  it('selects a node on Enter', () => {
    const onSelect = renderCanvas(layout)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Session, feature/map, Active' }), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(layout.nodes[0].id)
  })

  it('selects a node on Space and ignores other keys', () => {
    const onSelect = renderCanvas(layout)
    const node = screen.getByRole('button', { name: 'Session, feature/map, Active' })
    fireEvent.keyDown(node, { key: 'a' })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.keyDown(node, { key: ' ' })
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('marks the selected node with aria-pressed', () => {
    const selectedId = layout.nodes[0].id
    renderCanvas(layout, vi.fn(), selectedId)
    expect(screen.getByRole('button', { name: 'Session, feature/map, Active' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Subagent, Explore, Done' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('shows the session model and subtitle text', () => {
    renderCanvas(layout)
    expect(screen.getAllByText('example-1').length).toBeGreaterThan(0)
    expect(screen.getByText('aaaaaaaa · 4 msgs')).toBeTruthy()
  })
})
