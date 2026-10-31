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

  it('shows the session name next to the dot, then the status word, messages and model, and the branch and short id', () => {
    renderCanvas(layout)
    expect(screen.getAllByText('Fix the map labels').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^(IDLE|DONE|RUNNING|NEEDS YOU)$/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/4 msgs · example-1/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('feature/map · aaaaaaaa').length).toBeGreaterThan(0)
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
    const bodies = Array.from(container.querySelectorAll('rect[data-card-body]'))
    expect(bodies.map((b) => b.getAttribute('stroke-width'))).toEqual(['2', '1.5'])
  })

  it('draws a thicker border for a selected node', () => {
    const layout = buildLayout([input('aaaaaaaa-1111', [])])
    const { container } = render(
      <PrivacyProvider>
        <MapCanvas layout={layout} selectedId={layout.nodes[0].id} onSelect={vi.fn()} />
      </PrivacyProvider>,
    )
    expect(container.querySelector('rect[data-card-body]')!.getAttribute('stroke-width')).toBe('3')
  })

  it('shows a +N chip for the expired subagents of a session, and says so in its label', () => {
    const container = renderInputs([
      input('aaaaaaaa-1111', [agent, { ...agent, agentId: 'agent-2' }]),
    ])
    expect(screen.getByText('+2 quiet agents')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Session, My App, Fix the map labels, Idle, 2 expired subagents hidden' }),
    ).toBeTruthy()
    // The chip is decoration. The label above carries the same information.
    expect(container.querySelector('[aria-hidden="true"]')!.textContent).toBe('+2 quiet agents')
  })

  it('shows no chip when every subagent is running', () => {
    renderInputs([input('aaaaaaaa-1111', [agent], [['agent-1', Date.now()]])])
    expect(screen.queryByText(/^\+\d+ quiet/)).toBeNull()
  })

  it('draws a session whose subagents have all expired as one node, with no child cards', () => {
    const container = renderInputs([input('aaaaaaaa-1111', [agent])])
    expect(container.querySelectorAll('rect[data-card-body]')).toHaveLength(1)
    expect(screen.getByText('+1 quiet agent')).toBeTruthy()
  })

  it('brightens the border of a needs-you session', () => {
    const container = renderInputs([input('aaaaaaaa-1111', [], [], { isActive: true })])
    const pendingInput = input('bbbbbbbb-2222', [], [], { isActive: true })
    pendingInput.pendingQuestions = [{ toolUseId: 'q', timestamp: '2026-01-01T10:00:00Z', questions: [] }]
    const needsYou = renderInputs([pendingInput])
    expect(container.querySelector('rect[data-card-body]')!.getAttribute('class')).not.toContain('status-edge-needs-you')
    expect(needsYou.querySelector('rect[data-card-body]')!.getAttribute('class')).toContain('status-edge-needs-you')
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
    const body = container.querySelector('rect[data-card-body]')!
    const halo = container.querySelector('rect[data-card-halo]')
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
    expect(body).toContain('stroke-indigo-400')
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

  function renderEditable(editMode: boolean, snapToGrid = false) {
    const onSelect = vi.fn()
    const onNodesMove = vi.fn()
    const { container } = render(
      <PrivacyProvider>
        <MapCanvas layout={layout} selectedId={null} onSelect={onSelect} editMode={editMode} onNodesMove={onNodesMove} snapToGrid={snapToGrid} />
      </PrivacyProvider>,
    )
    const svg = container.querySelector('svg[role="group"]')!
    const content = svg.querySelector(':scope > g')!
    const card = screen.getByRole('button', { name: /^Session, My App/ })
    return { svg, content, card, onSelect, onNodesMove }
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
    const { card, content, onSelect, onNodesMove } = renderEditable(false)
    drag(card, [100, 100], [160, 130])
    fireEvent.click(card)
    expect(content.getAttribute('transform')).toBe('translate(76 46) scale(1)')
    expect(onNodesMove).not.toHaveBeenCalled()
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
    const { card, content, onSelect, onNodesMove } = renderEditable(true)
    drag(card, [100, 100], [160, 130])
    expect(onNodesMove).toHaveBeenLastCalledWith([{ id: node.id, x: node.x + 60, y: node.y + 30 }])
    expect(content.getAttribute('transform')).toBe('translate(16 16) scale(1)')
    fireEvent.click(card)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('still pans from empty space in editor mode', () => {
    const { svg, content, onNodesMove } = renderEditable(true)
    drag(svg, [100, 100], [140, 100])
    expect(onNodesMove).not.toHaveBeenCalled()
    expect(content.getAttribute('transform')).toBe('translate(56 16) scale(1)')
  })

  it('nudges a focused card with the arrow keys in editor mode only', () => {
    const edit = renderEditable(true)
    fireEvent.keyDown(edit.card, { key: 'ArrowRight' })
    fireEvent.keyDown(edit.card, { key: 'ArrowUp' })
    expect(edit.onNodesMove).toHaveBeenNthCalledWith(1, [{ id: node.id, x: node.x + 10, y: node.y }])
    expect(edit.onNodesMove).toHaveBeenNthCalledWith(2, [{ id: node.id, x: node.x, y: node.y - 10 }])
  })

  it('does not move a card with the arrow keys outside editor mode', () => {
    const view = renderEditable(false)
    fireEvent.keyDown(view.card, { key: 'ArrowRight' })
    expect(view.onNodesMove).not.toHaveBeenCalled()
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

describe('MapCanvas grid, multi-select and box select', () => {
  const sessionInput = (id: string): MapSessionInput => ({
    summary: summary(id),
    agents: [],
    subagentLastActivity: new Map(),
    pendingQuestions: [],
    lastNotificationAt: null,
    totalTokens: 0,
  })
  // Two top-level sessions side by side: the first at x 0, the second at x 320.
  const layout = buildLayout([sessionInput('aaaaaaaa-1111'), sessionInput('bbbbbbbb-2222')])
  const [first, second] = layout.nodes

  function renderTwo(options: { editMode?: boolean; snapToGrid?: boolean } = {}) {
    const onSelect = vi.fn()
    const onNodesMove = vi.fn()
    const { container } = render(
      <PrivacyProvider>
        <MapCanvas
          layout={layout}
          selectedId={null}
          onSelect={onSelect}
          editMode={options.editMode ?? true}
          snapToGrid={options.snapToGrid ?? false}
          onNodesMove={onNodesMove}
        />
      </PrivacyProvider>,
    )
    const svg = container.querySelector('svg[role="group"]')!
    const card = (index: number) => container.querySelectorAll('[data-node-id]')[index] as SVGGElement
    return { container, svg, card, onSelect, onNodesMove }
  }

  function drag(target: Element, by: [number, number], init: object = {}) {
    fireEvent.pointerDown(target, { pointerId: 1, button: 0, clientX: 100, clientY: 100, ...init })
    fireEvent.pointerMove(target, { pointerId: 1, clientX: 100 + by[0], clientY: 100 + by[1], ...init })
    fireEvent.pointerUp(target, { pointerId: 1, clientX: 100 + by[0], clientY: 100 + by[1], ...init })
  }

  it('snaps a dragged card to the grid', () => {
    const { card, onNodesMove } = renderTwo({ snapToGrid: true })
    drag(card(0), [47, 33])
    expect(onNodesMove).toHaveBeenLastCalledWith([{ id: first.id, x: 40, y: 40 }])
  })

  it('places a card exactly where it is dropped while Alt is held', () => {
    const { card, onNodesMove } = renderTwo({ snapToGrid: true })
    drag(card(0), [47, 33], { altKey: true })
    expect(onNodesMove).toHaveBeenLastCalledWith([{ id: first.id, x: 47, y: 33 }])
  })

  it('does not snap when the grid is off', () => {
    const { card, onNodesMove } = renderTwo({ snapToGrid: false })
    drag(card(0), [47, 33])
    expect(onNodesMove).toHaveBeenLastCalledWith([{ id: first.id, x: 47, y: 33 }])
  })

  it('nudges by a grid step when the grid is on, and by 10 with Alt', () => {
    const { card, onNodesMove } = renderTwo({ snapToGrid: true })
    fireEvent.keyDown(card(0), { key: 'ArrowRight' })
    expect(onNodesMove).toHaveBeenLastCalledWith([{ id: first.id, x: 20, y: 0 }])
    fireEvent.keyDown(card(0), { key: 'ArrowRight', altKey: true })
    expect(onNodesMove).toHaveBeenLastCalledWith([{ id: first.id, x: 10, y: 0 }])
  })

  describe('the grid', () => {
    function stubSize() {
      return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}),
      })
    }

    it('is drawn in editor mode with snapping on, and only then', () => {
      const spy = stubSize()
      expect(renderTwo({ snapToGrid: true }).container.querySelector('[data-grid]')).not.toBeNull()
      spy.mockRestore()
    })

    it('is not drawn with snapping off, or outside editor mode', () => {
      const spy = stubSize()
      expect(renderTwo({ snapToGrid: false }).container.querySelector('[data-grid]')).toBeNull()
      expect(renderTwo({ editMode: false, snapToGrid: true }).container.querySelectorAll('[data-grid]')).toHaveLength(0)
      spy.mockRestore()
    })
  })

  describe('selecting several cards', () => {
    const picked = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('[data-multiselected="true"]')).map((el) => el.getAttribute('data-node-id'))

    it('adds a card with Ctrl-click, and takes it out with another Ctrl-click', () => {
      const { container, card, onSelect } = renderTwo()
      fireEvent.click(card(0), { ctrlKey: true })
      fireEvent.click(card(1), { ctrlKey: true })
      expect(picked(container)).toEqual([first.id, second.id])
      expect(onSelect).toHaveBeenCalledWith(second.id)
      fireEvent.click(card(0), { ctrlKey: true })
      expect(picked(container)).toEqual([second.id])
    })

    it('treats a plain click as selecting that card alone', () => {
      const { container, card } = renderTwo()
      fireEvent.click(card(0), { ctrlKey: true })
      fireEvent.click(card(1), { ctrlKey: true })
      fireEvent.click(card(1))
      expect(picked(container)).toEqual([second.id])
    })

    it('moves every selected card together when one of them is dragged', () => {
      const { card, onNodesMove } = renderTwo()
      fireEvent.click(card(0), { ctrlKey: true })
      fireEvent.click(card(1), { ctrlKey: true })
      drag(card(1), [60, 40])
      expect(onNodesMove).toHaveBeenLastCalledWith([
        { id: first.id, x: first.x + 60, y: first.y + 40 },
        { id: second.id, x: second.x + 60, y: second.y + 40 },
      ])
    })

    it('keeps a group arranged when it snaps: the dragged card lands on the grid and the rest follow', () => {
      const { card, onNodesMove } = renderTwo({ snapToGrid: true })
      fireEvent.click(card(0), { ctrlKey: true })
      fireEvent.click(card(1), { ctrlKey: true })
      drag(card(0), [47, 33])
      expect(onNodesMove).toHaveBeenLastCalledWith([
        { id: first.id, x: 40, y: 40 },
        { id: second.id, x: second.x + 40, y: second.y + 40 },
      ])
    })

    it('moves only a card that is not selected, and selects it instead', () => {
      const { container, card, onNodesMove } = renderTwo()
      fireEvent.click(card(1), { ctrlKey: true })
      drag(card(0), [30, 10])
      expect(onNodesMove).toHaveBeenLastCalledWith([{ id: first.id, x: first.x + 30, y: first.y + 10 }])
      expect(picked(container)).toEqual([first.id])
    })

    it('nudges the whole selection with the arrow keys', () => {
      const { card, onNodesMove } = renderTwo()
      fireEvent.click(card(0), { ctrlKey: true })
      fireEvent.click(card(1), { ctrlKey: true })
      fireEvent.keyDown(card(0), { key: 'ArrowDown' })
      expect(onNodesMove).toHaveBeenLastCalledWith([
        { id: first.id, x: first.x, y: first.y + 10 },
        { id: second.id, x: second.x, y: second.y + 10 },
      ])
    })

    it('drops the selection when empty space is clicked', () => {
      const { container, svg, card } = renderTwo()
      fireEvent.click(card(0), { ctrlKey: true })
      expect(picked(container)).toHaveLength(1)
      fireEvent.pointerDown(svg, { pointerId: 1, button: 0, clientX: 600, clientY: 400 })
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 600, clientY: 400 })
      expect(picked(container)).toEqual([])
    })

    it('does not select several outside editor mode', () => {
      const { container, card } = renderTwo({ editMode: false })
      fireEvent.click(card(0), { ctrlKey: true })
      fireEvent.click(card(1), { ctrlKey: true })
      expect(picked(container)).toEqual([])
    })
  })

  describe('the selection box', () => {
    const picked = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('[data-multiselected="true"]')).map((el) => el.getAttribute('data-node-id'))

    function boxDrag(svg: Element, to: [number, number]) {
      fireEvent.pointerDown(svg, { pointerId: 1, button: 0, clientX: 0, clientY: 0, ctrlKey: true })
      fireEvent.pointerMove(svg, { pointerId: 1, clientX: to[0], clientY: to[1], ctrlKey: true })
    }

    it('is drawn while Ctrl is held and the pointer drags over empty space', () => {
      const { container, svg } = renderTwo()
      boxDrag(svg, [300, 200])
      expect(container.querySelector('[data-marquee]')).not.toBeNull()
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 300, clientY: 200 })
      expect(container.querySelector('[data-marquee]')).toBeNull()
    })

    it('selects the cards it touches, and no others', () => {
      const { container, svg } = renderTwo()
      // The view starts 16px in, so this reaches map x 284: the first card (0 to 280) and not the second (from 320).
      boxDrag(svg, [300, 200])
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 300, clientY: 200 })
      expect(picked(container)).toEqual([first.id])
    })

    it('selects several cards when it spans them, and they then move together', () => {
      const { container, svg, card, onNodesMove } = renderTwo()
      boxDrag(svg, [700, 200])
      fireEvent.pointerUp(svg, { pointerId: 1, clientX: 700, clientY: 200 })
      expect(picked(container)).toEqual([first.id, second.id])
      drag(card(0), [20, 0])
      expect(onNodesMove).toHaveBeenLastCalledWith([
        { id: first.id, x: first.x + 20, y: first.y },
        { id: second.id, x: second.x + 20, y: second.y },
      ])
    })

    it('draws nothing and pans when Ctrl is held outside editor mode', () => {
      const { container, svg } = renderTwo({ editMode: false })
      boxDrag(svg, [300, 200])
      expect(container.querySelector('[data-marquee]')).toBeNull()
      expect(svg.querySelector(':scope > g')!.getAttribute('transform')).toBe('translate(316 216) scale(1)')
    })
  })
})
