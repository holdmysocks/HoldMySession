import * as path from 'node:path'
import * as fs from 'node:fs'
import { getDataSources, getProjectsDirFor } from '@/lib/utils/claude-path'
import type { DataSource } from '@/lib/utils/claude-path'

/**
 * Search for a session JSONL file across all available data sources.
 *
 * For each source, first tries the project directory named by projectKey (the directory
 * name, which is never decoded), then falls back to scanning all project directories.
 *
 * Returns the file path and directory name, or null if not found.
 */
export async function findSessionFile(
  sessionId: string,
  projectKey: string,
): Promise<{ path: string; dirName: string } | null> {
  const sources = await getDataSources()

  for (const source of sources) {
    if (!source.available) continue

    const result = findInSource(sessionId, projectKey, source)
    if (result) return result
  }

  return null
}

function findInSource(
  sessionId: string,
  projectKey: string,
  source: DataSource,
): { path: string; dirName: string } | null {
  const projectsDir = getProjectsDirFor(source)

  let entries: string[]
  try {
    entries = fs.readdirSync(projectsDir) as string[]
  } catch {
    return null
  }

  if (entries.includes(projectKey)) {
    const filePath = path.join(projectsDir, projectKey, `${sessionId}.jsonl`)
    if (fs.existsSync(filePath)) {
      return { path: filePath, dirName: projectKey }
    }
  }

  // Fallback: search all projects in this source
  for (const dirName of entries) {
    const filePath = path.join(projectsDir, dirName, `${sessionId}.jsonl`)
    if (fs.existsSync(filePath)) {
      return { path: filePath, dirName }
    }
  }

  return null
}
