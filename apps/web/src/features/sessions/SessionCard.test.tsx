import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionCard } from './SessionCard'
import { PrivacyProvider } from '@/features/privacy/PrivacyContext'
import type { SessionSummary } from '@/lib/parsers/types'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}))

describe('SessionCard', () => {
  const mockSession: SessionSummary = {
    sessionId: 'f656e46e-bfaa-4997-8b69-d2d955ea2bfc',
    projectPath: '/Users/test/projects/my-app',
    projectKey: 'app',
    forkedFrom: null,
    projectName: 'my-app',
    projectDisplayName: 'Checkout Service',
    sessionName: 'Add retry to the payment client',
    lastStopReason: null,
    branch: 'feature/test-branch',
    cwd: '/Users/test/projects/my-app',
    startedAt: '2026-02-25T10:00:00.000Z',
    lastActiveAt: '2026-02-25T11:30:00.000Z',
    durationMs: 5400000,
    messageCount: 42,
    userMessageCount: 21,
    assistantMessageCount: 21,
    isActive: false,
    toolCallCount: 15,
    model: 'claude-sonnet-4-5-20250929',
    version: '0.4.1',
    fileSizeBytes: 102400,
  }

  it('renders truncated session ID (first 8 characters)', () => {
    render(
      <PrivacyProvider>
        <SessionCard now={Date.parse("2026-02-25T12:00:00Z")} session={mockSession} status="idle" />
      </PrivacyProvider>
    )
    expect(screen.getByText(mockSession.sessionId.slice(0, 8))).toBeTruthy()
  })

  it('does not render the full session ID', () => {
    const { container } = render(
      <PrivacyProvider>
        <SessionCard now={Date.parse("2026-02-25T12:00:00Z")} session={mockSession} status="idle" />
      </PrivacyProvider>
    )
    expect(container.textContent).not.toContain(mockSession.sessionId)
  })
  it('says Untitled session when there is no session name', () => {
    render(
      <PrivacyProvider>
        <SessionCard now={Date.parse("2026-02-25T12:00:00Z")} session={{ ...mockSession, sessionName: null }} status="idle" />
      </PrivacyProvider>
    )
    expect(screen.getByText('Untitled session')).toBeTruthy()
  })

  it('shows the status as a word, from the status value', () => {
    const { container, rerender } = render(
      <PrivacyProvider>
        <SessionCard now={Date.parse("2026-02-25T12:00:00Z")} session={mockSession} status="needs-you" />
      </PrivacyProvider>
    )
    expect(screen.getByText('NEEDS YOU')).toBeTruthy()
    // A session waiting on the user is outlined in amber.
    expect((container.firstElementChild as HTMLElement).className).toContain('border-yellow-400')

    rerender(
      <PrivacyProvider>
        <SessionCard now={Date.parse("2026-02-25T12:00:00Z")} session={mockSession} status="active" />
      </PrivacyProvider>
    )
    expect(screen.getByText('RUNNING')).toBeTruthy()
    expect((container.firstElementChild as HTMLElement).className).not.toContain('border-yellow-400')
  })

  it('says DONE for a completed session and IDLE for an idle one', () => {
    const { rerender } = render(
      <PrivacyProvider>
        <SessionCard now={Date.parse("2026-02-25T12:00:00Z")} session={mockSession} status="completed" />
      </PrivacyProvider>
    )
    expect(screen.getByText('DONE')).toBeTruthy()
    rerender(
      <PrivacyProvider>
        <SessionCard now={Date.parse("2026-02-25T12:00:00Z")} session={mockSession} status="idle" />
      </PrivacyProvider>
    )
    expect(screen.getByText('IDLE')).toBeTruthy()
  })

  it('puts the session name first as the title, and the project under it', () => {
    render(
      <PrivacyProvider>
        <SessionCard now={Date.parse("2026-02-25T12:00:00Z")} session={mockSession} status="idle" />
      </PrivacyProvider>
    )
    const title = screen.getByRole('heading', { level: 3 })
    expect(title.textContent).toBe('Add retry to the payment client')
    const project = screen.getByText('Checkout Service')
    expect(project.tagName).toBe('P')
    // The title comes before the project in the document.
    expect(title.compareDocumentPosition(project) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('titles a session with no name as untitled, and still shows the project', () => {
    render(
      <PrivacyProvider>
        <SessionCard now={Date.parse("2026-02-25T12:00:00Z")} session={{ ...mockSession, sessionName: null }} status="idle" />
      </PrivacyProvider>
    )
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Untitled session')
    expect(screen.getByText('Checkout Service')).toBeTruthy()
  })
})
