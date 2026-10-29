import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  getProjectsDir,
  getProjectsDirFor,
  getDataSources,
  projectNameFromPath,
} from '../utils/claude-path'
import type { DataSource } from '../utils/claude-path'
import { findCwd, readHeadRecords } from '../parsers/session-head'

export interface ProjectInfo {
  /** Directory name under projects/. The internal key. It is never decoded into a path. */
  dirName: string
  /**
   * Working directory from the transcripts' `cwd` field, or the directory name when no
   * record has one. Shown as the project's path.
   */
  projectPath: string
  /** Last segment of projectPath. Basis for the display name when no package.json or remote name exists. */
  projectName: string
  /** True when a transcript supplied the cwd. False means projectPath is the directory name. */
  cwdKnown: boolean
  sessionFiles: string[]
  /** Which DataSource this came from, e.g. 'primary', 'wsl-ubuntu-user' */
  sourceId?: string
  /** Display label for the source, e.g. 'Windows', 'WSL - Ubuntu' */
  sourceLabel?: string
}

/** Working directory per project directory, once found. A directory's cwd does not change. */
const cwdByDir = new Map<string, string>()

/** Test helper: forget cached working directories. */
export function clearProjectCwdCache(): void {
  cwdByDir.clear()
}

/**
 * The working directory of a project directory: the first `cwd` string found in the
 * head of its session files, in name order. Returns null when no file has one.
 * Read-only, and it reads only the first lines of each file.
 */
export async function resolveProjectCwd(dirPath: string, sessionFiles: string[]): Promise<string | null> {
  const cached = cwdByDir.get(dirPath)
  if (cached !== undefined) return cached

  for (const file of [...sessionFiles].sort()) {
    const cwd = findCwd(await readHeadRecords(path.join(dirPath, file)))
    if (cwd) {
      cwdByDir.set(dirPath, cwd)
      return cwd
    }
  }
  return null
}

/** Build the ProjectInfo for one project directory. Never decodes the directory name. */
export async function buildProjectInfo(
  dirPath: string,
  dirName: string,
  sessionFiles: string[],
): Promise<ProjectInfo> {
  const cwd = await resolveProjectCwd(dirPath, sessionFiles)
  const projectName = cwd ? projectNameFromPath(cwd) || dirName : dirName
  return {
    dirName,
    projectPath: cwd ?? dirName,
    projectName,
    cwdKnown: cwd !== null,
    sessionFiles,
  }
}

async function scanProjectDirs(
  projectsDir: string,
  extra: Pick<ProjectInfo, 'sourceId' | 'sourceLabel'> = {},
): Promise<ProjectInfo[]> {
  let entries: string[]
  try {
    entries = await fs.promises.readdir(projectsDir)
  } catch {
    return []
  }

  const projects: ProjectInfo[] = []

  for (const dirName of entries) {
    const dirPath = path.join(projectsDir, dirName)
    const stat = await fs.promises.stat(dirPath).catch(() => null)
    if (!stat?.isDirectory()) continue

    const files = await fs.promises.readdir(dirPath).catch(() => [] as string[])
    const sessionFiles = files.filter((f) => f.endsWith('.jsonl'))

    if (sessionFiles.length === 0) continue

    projects.push({ ...(await buildProjectInfo(dirPath, dirName, sessionFiles)), ...extra })
  }

  return projects
}

export async function scanProjects(): Promise<ProjectInfo[]> {
  return scanProjectDirs(getProjectsDir())
}

export async function scanProjectsFrom(source: DataSource): Promise<ProjectInfo[]> {
  return scanProjectDirs(getProjectsDirFor(source), {
    sourceId: source.id,
    sourceLabel: source.label,
  })
}

export async function scanAllProjects(): Promise<ProjectInfo[]> {
  const sources = await getDataSources()
  const allProjects: ProjectInfo[] = []

  for (const source of sources) {
    if (!source.available) continue
    const projects = await scanProjectsFrom(source)
    allProjects.push(...projects)
  }

  return allProjects
}
