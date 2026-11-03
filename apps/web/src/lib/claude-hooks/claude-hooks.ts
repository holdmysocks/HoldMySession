/**
 * The two Claude Code hooks HoldMySession can add to ~/.claude/settings.json, and how to find, add
 * and remove them without touching anything else in the file. All of it is pure: it takes the
 * parsed settings and returns new settings. The file itself is read and written in
 * claude-settings-file.ts.
 *
 * - notify: Notification and Stop events, which feed the "Needs you" panel and recent events.
 * - start: SessionStart, which starts HoldMySession if it is not already running.
 */
export type HookKind = 'notify' | 'start'

export const HOOK_EVENTS: Record<HookKind, string[]> = {
  notify: ['Notification', 'Stop'],
  start: ['SessionStart'],
}

/** Words that mark a hook command as ours. The installed app uses the flags, a source checkout the script names. */
const MARKERS: Record<HookKind, string[]> = {
  notify: ['--holdmysession-notify', 'holdmysession-hook'],
  start: ['--holdmysession-start', 'ensure-running'],
}

/** The hook commands for how this copy is run: the installed app's program, or node and the scripts of a checkout. */
export interface HookCommands {
  notify: string
  start: string
}

const slash = (p: string) => p.replace(/\\/g, '/')

export function hookCommands(opts: { exePath?: string | null; appDir: string; platform?: string }): HookCommands {
  if (opts.exePath) {
    const exe = `"${slash(opts.exePath)}"`
    const start = `${exe} --holdmysession-start`
    // On a Mac, running the program for every event would flash its Dock icon each time. Run as plain Node, it never
    // starts the app. The shell on a Mac takes the variable in front of the command. (On Windows it might not.)
    if (opts.platform === 'darwin') return { notify: `ELECTRON_RUN_AS_NODE=1 ${exe} "${slash(opts.appDir)}/bin/holdmysession-hook.mjs"`, start }
    return { notify: `${exe} --holdmysession-notify`, start }
  }
  const bin = slash(opts.appDir) + '/bin'
  return { notify: `node "${bin}/holdmysession-hook.mjs"`, start: `node "${bin}/ensure-running.mjs"` }
}

type Json = Record<string, unknown>
interface HookEntry {
  type?: unknown
  command?: unknown
  [key: string]: unknown
}
interface HookGroup {
  matcher?: unknown
  hooks?: unknown
  [key: string]: unknown
}

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function isOurs(kind: HookKind, entry: unknown): boolean {
  if (!isObject(entry) || typeof (entry as HookEntry).command !== 'string') return false
  const command = (entry as HookEntry).command as string
  return MARKERS[kind].some((m) => command.includes(m))
}

function groupsOf(settings: Json, event: string): HookGroup[] {
  const hooks = settings.hooks
  if (!isObject(hooks)) return []
  const groups = hooks[event]
  return Array.isArray(groups) ? (groups as HookGroup[]) : []
}

/** Whether every event of a hook has one of our commands. */
export function isHookInstalled(settings: unknown, kind: HookKind): boolean {
  if (!isObject(settings)) return false
  return HOOK_EVENTS[kind].every((event) =>
    groupsOf(settings, event).some((g) => isObject(g) && Array.isArray(g.hooks) && g.hooks.some((h) => isOurs(kind, h))),
  )
}

/** The command a hook currently uses in the file, or null if it is not installed. */
export function installedCommand(settings: unknown, kind: HookKind): string | null {
  if (!isObject(settings)) return null
  for (const event of HOOK_EVENTS[kind]) {
    for (const g of groupsOf(settings, event)) {
      if (!isObject(g) || !Array.isArray(g.hooks)) continue
      const found = g.hooks.find((h) => isOurs(kind, h))
      if (found) return String((found as HookEntry).command)
    }
  }
  return null
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/**
 * Settings with the hook added to each of its events. A command of ours that is already there is
 * updated in place, so a moved or updated install fixes its own path instead of adding a second one.
 * Everything else in the settings, including other hooks on the same events, is kept as it was.
 */
export function addHook(settings: unknown, kind: HookKind, command: string): Json {
  const next = isObject(settings) ? clone(settings) : {}
  const hooks: Json = isObject(next.hooks) ? (next.hooks as Json) : {}
  next.hooks = hooks
  for (const event of HOOK_EVENTS[kind]) {
    const groups: HookGroup[] = Array.isArray(hooks[event]) ? (hooks[event] as HookGroup[]) : []
    let updated = false
    for (const g of groups) {
      if (!isObject(g) || !Array.isArray(g.hooks)) continue
      for (const h of g.hooks as HookEntry[]) {
        if (isOurs(kind, h)) {
          h.command = command
          h.type = 'command'
          updated = true
        }
      }
    }
    if (!updated) groups.push({ hooks: [{ type: 'command', command }] })
    hooks[event] = groups
  }
  return next
}

/** Settings without our hook. Other hooks stay, and an event or group left empty by this is dropped. */
export function removeHook(settings: unknown, kind: HookKind): Json {
  const next = isObject(settings) ? clone(settings) : {}
  if (!isObject(next.hooks)) return next
  const hooks = next.hooks as Json
  for (const event of HOOK_EVENTS[kind]) {
    if (!Array.isArray(hooks[event])) continue
    const kept: HookGroup[] = []
    for (const g of hooks[event] as HookGroup[]) {
      if (!isObject(g) || !Array.isArray(g.hooks)) {
        kept.push(g)
        continue
      }
      const remaining = (g.hooks as HookEntry[]).filter((h) => !isOurs(kind, h))
      if (remaining.length === (g.hooks as HookEntry[]).length) kept.push(g)
      else if (remaining.length > 0) kept.push({ ...g, hooks: remaining })
    }
    if (kept.length > 0) hooks[event] = kept
    else delete hooks[event]
  }
  if (Object.keys(hooks).length === 0) delete next.hooks
  return next
}
