import * as fs from 'node:fs/promises'
import * as path from 'node:path'

/**
 * Human name for a project, read-only from the user's own project directory:
 *   1. `name` in package.json, if it is a non-empty string
 *   2. the repo name from the `origin` remote in the git config (a `.git` folder or file)
 *   3. the folder name (the last segment of the working directory)
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
  // A Windows path read on Linux (e.g. "D:\\x") is not absolute here. Skip the lookup, or
  // it would resolve against the server's working directory.
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
  const gitDir = await resolveGitDir(projectPath)
  if (!gitDir) return null

  const config = await readRepoConfig(gitDir)
  const url = config ? originUrl(config) : null
  return url ? repoNameFromUrl(url) : null
}

/**
 * The git directory for a checkout. A `.git` folder is used as is. A `.git` file holds
 * "gitdir: <path>" (worktrees and submodules); a relative path is relative to the folder
 * that holds the file. Nothing is written.
 */
async function resolveGitDir(projectPath: string): Promise<string | null> {
  const dotGit = path.join(projectPath, '.git')
  const stat = await fs.stat(dotGit).catch(() => null)
  if (!stat) return null
  if (stat.isDirectory()) return dotGit

  const text = await fs.readFile(dotGit, 'utf8').catch(() => null)
  const match = text?.match(/^gitdir:\s*(.+?)\s*$/m)
  if (!match) return null
  const target = match[1]
  return path.isAbsolute(target) ? target : path.resolve(projectPath, target)
}

/**
 * The config to read for a git directory. A linked worktree has its own git directory
 * with a `commondir` file that points at the main repository's directory, where the
 * remotes live.
 */
async function readRepoConfig(gitDir: string): Promise<string | null> {
  const own = await fs.readFile(path.join(gitDir, 'config'), 'utf8').catch(() => null)
  if (own !== null) return own

  const commonDir = await fs.readFile(path.join(gitDir, 'commondir'), 'utf8').catch(() => null)
  if (commonDir === null) return null
  const target = commonDir.trim()
  const common = path.isAbsolute(target) ? target : path.resolve(gitDir, target)
  return fs.readFile(path.join(common, 'config'), 'utf8').catch(() => null)
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
