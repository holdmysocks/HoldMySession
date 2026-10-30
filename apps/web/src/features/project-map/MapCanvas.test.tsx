import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MapCanvas } from './MapCanvas'
import { PrivacyProvider } from '@/features/privacy/PrivacyContext'
import { buildProjectMap, type MapSessionInput } from '@/lib/map/project-map'
import { layoutProjectMap } from '@/lib/map/layout'
import type { AgentInvocation, SessionSummary } from '@/lib/parsers/types'

function summary(sessionId: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId,
    projectPath: '/work/app',
    projectKey: 'app',
    forkedFrom: null,
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
    projectDisplayName: 'My App',
    sessionName: 'Fix the map labels',
    lastStopReason: null,
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
  return layoutProjectMap(buildProjectMap('app', '/work/app', 'My App', inputs))
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
      subagentLastActivity: new Map([['agent-1', Date.now()]]),
      pendingQuestions: [],
      lastNotificationAt: null,
      totalTokens: 500,
    },
    {
      summary: summary('bbbbbbbb-2222', { isActive: true }),
      agents: [],
      subagentLastActivity: new Map(),
      pendingQuestions: [
        { toolUseId: 'q', timestamp: '2026-01-01T10:00:00Z', questions: [{ header: 'H', question: 'Q?' }] },
      ],
      lastNotificationAt: null,
      totalTokens: 0,
    },
  ])

  it('renders one focusable button per node', () => {
    renderCanvas(layout)
    const buttons = within(screen.getByRole('group', { name: 'Session map' })).getAllByRole('button')
    expect(buttons).toHaveLength(layout.nodes.length)
    for (const button of buttons) {
      expect(button.getAttribute('tabindex')).toBe('0')
    }
  })

  it('labels session and subagent nodes with kind, session name, status and needs-you', () => {
    renderCanvas(layout)
    expect(screen.getByRole('button', { name: 'Session, My App, Fix the map labels, Active' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Subagent, Explore, Running' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Session, My App, Fix the map labels, Needs you, needs you' }),
    ).toBeTruthy()
  })

  it('selects a node on click', () => {
    const onSelect = renderCanvas(layout)
    fireEvent.click(screen.getByRole('button', { name: 'Subagent, Explore, Running' }))
    expect(onSelect).toHaveBeenCalledWith(layout.nodes.find((n) => n.kind === 'subagent')!.id)
  })

  it('selects a node on Enter', () => {
    const onSelect = renderCanvas(layout)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Session, My App, Fix the map labels, Active' }), { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(layout.nodes[0].id)
    expect(layout.nodes[0].kind).toBe('session')
  })

  it('selects a node on Space and ignores other keys', () => {
    const onSelect = renderCanvas(layout)
    const node = screen.getByRole('button', { name: 'Session, My App, Fix the map labels, Active' })
    fireEvent.keyDown(node, { key: 'a' })
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.keyDown(node, { key: ' ' })
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('marks the selected node with aria-pressed', () => {
    const selectedId = layout.nodes.find((n) => n.kind === 'session')!.id
    renderCanvas(layout, vi.fn(), selectedId)
    expect(screen.getByRole('button', { name: 'Session, My App, Fix the map labels, Active' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Subagent, Explore, Running' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('shows the session name next to the dot, then the short id and message count, branch and model', () => {
    renderCanvas(layout)
    expect(screen.getAllByText('Fix the map labels').length).toBeGreaterThan(0)
    expect(screen.getByText('aaaaaaaa · 4 msgs')).toBeTruthy()
    expect(screen.getAllByText('feature/map').length).toBeGreaterThan(0)
    expect(screen.getAllByText('example-1').length).toBeGreaterThan(0)
  })

  it('leaves the project name off the card, but keeps it in the accessible label', () => {
    renderCanvas(layout)
    expect(screen.queryByText('My App')).toBeNull()
    expect(screen.getAllByRole('button', { name: /Session, My App, Fix the map labels/ }).length).toBeGreaterThan(0)
  })

  it('uses a neutral title, not the branch, when the session has no name', () => {
    const plain = buildLayout([
      { summary: summary('cccccccc-3333', { sessionName: null }), agents: [], subagentLastActivity: new Map(), pendingQuestions: [], lastNotificationAt: null, totalTokens: 0 },
    ])
    renderCanvas(plain)
    expect(screen.getByRole('button', { name: 'Session, My App, Untitled session, Idle' })).toBeTruthy()
  })

  it('labels a running subagent as running and a fork as a forked session', () => {
    const forked = buildLayout([
      { summary: summary('aaaaaaaa-1111'), agents: [], subagentLastActivity: new Map(), pendingQuestions: [], lastNotificationAt: null, totalTokens: 0 },
      {
        summary: summary('eeeeeeee-5555', { forkedFrom: { sessionId: 'aaaaaaaa-1111', messageUuid: null } }),
        agents: [{ ...agent, agentId: 'live' }],
        subagentLastActivity: new Map([['live', Date.now()]]),
        pendingQuestions: [],
        lastNotificationAt: null,
        totalTokens: 0,
      },
    ])
    renderCanvas(forked)
    expect(screen.getByRole('button', { name: 'Subagent, Explore, Running' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Forked session, My App/ })).toBeTruthy()
  })
})

describe('MapCanvas borders and expired subagents', () => {
  function input(
    sessionId: string,
    agents: AgentInvocation[],
    writeTimes: Array<[string, number]> = [],
    overrides: Partial<SessionSummary> = {},
  ): MapSessionInput {
    return {
      summary: summary(sessionId, overrides),
      agents,
      subagentLastActivity: new Map(writeTimes),
      pendingQuestions: [],
      lastNotificationAt: null,
      totalTokens: 0,
    }
  }

  function renderInputs(inputs: MapSessionInput[]) {
    const layout = buildLayout(inputs)
    const { container } = render(
      <PrivacyProvider>
        <MapCanvas layout={layout} selectedId={null} onSelect={vi.fn()} />
      </PrivacyProvider>,
    )
    return container
  }

  it('draws session borders 2px wide and subagent borders 1.5px wide', () => {
    const container = renderInputs([input('aaaaaaaa-1111', [agent], [['agent-1', Date.now()]])])
    const bodies = Array.from(container.querySelectorAll('rect[rx="12"]'))
    expect(bodies.map((b) => b.getAttribute('stroke-width'))).toEqual(['2', '1.5'])
  })

  it('draws a thicker border for a selected node', () => {
    const layout = buildLayout([input('aaaaaaaa-1111', [])])
    const { container } = render(
      <PrivacyProvider>
        <MapCanvas layout={layout} selectedId={layout.nodes[0].id} onSelect={vi.fn()} />
      </PrivacyProvider>,
    )
    expect(container.querySelector('rect[rx="12"]')!.getAttribute('stroke-width')).toBe('3')
  })

  it('shows a +N chip for the expired subagents of a session, and says so in its label', () => {
    const container = renderInputs([
      input('aaaaaaaa-1111', [agent, { ...agent, agentId: 'agent-2' }]),
    ])
    expect(screen.getByText('+2')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Session, My App, Fix the map labels, Idle, 2 expired subagents hidden' }),
    ).toBeTruthy()
    // The chip is decoration. The label above carries the same information.
    expect(container.querySelector('[aria-hidden="true"]')!.textContent).toBe('+2')
  })

  it('shows no chip when every subagent is running', () => {
    renderInputs([input('aaaaaaaa-1111', [agent], [['agent-1', Date.now()]])])
    expect(screen.queryByText(/^\+\d+$/)).toBeNull()
  })

  it('draws a session whose subagents have all expired as one node, with no child cards', () => {
    const container = renderInputs([input('aaaaaaaa-1111', [agent])])
    expect(container.querySelectorAll('rect[rx="12"]')).toHaveLength(1)
    expect(screen.getByText('+1')).toBeTruthy()
  })

  it('brightens the border of a needs-you session', () => {
    const container = renderInputs([input('aaaaaaaa-1111', [], [], { isActive: true })])
    const pendingInput = input('bbbbbbbb-2222', [], [], { isActive: true })
    pendingInput.pendingQuestions = [{ toolUseId: 'q', timestamp: '2026-01-01T10:00:00Z', questions: [] }]
    const needsYou = renderInputs([pendingInput])
    expect(container.querySelector('rect[rx="12"]')!.getAttribute('class')).not.toContain('status-edge-needs-you')
    expect(needsYou.querySelector('rect[rx="12"]')!.getAttribute('class')).toContain('status-edge-needs-you')
  })
})

describe('MapCanvas status styling', () => {
  function renderWith(status: { isActive: boolean; lastStopReason: string | null; pending?: boolean }) {
    const [node] = buildLayout([
      {
        summary: summary('dddddddd-4444', {
          isActive: status.isActive,
          lastStopReason: status.lastStopReason,
          lastActiveAt: new Date().toISOString(),
        }),
        agents: [],
        subagentLastActivity: new Map(),
        pendingQuestions: status.pending
          ? [{ toolUseId: 'q', timestamp: new Date().toISOString(), questions: [] }]
          : [],
        lastNotificationAt: null,
        totalTokens: 0,
      },
    ]).nodes
    const single = { ...buildLayout([]), nodes: [node], width: 260, height: 84 }
    const { container } = render(
      <PrivacyProvider>
        <MapCanvas layout={single} selectedId={null} onSelect={vi.fn()} />
      </PrivacyProvider>,
    )
    const body = container.querySelector('rect[rx="12"]')!
    const halo = container.querySelector('rect[rx="16"]')
    return { body: body.getAttribute('class') ?? '', halo: halo?.getAttribute('class') ?? null }
  }

  it('gives a needs-you session a yellow border and a fast halo', () => {
    const { body, halo } = renderWith({ isActive: true, lastStopReason: null, pending: true })
    expect(body).toContain('stroke-yellow-400')
    expect(halo).toContain('status-halo-needs-you')
  })

  it('gives an active session a green border and a slow halo', () => {
    const { body, halo } = renderWith({ isActive: true, lastStopReason: null })
    expect(body).toContain('stroke-green-500')
    expect(halo).toContain('status-halo-active')
  })

  it('gives a completed session a solid brand border and no halo', () => {
    const { body, halo } = renderWith({ isActive: false, lastStopReason: 'end_turn' })
    expect(body).toContain('stroke-brand-500')
    expect(halo).toBeNull()
  })

  it('gives an idle session a grey border and no halo', () => {
    const { body, halo } = renderWith({ isActive: false, lastStopReason: 'tool_use' })
    expect(body).toContain('stroke-gray-600')
    expect(halo).toBeNull()
  })
})

describe('MapCanvas pan, zoom and editor mode', () => {
  const layout = buildLayout([
    {
      summary: summary('aaaaaaaa-1111'),
      agents: [],
      subagentLastActivity: new Map(),
      pendingQuestions: [],
      lastNotificationAt: null,
      totalTokens: 0,
    },
  ])
  const node = layout.nodes[0]

  function renderEditable(editMode: boolean) {
    const onSelect = vi.fn()
    const onNodeMove = vi.fn()
    const { container } = render(
      <PrivacyProvider>
        <MapCanvas layout={layout} selectedId={null} onSelect={onSelect} editMode={editMode} onNodeMove={onNodeMove} />
      </PrivacyProvider>,
    )
    const svg = container.querySelector('svg[role="group"]')!
    const content = svg.querySelector(':scope > g')!
    const card = screen.getByRole('button', { name: /^Session, My App/ })
    return { svg, content, card, onSelect, onNodeMove }
  }

  function drag(target: Element, from: [number, number], to: [number, number]) {
    fireEvent.pointerDown(target, { pointerId: 1, button: 0, clientX: from[0], clientY: from[1] })
    fireEvent.pointerMove(target, { pointerId: 1, clientX: to[0], clientY: to[1] })
    fireEvent.pointerUp(target, { pointerId: 1, clientX: to[0], clientY: to[1] })
  }

  it('fills the space it is given, not a fixed size', () => {
    const { svg } = renderEditable(false)
    expect(svg.getAttribute('width')).toBe('100%')
    expect(svg.getAttribute('height')).toBe('100%')
  })

  it('pans the map when empty space is dragged', () => {
    const { svg, content } = renderEditable(false)
    const before = content.getAttribute('transform')
    drag(svg, [100, 100], [160, 130])
    expect(content.getAttribute('transform')).not.toBe(before)
    expect(content.getAttribute('transform')).toMatch(/^translate\(76 46\) scale\(1\)$/)
  })

  it('pans, and does not move the card or select it, when a card is dragged outside editor mode', () => {
    const { card, content, onSelect, onNodeMove } = renderEditable(false)
    drag(card, [100, 100], [160, 130])
    fireEvent.click(card)
    expect(content.getAttribute('transform')).toBe('translate(76 46) scale(1)')
    expect(onNodeMove).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('still selects a card on a plain click', () => {
    const { card, onSelect } = renderEditable(false)
    fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 50, clientY: 50 })
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 51, clientY: 50 })
    fireEvent.click(card)
    expect(onSelect).toHaveBeenCalledWith(node.id)
  })

  it('moves the card, not the map, when it is dragged in editor mode', () => {
    const { card, content, onSelect, onNodeMove } = renderEditable(true)
    drag(card, [100, 100], [160, 130])
    expect(onNodeMove).toHaveBeenLastCalledWith(node.id, node.x + 60, node.y + 30)
    expect(content.getAttribute('transform')).toBe('translate(16 16) scale(1)')
    fireEvent.click(card)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('still pans from empty space in editor mode', () => {
    const { svg, content, onNodeMove } = renderEditable(true)
    drag(svg, [100, 100], [140, 100])
    expect(onNodeMove).not.toHaveBeenCalled()
    expect(content.getAttribute('transform')).toBe('translate(56 16) scale(1)')
  })

  it('nudges a focused card with the arrow keys in editor mode only', () => {
    const edit = renderEditable(true)
    fireEvent.keyDown(edit.card, { key: 'ArrowRight' })
    fireEvent.keyDown(edit.card, { key: 'ArrowUp' })
    expect(edit.onNodeMove).toHaveBeenNthCalledWith(1, node.id, node.x + 10, node.y)
    expect(edit.onNodeMove).toHaveBeenNthCalledWith(2, node.id, node.x, node.y - 10)
  })

  it('does not move a card with the arrow keys outside editor mode', () => {
    const view = renderEditable(false)
    fireEvent.keyDown(view.card, { key: 'ArrowRight' })
    expect(view.onNodeMove).not.toHaveBeenCalled()
  })

  it('zooms with the wheel around the pointer', () => {
    const { svg, content } = renderEditable(false)
    // jsdom's wheel events carry no pointer position, so set it as a browser would.
    const wheel = new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true })
    Object.defineProperty(wheel, 'clientX', { value: 0 })
    Object.defineProperty(wheel, 'clientY', { value: 0 })
    fireEvent(svg, wheel)
    expect(wheel.defaultPrevented).toBe(true)
    const match = content.getAttribute('transform')!.match(/scale\(([\d.]+)\)/)!
    expect(Number(match[1])).toBeGreaterThan(1)
  })

  it('zooms with the buttons and shows the zoom level', () => {
    const { content } = renderEditable(false)
    expect(screen.getByText('100%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByText('125%')).toBeTruthy()
    expect(content.getAttribute('transform')).toContain('scale(1.25)')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(screen.getByText('100%')).toBeTruthy()
  })
})
