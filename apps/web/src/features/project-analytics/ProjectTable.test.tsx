import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ProjectTable } from './ProjectTable'
import { PrivacyProvider } from '@/features/privacy/PrivacyContext'
import type { ProjectAnalytics } from './project-analytics.api'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/sessions">{children}</a>,
}))

function project(overrides: Partial<ProjectAnalytics>): ProjectAnalytics {
  return {
    projectPath: '/work/app',
    isUnlinked: false,
    projectName: 'app',
    displayName: 'app',
    totalSessions: 2,
    activeSessions: 0,
    totalMessages: 10,
    outputTokens: 100,
    totalDurationMs: 60_000,
    firstSessionAt: '2026-01-01T10:00:00Z',
    lastSessionAt: '2026-01-02T10:00:00Z',
    ...overrides,
  }
}

function renderTable(projects: ProjectAnalytics[]) {
  return render(
    <PrivacyProvider>
      <ProjectTable projects={projects} />
    </PrivacyProvider>,
  )
}

describe('ProjectTable unlinked group', () => {
  // The unlinked group was most recently active, so a plain sort would put it first.
  const unlinked = project({
    projectPath: '__unlinked__',
    isUnlinked: true,
    projectName: 'Unlinked Sessions',
    displayName: 'Unlinked Sessions',
    totalSessions: 47,
    lastSessionAt: '2026-02-01T10:00:00Z',
  })
  const projects = [
    unlinked,
    project({ projectPath: '/work/a', projectName: 'alpha', displayName: 'alpha' }),
    project({ projectPath: '/work/b', projectName: 'beta', displayName: 'beta', lastSessionAt: '2026-01-01T10:00:00Z' }),
  ]

  it('keeps the unlinked row last, whichever way the table is sorted', () => {
    renderTable(projects)
    const names = screen.getAllByRole('row').slice(1).map((row) => row.textContent ?? '')
    expect(names[0]).toContain('alpha')
    expect(names[1]).toContain('beta')
    expect(names[2]).toContain('Unlinked Sessions')
  })

  it('tags the unlinked row with how many sessions it groups', () => {
    renderTable(projects)
    expect(screen.getByText('47 sessions')).toBeTruthy()
  })

  it('says "1 session" for a group of one, and does not link the row', () => {
    renderTable([{ ...unlinked, totalSessions: 1 }])
    expect(screen.getByText('1 session')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('ProjectTable names', () => {
  it('shows the display name, not the folder name', () => {
    renderTable([project({ projectName: 'my-folder-7f3a', displayName: 'People Traffic' })])
    expect(screen.getByText('People Traffic')).toBeTruthy()
    expect(screen.queryByText('my-folder-7f3a')).toBeNull()
  })
})
