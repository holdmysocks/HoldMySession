import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { applyCustomPositions, layoutProjectMap, type NodePositions } from '@/lib/map/layout'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { mapProjectValue, type MapProject } from './project-map.api'
import { mapProjectsQuery, projectMapQuery, hookEventsQuery } from './project-map.queries'
import { MapCanvas, type NodeMove } from './MapCanvas'
import { NeedsYouPanel } from './NeedsYouPanel'
import { NodeDetailPanel } from './NodeDetailPanel'
import { HookEventsPanel } from './HookEventsPanel'
import { expiredSubagentsLabel } from './format-node'
import { useMapLayout } from './use-map-layout'
import { useMachineScope } from '@/features/link/useMachineScope'

interface ProjectMapPageProps {
  /** Project key (directory name), from the URL. */
  project: string | undefined
  onProjectChange: (projectKey: string) => void
}

export function ProjectMapPage({ project, onProjectChange }: ProjectMapPageProps) {
  const { privacyMode, anonymizeProjectName, anonymizePath } = usePrivacy()
  const scope = useMachineScope()
  // With a node chosen the list is that node's. With all machines it holds every connected machine's projects.
  const projectsQuery = useQuery(mapProjectsQuery(scope.isRemote ? scope.machineId : undefined))
  const projects = projectsQuery.data ?? []

  // A project in the URL that is not in the dropdown (hidden, or one that is gone) shows the first one.
  const selectedValue = projects.some((p) => mapProjectValue(p) === project) ? project! : (projects[0] ? mapProjectValue(projects[0]) : '')
  const selectedProject = projects.find((p) => mapProjectValue(p) === selectedValue) ?? null
  const selectedKey = selectedProject?.projectKey ?? ''
  // The project's own machine answers while this page is open. This computer's projects carry no machine.
  const machineId = selectedProject?.machineId
  const mapQuery = useQuery(projectMapQuery(selectedKey, machineId))
  const eventsQuery = useQuery(hookEventsQuery(machineId))

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [panelsHidden, setPanelsHidden] = useState(false)
  // In editor mode cards snap to a grid. Holding Alt while dragging places one freely.
  const [snapToGrid, setSnapToGrid] = useState(true)
  // Card positions from the editor. They belong to a project and are saved on the server.
  const { positions, setPositions, isLoading: layoutLoading, saveFailed } = useMapLayout(selectedValue)

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
  const firstNeedsYou = sessionNodes.find((n) => n.status === 'needs-you')
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
  function handleNodesMove(moves: NodeMove[]) {
    if (!layout) return
    const next: NodePositions = {}
    for (const [id, position] of Object.entries(positions)) {
      if (id.startsWith('session:')) next[id] = position
    }
    for (const node of layout.nodes) next[node.id] = { x: node.x, y: node.y }
    for (const move of moves) next[move.id] = { x: Math.round(move.x * 10) / 10, y: Math.round(move.y * 10) / 10 }
    setPositions(next)
  }

  function handleResetLayout() {
    setPositions({})
  }

  if (projectsQuery.isLoading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-gray-900" />
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

  // With several machines the dropdown groups projects under the machine they are on.
  const machineGroups = groupByMachine(projects)

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
            value={selectedValue}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="max-w-xs rounded-full border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm text-gray-100 focus:border-brand-500 focus:outline-none"
          >
            {machineGroups.map((group) => {
              const options = group.projects.map((p) => (
                <option key={mapProjectValue(p)} value={mapProjectValue(p)}>
                  {privacyMode ? anonymizeProjectName(p.projectDisplayName) : p.projectDisplayName} ({p.sessionCount})
                </option>
              ))
              return group.name ? <optgroup key={group.name} label={group.name}>{options}</optgroup> : options
            })}
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
          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
            editMode
              ? 'border-brand-500 bg-brand-500/15 text-brand-600'
              : 'border-gray-800 bg-gray-900 text-gray-300 hover:text-gray-100'
          }`}
        >
          {editMode ? 'Editing layout' : 'Edit layout'}
        </button>
        {editMode && (
          <label className="flex items-center gap-1.5 rounded-full border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={snapToGrid}
              onChange={(e) => setSnapToGrid(e.target.checked)}
              className="accent-brand-500"
            />
            Snap to grid
          </label>
        )}
        {editMode && (
          <button
            type="button"
            onClick={handleResetLayout}
            disabled={!hasCustomLayout}
            className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset layout
          </button>
        )}
        <button
          type="button"
          aria-pressed={panelsHidden}
          onClick={() => setPanelsHidden((hidden) => !hidden)}
          className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 hover:text-gray-100"
        >
          {panelsHidden ? 'Show panels' : 'Hide panels'}
        </button>
        <p className="text-xs text-gray-500">
          {editMode
            ? 'Drag a card to move it. It snaps to the grid, and holding Alt places it freely. Ctrl-click cards, or hold Ctrl and drag over empty space, to select several and move them together. Drag empty space to pan, scroll to zoom, arrow keys nudge. Your layout is saved on the server and follows you to other devices.'
            : 'Drag to pan, scroll to zoom.'}
        </p>
        {saveFailed && (
          <p role="alert" className="text-xs text-red-400">
            Could not save the layout. Trying again.
          </p>
        )}
      </div>

      <div className="mt-3">
        <section
          aria-label="Project map"
          className={`relative min-w-0 overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 ${
            panelsHidden ? 'h-[calc(100vh-18rem)] min-h-[28rem]' : 'h-[calc(100vh-24rem)] min-h-[22rem]'
          }`}
        >
          {needsYouCount > 0 && firstNeedsYou && (
            <button
              type="button"
              onClick={() => setSelectedId(firstNeedsYou.id)}
              className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-yellow-400 bg-gray-900/90 px-3 py-1.5 text-xs font-medium text-yellow-300 shadow-lg"
            >
              <span className="h-2 w-2 rounded-full bg-yellow-400" />
              {needsYouCount === 1 ? '1 session needs you' : `${needsYouCount} sessions need you`}
            </button>
          )}
          {mapQuery.isLoading || layoutLoading ? (
            <div className="h-64 animate-pulse rounded-2xl bg-gray-900" />
          ) : mapQuery.error ? (
            <p className="py-12 text-center text-sm text-red-400">
              Failed to load map: {mapQuery.error.message}
            </p>
          ) : layout && layout.nodes.length > 0 ? (
            <MapCanvas
              key={selectedValue}
              layout={layout}
              selectedId={selectedId}
              onSelect={setSelectedId}
              editMode={editMode}
              onNodesMove={handleNodesMove}
              snapToGrid={snapToGrid}
            />
          ) : (
            <p className="py-12 text-center text-sm text-gray-500">
              This project has no sessions yet.
            </p>
          )}
        </section>

        {!panelsHidden && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <NeedsYouPanel nodes={nodes} onSelect={setSelectedId} selectedId={selectedId} />
              <NodeDetailPanel node={selectedNode} projectKey={selectedKey} machineId={machineId} />
            </div>
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
      <h1 className="font-display text-3xl font-extrabold text-gray-100">Session Map</h1>
      <p className="mt-1 text-sm text-gray-400">
        Sessions in a project, with the subagents they dispatched. Read-only: the editor only moves cards, and the arrangement is saved by the dashboard, not in your Claude config.
      </p>
      <p className="mt-2 text-xs text-gray-500">
        Messaging and linking sessions: Phase 2, see docs/session-map/README.md
      </p>
    </div>
  )
}

/** Projects grouped under their machine's name, in the order the machines first appear. No name when machines are not marked. */
function groupByMachine(projects: MapProject[]): Array<{ name: string; projects: MapProject[] }> {
  const groups = new Map<string, MapProject[]>()
  for (const p of projects) groups.set(p.machineName ?? '', [...(groups.get(p.machineName ?? '') ?? []), p])
  return [...groups].map(([name, list]) => ({ name, projects: list }))
}
