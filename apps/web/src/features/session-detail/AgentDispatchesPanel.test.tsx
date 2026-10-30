import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { AgentInvocation } from '@/lib/parsers/types'
import { AgentDispatchesPanel } from './AgentsSkillsPanel'

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined }),
}))

function agent(subagentType: string, extra: Partial<AgentInvocation> = {}): AgentInvocation {
  return {
    toolUseId: `t-${Math.random()}`,
    subagentType,
    description: `${subagentType} job`,
    timestamp: '2026-01-01T10:00:00.000Z',
    model: 'claude-opus-5-5',
    ...extra,
  } as AgentInvocation
}

describe('AgentDispatchesPanel', () => {
  it('is closed by default and opens from its header', () => {
    render(<AgentDispatchesPanel agents={[agent('general-purpose')]} />)
    const header = screen.getByRole('button', { name: /Agent Dispatches/ })
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('general-purpose job')).toBeNull()
    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('general-purpose job')).toBeTruthy()
  })

  it('merges unknown dispatches of one model into a single row with an xN tag', () => {
    const agents = [
      agent('general-purpose'),
      agent('unknown', { totalTokens: 100, totalToolUseCount: 2 }),
      agent('unknown', { totalTokens: 50, totalToolUseCount: 3 }),
      agent('unknown', { totalTokens: 25 }),
    ]
    render(<AgentDispatchesPanel agents={agents} />)
    fireEvent.click(screen.getByRole('button', { name: /Agent Dispatches/ }))
    expect(screen.getAllByText('unknown')).toHaveLength(1)
    expect(screen.getByText('x3')).toBeTruthy()
    expect(screen.getByText('5 tools')).toBeTruthy()
    expect(screen.getByText('175')).toBeTruthy()
  })
})
