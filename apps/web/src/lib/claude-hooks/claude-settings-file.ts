import * as fs from 'node:fs'
import * as path from 'node:path'
import { getClaudeDir } from '@/lib/utils/claude-path'
import { dataDir } from '@/lib/data-dir'
import { addStatusLine, foreignStatusLine, installedStatusLineCommand, removeStatusLine, statusLineCommand } from './claude-statusline'
import { addHook, hookCommands, installedCommand, isHookInstalled, removeHook, type HookCommands, type HookKind } from './claude-hooks'

/** How many copies of Claude's settings are kept from before the dashboard changed them. */
const KEEP_BACKUPS = 5

export interface HookState {
  /** The file the hooks live in. */
  settingsPath: string
  /** Whether the file exists and is valid JSON. An invalid file is never touched. */
  readable: boolean
  error: string | null
  notify: boolean
  start: boolean
  /** The commands that would be written for this copy of the app. */
  commands: HookCommands
  /** A hook is installed but its command is not the one this copy would write, such as after the app moved. */
  stale: { notify: boolean; start: boolean }
  /** Run from the installed app, as opposed to a source checkout. */
  installedApp: boolean
}

export function claudeSettingsPath(): string {
  return path.join(getClaudeDir(), 'settings.json')
}

function currentCommands(): HookCommands {
  return hookCommands({
    exePath: process.env.HOLDMYSESSION_EXE || null,
    appDir: process.env.HOLDMYSESSION_APP_DIR || process.cwd(),
  })
}

/** The parsed file: an empty object when there is none, and an error message when it is not valid JSON. */
function readFile(file: string): { settings: unknown; error: string | null } {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { settings: {}, error: null }
    return { settings: null, error: `Cannot read ${file}: ${(error as Error).message}` }
  }
  if (text.trim() === '') return { settings: {}, error: null }
  try {
    return { settings: JSON.parse(text), error: null }
  } catch {
    return { settings: null, error: `${file} is not valid JSON, so it was left alone. Fix it, or remove the stray comma or comment, and try again.` }
  }
}

export function readHookState(): HookState {
  const file = claudeSettingsPath()
  const { settings, error } = readFile(file)
  const commands = currentCommands()
  const installed = (kind: HookKind) => settings !== null && isHookInstalled(settings, kind)
  const stale = (kind: HookKind) => installed(kind) && installedCommand(settings, kind) !== commands[kind]
  return {
    settingsPath: file,
    readable: settings !== null,
    error,
    notify: installed('notify'),
    start: installed('start'),
    commands,
    stale: { notify: stale('notify'), start: stale('start') },
    installedApp: !!process.env.HOLDMYSESSION_EXE,
  }
}

function backUp(file: string): void {
  if (!fs.existsSync(file)) return
  const dir = path.join(dataDir(), 'claude-settings-backups')
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(file, path.join(dir, `settings-${new Date().toISOString().replace(/[:.]/g, '-')}.json`))
  const all = fs.readdirSync(dir).filter((n) => n.startsWith('settings-')).sort()
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) fs.rmSync(path.join(dir, old), { force: true })
}

/** Puts `next` in place of `settings` in the file, with a copy of the old file kept first and no half-written file on a crash. */
function writeIfChanged(file: string, settings: unknown, next: unknown): void {
  if (JSON.stringify(next) === JSON.stringify(settings)) return
  backUp(file)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.holdmysession.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', 'utf-8')
    fs.renameSync(tmp, file)
  } catch (e) {
    fs.rmSync(tmp, { force: true })
    throw new Error(`Could not write ${file}: ${(e as Error).message}`, { cause: e })
  }
}

/**
 * Adds or removes one of the dashboard's hooks in Claude's settings.json. The file is only
 * rewritten if it is valid JSON, a copy is kept in the dashboard's own folder first, and the new
 * file is put in place through a temporary file so a crash cannot leave half of it.
 */
export function setHook(kind: HookKind, enabled: boolean): HookState {
  const file = claudeSettingsPath()
  const { settings, error } = readFile(file)
  if (settings === null) throw new Error(error ?? 'Claude settings could not be read.')

  const next = enabled ? addHook(settings, kind, currentCommands()[kind]) : removeHook(settings, kind)
  writeIfChanged(file, settings, next)
  return readHookState()
}

// --- The status line, which carries the real subscription limits ---

export interface StatusLineState {
  settingsPath: string
  readable: boolean
  error: string | null
  /** Ours is the status line. */
  installed: boolean
  /** Ours is the status line, but with a command other than the one this copy would write, such as after the app moved. */
  stale: boolean
  /** Another status line is set, and would be kept and run by ours. */
  otherStatusLine: boolean
  /** The command that would be written for this copy of the app. */
  command: string
  installedApp: boolean
}

/** Where the status line that was there before ours is kept, for ours to run and for putting back. */
export function previousStatusLinePath(): string {
  return path.join(dataDir(), 'statusline-previous.json')
}

function currentStatusLineCommand(): string {
  return statusLineCommand({ exePath: process.env.HOLDMYSESSION_EXE || null, appDir: process.env.HOLDMYSESSION_APP_DIR || process.cwd() })
}

function readPrevious(): unknown {
  try {
    return JSON.parse(fs.readFileSync(previousStatusLinePath(), 'utf-8'))
  } catch {
    return null
  }
}

export function readStatusLineState(): StatusLineState {
  const { settings, error } = readFile(claudeSettingsPath())
  const command = currentStatusLineCommand()
  const installedCommand = settings === null ? null : installedStatusLineCommand(settings)
  return {
    settingsPath: claudeSettingsPath(),
    readable: settings !== null,
    error,
    installed: installedCommand !== null,
    stale: installedCommand !== null && installedCommand !== command,
    otherStatusLine: settings !== null && foreignStatusLine(settings) !== null,
    command,
    installedApp: !!process.env.HOLDMYSESSION_EXE,
  }
}

/**
 * Makes ours the status line, or puts the old one back. A status line that was already there is saved first,
 * in the dashboard's folder, and ours runs it with the same input so it looks the same. The file is only
 * rewritten if it is valid JSON, and a copy is kept first, as for the hooks.
 */
export function setStatusLine(enabled: boolean): StatusLineState {
  const file = claudeSettingsPath()
  const { settings, error } = readFile(file)
  if (settings === null) throw new Error(error ?? 'Claude settings could not be read.')

  if (enabled) {
    const other = foreignStatusLine(settings)
    if (other) {
      fs.mkdirSync(path.dirname(previousStatusLinePath()), { recursive: true })
      fs.writeFileSync(previousStatusLinePath(), JSON.stringify(other, null, 2), 'utf-8')
    }
    writeIfChanged(file, settings, addStatusLine(settings, currentStatusLineCommand()))
  } else {
    writeIfChanged(file, settings, removeStatusLine(settings, readPrevious()))
    fs.rmSync(previousStatusLinePath(), { force: true })
  }
  return readStatusLineState()
}
