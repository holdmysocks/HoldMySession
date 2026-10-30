/**
 * Which sessions and projects the lists show, from the Projects settings. Pure, so the server and
 * the browser agree. These rules only shape lists and dropdowns. Totals, charts and costs always
 * count every session, so hiding a project never changes what was used.
 */
import { UNLINKED_PROJECT_KEY, UNLINKED_PROJECT_NAME, isUnlinkedSession, type UnlinkedCandidate } from './unlinked'
import type { ProjectsSetting, ScratchMode } from '@/features/settings/settings.types'

export type ProjectPrefs = ProjectsSetting

export const DEFAULT_PROJECT_PREFS: ProjectPrefs = { scratch: 'group', scratchByName: false, hidden: [] }

export interface PrefsSession extends UnlinkedCandidate {
  projectPath: string
  sessionName?: string | null
  projectDisplayName?: string
}

export function hiddenKey(machineId: string, projectPath: string): string {
  return `${machineId}\u0000${projectPath}`
}

export function isProjectHidden(prefs: ProjectPrefs, machineId: string, projectPath: string): boolean {
  return prefs.hidden.some((h) => h.machineId === machineId && h.projectPath === projectPath)
}

/**
 * The sessions a list shows. `machineOf` says which machine a session is from (the id of this
 * computer for its own). Scratch sessions go when the mode is "hide", and the projects the user hid go always.
 */
export function visibleInLists<T extends PrefsSession>(
  sessions: T[],
  prefs: ProjectPrefs,
  machineOf: (session: T) => string,
): T[] {
  const hidden = new Set(prefs.hidden.map((h) => hiddenKey(h.machineId, h.projectPath)))
  return sessions.filter((s) => {
    if (prefs.scratch === 'hide' && isUnlinkedSession(s)) return false
    return !hidden.has(hiddenKey(machineOf(s), s.projectPath))
  })
}

/**
 * Names scratch sessions for a list: by their session name when asked, otherwise as "Unlinked
 * Sessions" when they are grouped. Other sessions are returned as they are.
 */
export function labelScratch<T extends PrefsSession & { projectDisplayName: string }>(
  sessions: T[],
  prefs: ProjectPrefs,
): T[] {
  if (prefs.scratch === 'show' && !prefs.scratchByName) return sessions
  return sessions.map((s) => {
    if (!isUnlinkedSession(s)) return s
    const named = prefs.scratchByName && s.sessionName?.trim()
    if (named) return { ...s, projectDisplayName: named }
    return prefs.scratch === 'group' ? { ...s, projectDisplayName: UNLINKED_PROJECT_NAME } : s
  })
}

/** What a session's project is called in a project dropdown: one shared key for the group, else its folder name. */
export function dropdownKey(session: UnlinkedCandidate, scratch: ScratchMode): string {
  return scratch === 'group' && isUnlinkedSession(session) ? UNLINKED_PROJECT_KEY : session.projectName
}
