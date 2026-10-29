import * as fs from 'node:fs/promises'
import * as path from 'node:path'

/**
 * Human name for a project, read-only from the user's own project directory:
 *   1. `name` in package.json, if it is a non-empty string
 *   2. the repo name from the `origin` remote in .git/config
 *   3. the folder name
 *
 * Results are cached by path for the life of the server process. Nothing is written.
 */
const cache = new Map<string, string>()

export async function resolveProjectDisplayName(
  projectPath: string,
  folderName: string,
): Promise<string> {
  const cached = cache.get(projectPath)
  if (cached !== undefined) return cached

  const resolved = await lookUpDisplayName(projectPath, folderName)
  cache.set(projectPath, resolved)
  return resolved
}

/** Test helper: forget cached names so a test can reuse a path with new contents. */
export function clearProjectDisplayNameCache(): void {
  cache.clear()
}

async function lookUpDisplayName(projectPath: string, folderName: string): Promise<string> {
  // Decoded paths on another OS (e.g. "D:/x" read on Linux) are relative and would
  // resolve against the server's working directory. Skip the lookup for those.
  if (!path.isAbsolute(projectPath)) return folderName

  return (
    (await readPackageName(projectPath)) ??
    (await readGitRemoteRepoName(projectPath)) ??
    folderName
  )
}

async function readPackageName(projectPath: string): Promise<string | null> {
  try {
    const text = await fs.readFile(path.join(projectPath, 'package.json'), 'utf8')
    const json = JSON.parse(text) as unknown
    if (typeof json !== 'object' || json === null) return null
    const name = (json as { name?: unknown }).name
    if (typeof name === 'string' && name.trim()) return name.trim()
  } catch {
    // No package.json, unreadable, or not JSON: fall through to the next source
  }
  return null
}

async function readGitRemoteRepoName(projectPath: string): Promise<string | null> {
  // A .git file (worktrees, submodules) points elsewhere. It is not followed here.
  let config: string
  try {
    config = await fs.readFile(path.join(projectPath, '.git', 'config'), 'utf8')
  } catch {
    return null
  }
  const url = originUrl(config)
  return url ? repoNameFromUrl(url) : null
}

/** The `url` value under `[remote "origin"]`, or null. */
export function originUrl(config: string): string | null {
  let inOrigin = false
  for (const rawLine of config.split(/\r?\n/)) {
    const line = rawLine.trim()
    const section = line.match(/^\[(.+)\]$/)
    if (section) {
      inOrigin = section[1].trim() === 'remote "origin"'
      continue
    }
    if (!inOrigin) continue
    const url = line.match(/^url\s*=\s*(.+)$/)
    if (url) return url[1].trim()
  }
  return null
}

/**
 * Repo name from a remote URL: "https://host/owner/repo.git", "git@host:owner/repo.git",
 * or a local path. Returns the last segment without a trailing ".git".
 */
export function repoNameFromUrl(url: string): string | null {
  const trimmed = url.trim().replace(/[/\\]+$/, '')
  const last = trimmed.split(/[/\\:]/).pop() ?? ''
  const name = last.replace(/\.git$/i, '')
  return name || null
}
