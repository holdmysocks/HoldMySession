import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { NodePositions } from './layout'
import { LayoutFileSchema, type LayoutFile } from './layout-schema'

/**
 * Saves the map layouts the user arranged by hand, so they follow the user to any device that
 * opens the dashboard. One JSON file in the dashboard's own folder, next to settings.json. Nothing
 * is written under the Claude config directory.
 *
 * Server only: it uses the file system. Import it from a server function's handler.
 */

const DIR = '.claude-dashboard'
const FILE = 'map-layouts.json'

const EMPTY: LayoutFile = { version: 1, projects: {} }

function layoutFilePath(baseDir: string): string {
  return path.join(baseDir, DIR, FILE)
}

/** The whole file. Missing, unreadable or invalid gives an empty one. */
async function readFile(baseDir: string): Promise<LayoutFile> {
  try {
    const parsed = LayoutFileSchema.safeParse(JSON.parse(await fs.promises.readFile(layoutFilePath(baseDir), 'utf-8')))
    return parsed.success ? parsed.data : { ...EMPTY, projects: {} }
  } catch {
    return { ...EMPTY, projects: {} }
  }
}

/** The saved positions for a project. Empty when nothing was saved. */
export async function readProjectLayout(
  projectKey: string,
  baseDir: string = os.homedir(),
): Promise<NodePositions> {
  const file = await readFile(baseDir)
  return Object.hasOwn(file.projects, projectKey) ? file.projects[projectKey] : {}
}

/** Saves run one at a time, so two quick saves can not read the same file and lose one of them. */
let queue: Promise<unknown> = Promise.resolve()

/**
 * Saves the positions for a project, replacing what was there. Empty positions remove the
 * project's entry. Other projects are kept. The file is written to a temporary name and renamed,
 * so a crash never leaves half a file.
 */
export function writeProjectLayout(
  projectKey: string,
  positions: NodePositions,
  baseDir: string = os.homedir(),
): Promise<void> {
  const run = queue.then(async () => {
    const file = await readFile(baseDir)
    if (Object.keys(positions).length === 0) {
      delete file.projects[projectKey]
    } else {
      file.projects[projectKey] = positions
    }

    const target = layoutFilePath(baseDir)
    const temporary = `${target}.tmp`
    await fs.promises.mkdir(path.dirname(target), { recursive: true })
    try {
      await fs.promises.writeFile(temporary, JSON.stringify(file, null, 2), 'utf-8')
      await fs.promises.rename(temporary, target)
    } catch (error) {
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined)
      throw new Error(`Failed to save map layout: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  })
  queue = run.catch(() => undefined)
  return run
}
