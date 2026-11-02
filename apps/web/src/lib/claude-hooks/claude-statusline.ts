/**
 * The status line command HoldMySession can set in ~/.claude/settings.json so Claude Code hands it the real
 * subscription limits. Claude Code allows one status line, so a status line that was already there is kept:
 * it is saved, run by ours with the same input, and put back when ours is removed. Pure: it takes the parsed
 * settings and returns new settings. The files are read and written in claude-settings-file.ts.
 */
type Json = Record<string, unknown>

/** Words that mark a status line command as ours. The installed app uses the flag, a source checkout the script name. */
const MARKERS = ['--holdmysession-statusline', 'holdmysession-statusline']

const slash = (p: string) => p.replace(/\\/g, '/')
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

export function statusLineCommand(opts: { exePath?: string | null; appDir: string; platform?: string }): string {
  // On a Mac it runs after every answer, so it runs as plain Node and never starts the app, which would flash its Dock icon.
  if (opts.exePath && opts.platform === 'darwin') return `ELECTRON_RUN_AS_NODE=1 "${slash(opts.exePath)}" "${slash(opts.appDir)}/bin/holdmysession-statusline.mjs"`
  if (opts.exePath) return `"${slash(opts.exePath)}" --holdmysession-statusline`
  return `node "${slash(opts.appDir)}/bin/holdmysession-statusline.mjs"`
}

/** Whether a status line entry is ours. */
export function isOurStatusLine(entry: unknown): boolean {
  return isObject(entry) && typeof entry.command === 'string' && MARKERS.some((m) => (entry.command as string).includes(m))
}

export function statusLineOf(settings: unknown): Json | null {
  return isObject(settings) && isObject(settings.statusLine) ? (settings.statusLine as Json) : null
}

/** The command ours currently uses in the file, or null when the status line is not ours. */
export function installedStatusLineCommand(settings: unknown): string | null {
  const entry = statusLineOf(settings)
  return entry && isOurStatusLine(entry) ? String(entry.command) : null
}

/** A status line of someone else's: the one to keep and run. Null when there is none, or it is already ours. */
export function foreignStatusLine(settings: unknown): Json | null {
  const entry = statusLineOf(settings)
  return entry && !isOurStatusLine(entry) ? clone(entry) : null
}

/** Settings with ours as the status line. Anything else in the file stays; `padding` of the old one is kept. */
export function addStatusLine(settings: unknown, command: string): Json {
  const next = isObject(settings) ? clone(settings) : {}
  const old = statusLineOf(next)
  next.statusLine = { ...(old && !isOurStatusLine(old) && typeof old.padding === 'number' ? { padding: old.padding } : {}), type: 'command', command }
  return next
}

/**
 * Settings without ours. The status line that was there before comes back exactly as it was, or the entry
 * goes if there was none. A status line that is not ours is never touched.
 */
export function removeStatusLine(settings: unknown, previous: unknown): Json {
  const next = isObject(settings) ? clone(settings) : {}
  if (!isOurStatusLine(next.statusLine)) return next
  if (isObject(previous) && typeof previous.command === 'string' && previous.command !== '') next.statusLine = clone(previous)
  else delete next.statusLine
  return next
}
