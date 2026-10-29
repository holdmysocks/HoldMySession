import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { layoutProjectMap } from '@/lib/map/layout'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { mapProjectsQuery, projectMapQuery, hookEventsQuery } from './project-map.queries'
import { MapCanvas } from './MapCanvas'
import { NeedsYouPanel } from './NeedsYouPanel'
import { NodeDetailPanel } from './NodeDetailPanel'
import { HookEventsPanel } from './HookEventsPanel'
import { expiredSubagentsLabel } from './format-node'

interface ProjectMapPageProps {
  /** Project key (directory name), from the URL. */
  project: string | undefined
  onProjectChange: (projectKey: string) => void
}

export function ProjectMapPage({ project, onProjectChange }: ProjectMapPageProps) {
  const { privacyMode, anonymizeProjectName, anonymizePath } = usePrivacy()
  const projectsQuery = useQuery(mapProjectsQuery)
  const projects = projectsQuery.data ?? []

  const selectedKey = project || projects[0]?.projectKey || ''
  const selectedProject = projects.find((p) => p.projectKey === selectedKey) ?? null
  const mapQuery = useQuery(projectMapQuery(selectedKey))
  const eventsQuery = useQuery(hookEventsQuery)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const nodes = useMemo(() => mapQuery.data?.nodes ?? [], [mapQuery.data])
  const layout = useMemo(
    () => (mapQuery.data ? layoutProjectMap(mapQuery.data) : null),
    [mapQuery.data],
  )
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null
  // Counted from the map's own session nodes, so the line matches the borders on screen.
  const sessionNodes = nodes.filter((n) => n.kind === 'session')
  const activeCount = sessionNodes.filter((n) => n.status === 'active').length
  const needsYouCount = sessionNodes.filter((n) => n.status === 'needs-you').length
  // Expired subagents are not drawn, so their count comes from the session nodes' chips.
  const expiredSubagentTotal = sessionNodes.reduce((sum, n) => sum + n.expiredSubagentCount, 0)
  // Sessions with no project are left out of the map and counted by the server.
  const hiddenNoProjectCount = mapQuery.data?.hiddenNoProjectCount ?? 0

  function handleProjectChange(projectKey: string) {
    setSelectedId(null)
    onProjectChange(projectKey)
  }

  if (projectsQuery.isLoading) {
    return <div className="h-64 animate-pulse rounded-xl bg-gray-900/50" />
  }

  if (projectsQuery.error) {
    return (
      <p className="py-12 text-center text-sm text-red-400">
        Failed to load projects: {projectsQuery.error.message}
      </p>
    )
  }

  if (projects.length === 0) {
    return (
      <div>
        <Header />
        <div className="mt-10 rounded-xl border border-dashed border-gray-800 p-8 text-center">
          <p className="text-sm text-gray-300">No projects found</p>
          <p className="mt-1 text-xs text-gray-500">The map reads sessions from the projects folder in your Claude config directory.</p>
        </div>
      </div>
    )
  }

  const displayPath = selectedProject
    ? privacyMode
      ? anonymizePath(selectedProject.projectPath, selectedProject.projectDisplayName)
      : selectedProject.projectPath
    : ''

  return (
    <div>
      <Header />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <span>Project</span>
          <select
            value={selectedKey}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="max-w-xs rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 focus:border-brand-500 focus:outline-none"
          >
            {projects.map((p) => (
              <option key={p.projectKey} value={p.projectKey}>
                {privacyMode ? anonymizeProjectName(p.projectDisplayName) : p.projectDisplayName} ({p.sessionCount})
              </option>
            ))}
          </select>
        </label>
        {selectedProject && (
          <p className="min-w-0 truncate text-xs text-gray-500">
            <span className="font-mono">{displayPath}</span>
            <span className="mx-2 text-gray-700">|</span>
            {activeCount} active
            <span className="mx-2 text-gray-700">|</span>
            {needsYouCount} need you
            <span className="mx-2 text-gray-700">|</span>
            {hiddenNoProjectCount} hidden (no project)
            <span className="mx-2 text-gray-700">|</span>
            {expiredSubagentsLabel(expiredSubagentTotal)}
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section
          aria-label="Project map"
          className="max-h-[75vh] min-h-64 self-start overflow-auto rounded-xl border border-gray-800 bg-gray-950 p-4"
        >
          {mapQuery.isLoading ? (
            <div className="h-64 animate-pulse rounded-xl bg-gray-900/50" />
          ) : mapQuery.error ? (
            <p className="py-12 text-center text-sm text-red-400">
              Failed to load map: {mapQuery.error.message}
            </p>
          ) : layout && layout.nodes.length > 0 ? (
            <MapCanvas layout={layout} selectedId={selectedId} onSelect={setSelectedId} />
          ) : (
            <p className="py-12 text-center text-sm text-gray-500">
              This project has no sessions yet.
            </p>
          )}
        </section>

        <div className="space-y-4">
          <NeedsYouPanel nodes={nodes} onSelect={setSelectedId} />
          <NodeDetailPanel node={selectedNode} projectKey={selectedKey} />
          <HookEventsPanel events={eventsQuery.data} />
        </div>
      </div>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-100">Session Map</h1>
      <p className="mt-1 text-sm text-gray-400">
        Sessions in a project, with the subagents they dispatched. Read-only.
      </p>
      <p className="mt-2 text-xs text-gray-500">
        Messaging and linking sessions: Phase 2, see docs/session-map/README.md
      </p>
    </div>
  )
}
