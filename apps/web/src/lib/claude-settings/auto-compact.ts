import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getClaudeDir } from '../utils/claude-path'
import { normalizeModelKey } from '../parsers/context-limit'

/**
 * The auto-compact window a user set in Claude Code, with `/autocompact` or in settings.json. It is
 * the number of tokens at which a conversation is compacted, so it is the window the user chose to
 * work in, often smaller than the model's. Read-only.
 *
 * It comes in two forms, both in a settings file: `modelSettings.<model>.autoCompactWindow` for one
 * model, and a top-level `autoCompactWindow` for every model. Claude Code looks in the project's
 * `.claude/settings.local.json`, then the project's `.claude/settings.json`, then the user's
 * settings.json. In each file a model's own value wins over the file's general one, and the first
 * file with either decides. Values outside 100,000 to 1,000,000 are ignored, as Claude Code does.
 */

export const MIN_AUTO_COMPACT_WINDOW = 100_000
export const MAX_AUTO_COMPACT_WINDOW = 1_000_000

/** A usable window: a whole number, or text holding one, within the range Claude Code accepts. Else null. */
export function validAutoCompactWindow(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : NaN
  return Number.isInteger(number) && number >= MIN_AUTO_COMPACT_WINDOW && number <= MAX_AUTO_COMPACT_WINDOW ? number : null
}

/**
 * The window for `modelName` from settings objects given most specific first, or null when none sets
 * one. Pure.
 */
export function pickAutoCompactWindow(sources: ReadonlyArray<unknown>, modelName: string): number | null {
  const wanted = normalizeModelKey(modelName)
  for (const source of sources) {
    if (typeof source !== 'object' || source === null) continue
    const settings = source as { modelSettings?: unknown; autoCompactWindow?: unknown }

    const perModel = settings.modelSettings
    if (typeof perModel === 'object' && perModel !== null) {
      for (const [key, entry] of Object.entries(perModel)) {
        if (normalizeModelKey(key) !== wanted || typeof entry !== 'object' || entry === null) continue
        const window = validAutoCompactWindow((entry as { autoCompactWindow?: unknown }).autoCompactWindow)
        if (window !== null) return window
      }
    }
    const general = validAutoCompactWindow(settings.autoCompactWindow)
    if (general !== null) return general
  }
  return null
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as unknown
  } catch {
    return null
  }
}

/**
 * The window the user set for the model, looking where Claude Code does. `projectPath` is the
 * session's working directory. When it is not a real path here, only the user's settings are read.
 * Server only: it reads files.
 */
export async function loadAutoCompactWindow(
  projectPath: string | null,
  modelName: string,
  configDir: string = getClaudeDir(),
): Promise<number | null> {
  const files: string[] = []
  if (projectPath && path.isAbsolute(projectPath)) {
    files.push(path.join(projectPath, '.claude', 'settings.local.json'), path.join(projectPath, '.claude', 'settings.json'))
  }
  files.push(path.join(configDir, 'settings.json'))
  return pickAutoCompactWindow(await Promise.all(files.map(readJson)), modelName)
}
