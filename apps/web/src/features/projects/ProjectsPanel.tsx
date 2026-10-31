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

  const total = machines?.reduce((n, m) => n + m.projects.length, 0) ?? 0

  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Scratch sessions">
        <h2 className="font-display text-[22px] font-semibold">Scratch sessions</h2>
        <p className="mb-2 mt-1 text-[color:var(--hms-mute)]">
          Sessions in a folder whose name starts with "scratch", or in no folder at all. This only changes lists and dropdowns. Their usage is always counted.
        </p>
        <div role="radiogroup" aria-label="Scratch sessions">
          {SCRATCH_MODES.map((mode) => {
            const on = prefs.scratch === mode
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => change({ scratch: mode })}
                className="flex w-full items-center gap-4 border-b border-[color:var(--hms-rule)] py-4 text-left"
              >
                <span
                  className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border-2 ${on ? 'border-brand-400' : 'border-[color:var(--hms-line)]'}`}
                >
                  {on && <span className="h-2.5 w-2.5 rounded-full bg-brand-400" />}
                </span>
                <span>
                  <span className="block font-semibold">{SCRATCH_OPTIONS[mode].label}</span>
                  <span className="block text-[13px] text-[color:var(--hms-mute)]">{SCRATCH_OPTIONS[mode].text}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section aria-label="Projects found">
        <h2 className="font-display text-[22px] font-semibold">Projects found</h2>
        <p className="mb-2 mt-1 text-[color:var(--hms-mute)]">Untick a project to hide it from lists and dropdowns{several ? ', per machine' : ''}.</p>
        {total > 8 && (
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter projects"
            aria-label="Filter projects"
            className="mb-2 min-h-11 w-full max-w-xs rounded-full border border-[color:var(--hms-line)] bg-transparent px-[18px] text-sm text-gray-100 placeholder-[color:var(--hms-mute)] outline-none focus:border-brand-400"
          />
        )}
        {!machines && <div className="h-24 animate-pulse rounded-2xl bg-gray-900" />}
        {machines?.map((machine) => {
          const projects = machine.projects.filter((p) => !q || p.displayName.toLowerCase().includes(q) || p.projectPath.toLowerCase().includes(q))
          return (
            <div key={machine.machineId} className="mt-3">
              <div className="py-2 text-[13px] font-semibold text-brand-400">
                {machine.name}
                {machine.isSelf && ' (this machine)'}
              </div>
              {projects.length === 0 && (
                <p className="py-2 text-sm text-[color:var(--hms-mute)]">{machine.projects.length === 0 ? 'No projects found yet.' : 'No project matches.'}</p>
              )}
              {projects.map((p) => {
                const shown = !isProjectHidden(prefs, machine.machineId, p.projectPath)
                return (
                  <label key={p.projectPath} className="flex cursor-pointer items-center gap-4 border-b border-[color:var(--hms-rule)] py-3">
                    <input
                      type="checkbox"
                      checked={shown}
                      onChange={(e) => toggleProject(machine.machineId, p.projectPath, e.target.checked)}
                      aria-label={`Show ${p.displayName}`}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-md border-[1.5px] text-xs peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand-400 ${
                        shown ? 'border-brand-400 text-brand-400' : 'border-[color:var(--hms-line)]'
                      }`}
                    >
                      {shown && '✓'}
                    </span>
                    <span className={`min-w-0 flex-1 truncate ${shown ? '' : 'text-[color:var(--hms-mute)] line-through'}`}>
                      {privacyMode ? anonymizeProjectName(p.displayName) : p.displayName}
                      {!privacyMode && <span className="ml-3 font-mono text-xs text-[color:var(--hms-mute)]">{p.projectPath}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-[color:var(--hms-mute)]">
                      {p.sessionCount} {p.sessionCount === 1 ? 'session' : 'sessions'}
                    </span>
                  </label>
                )
              })}
            </div>
          )
        })}
        {save.isError && <p role="alert" className="mt-2 text-sm text-red-400">Could not save: {save.error.message}</p>}
      </section>

      <section className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-[color:var(--hms-rule)] py-[18px]">
        <div>
          <h2 className="text-base font-semibold">Show scratch sessions by their session name</h2>
          <p className="text-[13px] text-[color:var(--hms-mute)]">In the Sessions list, name them by what the session is called instead of the folder.</p>
        </div>
        <Toggle on={prefs.scratchByName} onChange={(on) => change({ scratchByName: on })} label="Show scratch sessions by session name" disabled={prefs.scratch === 'hide'} />
      </section>
    </div>
  )
}
