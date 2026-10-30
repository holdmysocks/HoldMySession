import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { settingsQuery } from '@/features/settings/settings.queries'
import { SCRATCH_MODES, type ProjectsSetting, type ScratchMode } from '@/features/settings/settings.types'
import { Toggle } from '@/features/settings/Toggle'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { isProjectHidden } from '@/lib/projects/project-prefs'
import { machineProjectsQuery, useSaveProjectPrefs } from './projects.queries'

const SCRATCH_OPTIONS: Record<ScratchMode, { label: string; text: string }> = {
  group: { label: 'Group as Unlinked Sessions', text: 'Scratch folders and sessions with no folder become one entry.' },
  show: { label: 'List each scratch folder', text: 'Every scratch folder is listed as if it were a project.' },
  hide: { label: 'Hide', text: 'Left out of project lists and dropdowns.' },
}

export function ProjectsPanel() {
  const { data: settings } = useQuery(settingsQuery)
  const { data: machines } = useQuery(machineProjectsQuery)
  const save = useSaveProjectPrefs()
  const { privacyMode, anonymizeProjectName } = usePrivacy()
  const [filter, setFilter] = useState('')

  if (!settings) return null
  const prefs = settings.projects
  const change = (next: Partial<ProjectsSetting>) => save.mutate({ data: { ...prefs, ...next } })
  const toggleProject = (machineId: string, projectPath: string, shown: boolean) =>
    change({
      hidden: shown
        ? prefs.hidden.filter((h) => !(h.machineId === machineId && h.projectPath === projectPath))
        : [...prefs.hidden, { machineId, projectPath }],
    })

  const several = (machines?.length ?? 0) > 1
  const q = filter.trim().toLowerCase()

  return (
    <div className="space-y-6">
      <p className="text-[10px] text-gray-500">
        These choices only change which projects the lists and dropdowns show. Everything a hidden project used is still
        counted in every total, chart and cost.
      </p>

      <section>
        <h2 className="text-sm font-semibold text-gray-300">Scratch sessions</h2>
        <p className="mt-1 text-[10px] text-gray-500">
          Sessions that ran in a folder whose name starts with "scratch", or in no folder at all.
        </p>
        <div className="mt-3 space-y-3 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          <div role="radiogroup" aria-label="Scratch sessions" className="space-y-2">
            {SCRATCH_MODES.map((mode) => (
              <label key={mode} className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="radio"
                  name="scratch-mode"
                  checked={prefs.scratch === mode}
                  onChange={() => change({ scratch: mode })}
                  className="mt-0.5 accent-brand-500"
                />
                <span>
                  <span className="text-gray-200">{SCRATCH_OPTIONS[mode].label}</span>
                  <span className="block text-[10px] text-gray-500">{SCRATCH_OPTIONS[mode].text}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-gray-800 pt-3">
            <div className="text-xs">
              <p className="text-gray-200">Show scratch sessions by their session name</p>
              <p className="text-[10px] text-gray-500">In the Sessions list, name them by what the session is called instead of the folder.</p>
            </div>
            <Toggle on={prefs.scratchByName} onChange={(on) => change({ scratchByName: on })} label="Show scratch sessions by session name" disabled={prefs.scratch === 'hide'} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-300">Projects found on {several ? 'your machines' : 'this computer'}</h2>
        <p className="mt-1 text-[10px] text-gray-500">Untick a project to hide it from lists and dropdowns{several ? ', per machine' : ''}.</p>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter projects"
          aria-label="Filter projects"
          className="mt-3 w-full max-w-xs rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 outline-none focus:border-brand-500"
        />
        <div className="mt-3 space-y-3">
          {!machines && <div className="h-24 animate-pulse rounded-xl bg-gray-900/50" />}
          {machines?.map((machine) => {
            const projects = machine.projects.filter((p) => !q || p.displayName.toLowerCase().includes(q) || p.projectPath.toLowerCase().includes(q))
            const hiddenHere = machine.projects.filter((p) => isProjectHidden(prefs, machine.machineId, p.projectPath)).length
            return (
              <div key={machine.machineId} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                {several && (
                  <p className="mb-2 text-xs font-medium text-gray-200">
                    {machine.name}
                    {machine.isSelf && <span className="ml-1 text-gray-500">(this machine)</span>}
                    <span className="ml-2 text-[10px] font-normal text-gray-500">{hiddenHere} hidden</span>
                  </p>
                )}
                {projects.length === 0 && <p className="text-xs text-gray-500">{machine.projects.length === 0 ? 'No projects found yet.' : 'No project matches.'}</p>}
                <ul className="divide-y divide-gray-800/60">
                  {projects.map((p) => {
                    const shown = !isProjectHidden(prefs, machine.machineId, p.projectPath)
                    return (
                      <li key={p.projectPath}>
                        <label className="flex cursor-pointer items-center gap-3 py-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={shown}
                            onChange={(e) => toggleProject(machine.machineId, p.projectPath, e.target.checked)}
                            className="accent-brand-500"
                            aria-label={`Show ${p.displayName}`}
                          />
                          <span className={`min-w-0 flex-1 truncate ${shown ? 'text-gray-200' : 'text-gray-500 line-through'}`}>
                            {privacyMode ? anonymizeProjectName(p.displayName) : p.displayName}
                            {!privacyMode && <span className="ml-2 font-mono text-[10px] text-gray-600">{p.projectPath}</span>}
                          </span>
                          <span className="shrink-0 text-[10px] text-gray-500">{p.sessionCount} {p.sessionCount === 1 ? 'session' : 'sessions'}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
        {save.isError && <p role="alert" className="mt-2 text-xs text-red-400">Could not save: {save.error.message}</p>}
      </section>
    </div>
  )
}
