import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { applyCustomPositions, layoutProjectMap, type NodePositions } from '@/lib/map/layout'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { mapProjectValue, type MapProject } from './project-map.api'
import { mapProjectsQuery, projectMapQuery, hookEventsQuery } from './project-map.queries'
import { MapCanvas, type NodeMove } from './MapCanvas'
import { NeedsYouPanel, waitingFor, waitingNodes } from './NeedsYouPanel'
import { NodeDetailPanel } from './NodeDetailPanel'
import { HookEventsPanel } from './HookEventsPanel'
import { expiredSubagentsLabel } from './format-node'
import { useMapLayout } from './use-map-layout'
import { useNow } from '@/features/sessions/useNow'
import { useMachineScope } from '@/features/link/useMachineScope'

interface ProjectMapPageProps {
  /** Project key (directory name), from the URL. */
  project: string | undefined
  onProjectChange: (projectKey: string) => void
}

export function ProjectMapPage({ project, onProjectChange }: ProjectMapPageProps) {
  const { privacyMode, anonymizeProjectName, anonymizePath, anonymizeSessionName } = usePrivacy()
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

  const now = useNow()
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

  const waiting = waitingNodes(nodes)
  const projectTitle = selectedProject
    ? privacyMode
      ? anonymizeProjectName(selectedProject.projectDisplayName)
      : selectedProject.projectDisplayName
    : 'Session Map'
  const first = waiting[0]
  const nextWaiting = () => {
    if (waiting.length === 0) return
    const at = waiting.findIndex((n) => n.id === selectedId)
    setSelectedId(waiting[(at + 1) % waiting.length].id)
  }
  const pill =
    'inline-flex min-h-11 items-center rounded-full border border-[color:var(--hms-line)] bg-transparent px-[18px] font-medium text-gray-100 hover:border-gray-500'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 truncate font-display text-[44px] font-bold leading-[1.05]">{projectTitle}</h1>
          <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-[color:var(--hms-mute)]">
            <span><span style={{ color: '#3DDC84' }}>●</span> {activeCount} running</span>
            <span><span style={{ color: '#FFC83D' }}>●</span> {needsYouCount} need you</span>
            {selectedProject && <span className="font-mono">{displayPath}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative flex items-center">
            <span className="sr-only">Project</span>
            <select
              value={selectedValue}
              onChange={(e) => handleProjectChange(e.target.value)}
              className={`${pill} max-w-[260px] appearance-none pr-9`}
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
            <span aria-hidden="true" className="pointer-events-none absolute right-4 text-[11px]">▾</span>
          </label>
          <button type="button" aria-pressed={editMode} onClick={() => setEditMode((on) => !on)} className={`${pill} ${editMode ? 'border-brand-400 text-brand-400' : ''}`}>
            {editMode ? 'Editing layout' : 'Edit layout'}
          </button>
          {editMode && (
            <label className={`${pill} gap-1.5 text-sm`}>
              <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} className="accent-brand-400" />
              Snap to grid
            </label>
          )}
          {editMode && (
            <button type="button" onClick={handleResetLayout} disabled={!hasCustomLayout} className={`${pill} disabled:cursor-not-allowed disabled:opacity-40`}>
              Reset layout
            </button>
          )}
          <button type="button" aria-pressed={panelsHidden} onClick={() => setPanelsHidden((hidden) => !hidden)} className={pill}>
            {panelsHidden ? 'Show panels' : 'Hide panels'}
          </button>
        </div>
      </div>
      {(editMode || saveFailed) && (
        <p className="-mt-2 text-xs text-[color:var(--hms-mute)]">
          {editMode
            ? 'Drag a card to move it. It snaps to the grid, and holding Alt places it freely. Ctrl-click cards, or hold Ctrl and drag over empty space, to select several and move them together. Drag empty space to pan, scroll to zoom, arrow keys nudge. Your layout is saved on the server and follows you to other devices.'
            : ''}
          {saveFailed && <span role="alert" className="ml-2 text-red-400">Could not save the layout. Trying again.</span>}
        </p>
      )}

      <section
        aria-label="Project map"
        className={`relative min-w-0 overflow-hidden rounded-[32px] border border-[color:var(--hms-rule)] ${
          panelsHidden ? 'h-[calc(100vh-18rem)] min-h-[28rem]' : 'h-[calc(100vh-24rem)] min-h-[24rem]'
        }`}
        style={{ background: 'radial-gradient(500px 260px at 40% 20%, var(--hms-glow), transparent), var(--color-gray-900)' }}
      >
        {mapQuery.isLoading || layoutLoading ? (
          <div className="h-64 animate-pulse rounded-2xl bg-gray-900" />
        ) : mapQuery.error ? (
          <p className="py-12 text-center text-sm text-red-400">Failed to load map: {mapQuery.error.message}</p>
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
          <p className="py-12 text-center text-sm text-gray-500">This project has no sessions yet.</p>
        )}

        {first && (
          <button
            type="button"
            onClick={() => setSelectedId(first.id)}
            className="status-pulse-needs-you absolute bottom-4 left-4 flex max-w-[calc(100%-330px)] flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[22px] border-2 border-[#FFE9A8] px-[18px] py-2.5 text-left text-[#241600] max-md:max-w-[calc(100%-2rem)] max-md:bottom-20"
            style={{ background: 'linear-gradient(160deg, #FFD25A, #F5A623)' }}
          >
            <span className="whitespace-nowrap rounded-full bg-[#241600] px-2.5 py-[3px] text-[11px] font-bold tracking-[0.06em] text-[#FFD25A]">
              {waiting.length} NEED YOU
            </span>
            <span className="min-w-0 font-semibold">
              {privacyMode ? anonymizeSessionName(first.title) : first.title}
              {first.pendingQuestions.length > 0 ? ' asked you a question' : ' is waiting on you'}{' '}
              <span className="font-normal text-[#4A3200]">
                · {waitingFor(first, now)}
                {waiting.length > 1 ? `, and ${waiting.length - 1} more` : ''}
              </span>
            </span>
            <span className="inline-flex min-h-11 items-center rounded-full bg-[#241600] px-[18px] font-semibold text-[#FFD25A]">Review first</span>
          </button>
        )}
      </section>

      {!panelsHidden && (
        <>
          <div className="flex flex-wrap items-stretch gap-6">
            <NeedsYouPanel nodes={nodes} onSelect={setSelectedId} selectedId={selectedId} />
            <NodeDetailPanel
              node={selectedNode}
              projectKey={selectedKey}
              machineId={machineId}
              onNext={waiting.length > 1 ? nextWaiting : undefined}
            />
          </div>
          <HookEventsPanel events={eventsQuery.data} />
        </>
      )}

      <p className="text-xs text-[color:var(--hms-mute)]">
        {hiddenNoProjectCount} hidden (no project) · {hiddenArchivedCount} archived hidden · {expiredSubagentsLabel(expiredSubagentTotal)}
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
