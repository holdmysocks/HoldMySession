import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { applyCustomPositions, layoutProjectMap, type NodePositions } from '@/lib/map/layout'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { mapProjectsQuery, projectMapQuery, hookEventsQuery } from './project-map.queries'
import { MapCanvas } from './MapCanvas'
import { NeedsYouPanel } from './NeedsYouPanel'
import { NodeDetailPanel } from './NodeDetailPanel'
import { HookEventsPanel } from './HookEventsPanel'
import { expiredSubagentsLabel } from './format-node'
import { useMapLayout } from './use-map-layout'

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
  const [editMode, setEditMode] = useState(false)
  const [panelsHidden, setPanelsHidden] = useState(false)
  // Card positions from the editor. They belong to a project and are saved on the server.
  const { positions, setPositions, isLoading: layoutLoading, saveFailed } = useMapLayout(selectedKey)

  const nodes = useMemo(() => mapQuery.data?.nodes ?? [], [mapQuery.data])
  const baseLayout = useMemo(
    () => (mapQuery.data ? layoutProjectMap(mapQuery.data) : null),
    [mapQuery.data],
  )
  const layout = useMemo(
    () => (baseLayout ? applyCustomPositions(baseLayout, positions) : null),
    [baseLayout, positions],
  )
  const hasCustomLayout = layout ? layout.nodes.some((n) => Object.hasOwn(positions, n.id)) : false
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null
  // Counted from the map's own session nodes, so the line matches the borders on screen.
  const sessionNodes = nodes.filter((n) => n.kind === 'session')
  const activeCount = sessionNodes.filter((n) => n.status === 'active').length
  const needsYouCount = sessionNodes.filter((n) => n.status === 'needs-you').length
  // Expired subagents are not drawn, so their count comes from the session nodes' chips.
  const expiredSubagentTotal = sessionNodes.reduce((sum, n) => sum + n.expiredSubagentCount, 0)
  // Sessions with no project, and archived sessions, are left out of the map and counted by the server.
  const hiddenNoProjectCount = mapQuery.data?.hiddenNoProjectCount ?? 0
  const hiddenArchivedCount = mapQuery.data?.hiddenArchivedCount ?? 0

  function handleProjectChange(projectKey: string) {
    setSelectedId(null)
    onProjectChange(projectKey)
  }

  // The editor reports where a card should now be. The first move saves where every card is now,
  // so the arrangement stays as it is. Cards that are not on the map now (archived sessions) keep
  // their saved place, and a new session or subagent is placed afresh each time it appears.
  function handleNodeMove(nodeId: string, x: number, y: number) {
    if (!layout) return
    const next: NodePositions = {}
    for (const [id, position] of Object.entries(positions)) {
      if (id.startsWith('session:')) next[id] = position
    }
    for (const node of layout.nodes) next[node.id] = { x: node.x, y: node.y }
    next[nodeId] = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
    setPositions(next)
  }

  function handleResetLayout() {
    setPositions({})
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
            {hiddenArchivedCount} archived hidden
            <span className="mx-2 text-gray-700">|</span>
            {expiredSubagentsLabel(expiredSubagentTotal)}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={editMode}
          onClick={() => setEditMode((on) => !on)}
          className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
            editMode
              ? 'border-brand-500 bg-brand-500/15 text-brand-600'
              : 'border-gray-800 bg-gray-900 text-gray-300 hover:text-gray-100'
          }`}
        >
          {editMode ? 'Editing layout' : 'Edit layout'}
        </button>
        {editMode && (
          <button
            type="button"
            onClick={handleResetLayout}
            disabled={!hasCustomLayout}
            className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset layout
          </button>
        )}
        <button
          type="button"
          aria-pressed={panelsHidden}
          onClick={() => setPanelsHidden((hidden) => !hidden)}
          className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 hover:text-gray-100"
        >
          {panelsHidden ? 'Show panels' : 'Hide panels'}
        </button>
        <p className="text-xs text-gray-500">
          {editMode
            ? 'Drag a card to move it, drag empty space to pan, scroll to zoom. Arrow keys nudge a focused card. Your layout is saved on the server and follows you to other devices.'
            : 'Drag to pan, scroll to zoom.'}
        </p>
        {saveFailed && (
          <p role="alert" className="text-xs text-red-400">
            Could not save the layout. Trying again.
          </p>
        )}
      </div>

      <div className={`mt-3 grid gap-4 ${panelsHidden ? '' : 'lg:grid-cols-[minmax(0,1fr)_320px]'}`}>
        <section
          aria-label="Project map"
          className="h-[calc(100vh-18rem)] min-h-[28rem] min-w-0 overflow-hidden rounded-xl border border-gray-800 bg-gray-950"
        >
          {mapQuery.isLoading || layoutLoading ? (
            <div className="h-64 animate-pulse rounded-xl bg-gray-900/50" />
          ) : mapQuery.error ? (
            <p className="py-12 text-center text-sm text-red-400">
              Failed to load map: {mapQuery.error.message}
            </p>
          ) : layout && layout.nodes.length > 0 ? (
            <MapCanvas
              key={selectedKey}
              layout={layout}
              selectedId={selectedId}
              onSelect={setSelectedId}
              editMode={editMode}
              onNodeMove={handleNodeMove}
            />
          ) : (
            <p className="py-12 text-center text-sm text-gray-500">
              This project has no sessions yet.
            </p>
          )}
        </section>

        {!panelsHidden && (
          <div className="space-y-4">
            <NeedsYouPanel nodes={nodes} onSelect={setSelectedId} />
            <NodeDetailPanel node={selectedNode} projectKey={selectedKey} />
            <HookEventsPanel events={eventsQuery.data} />
          </div>
        )}
      </div>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-100">Session Map</h1>
      <p className="mt-1 text-sm text-gray-400">
        Sessions in a project, with the subagents they dispatched. Read-only: the editor only moves cards, and the arrangement is saved by the dashboard, not in your Claude config.
      </p>
      <p className="mt-2 text-xs text-gray-500">
        Messaging and linking sessions: Phase 2, see docs/session-map/README.md
      </p>
    </div>
  )
}
