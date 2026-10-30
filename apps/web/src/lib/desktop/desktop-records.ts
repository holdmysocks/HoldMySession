import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Session flags that the Claude desktop app keeps outside the transcripts. Read-only.
 *
 * The app writes one JSON file per session, named local_<id>.json, under
 * %APPDATA%\Claude\claude-code-sessions\<account>\<org>\. The file's `cliSessionId` is the
 * transcript's session ID, so it is the join key. Only the fields below are read. The
 * format is internal to the desktop app and may change, so a missing or odd field means
 * "not set" and never an error.
 */

export interface DesktopSessionFlags {
  /** `cliSessionId`: the transcript session ID. Used to join a record to its transcript. */
  cliSessionId: string
  /** `isArchived`: the user archived the session in the desktop app. */
  isArchived: boolean
  /**
   * `lineageDetached`: the session was split from its parent in the desktop app. The transcript
   * and `spawnedFrom` still point at the parent, so the map must not draw that link.
   */
  lineageDetached: boolean
}

/** Pure: the flags from one parsed record, or null when the record has no transcript ID. */
export function parseDesktopRecord(value: unknown): DesktopSessionFlags | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.cliSessionId !== 'string' || record.cliSessionId === '') return null
  return {
    cliSessionId: record.cliSessionId,
    isArchived: record.isArchived === true,
    lineageDetached: Boolean(record.lineageDetached),
  }
}

/**
 * Folder holding the desktop app's session records, or null when this machine has none.
 * CLAUDE_DESKTOP_SESSIONS_DIR overrides it (used by tests and for unusual installs).
 * Otherwise it is %APPDATA%\Claude\claude-code-sessions, which exists only on Windows.
 */
export function desktopSessionsDir(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.CLAUDE_DESKTOP_SESSIONS_DIR) return path.resolve(env.CLAUDE_DESKTOP_SESSIONS_DIR)
  if (env.APPDATA) return path.join(env.APPDATA, 'Claude', 'claude-code-sessions')
  return null
}

/** Record files under `dir`, at any depth. A missing folder gives an empty list. */
async function listRecordFiles(dir: string): Promise<string[]> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listRecordFiles(full)))
    } else if (/^local_.*\.json$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

/** Parsed records by file path, reused while the file's mtime is unchanged. */
const recordCache = new Map<string, { mtimeMs: number; flags: DesktopSessionFlags }>()

async function readRecord(file: string, mtimeMs: number): Promise<DesktopSessionFlags | null> {
  const cached = recordCache.get(file)
  if (cached && cached.mtimeMs === mtimeMs) return cached.flags

  const text = await fs.promises.readFile(file, 'utf8').catch(() => null)
  if (text === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const flags = parseDesktopRecord(parsed)
  if (flags) recordCache.set(file, { mtimeMs, flags })
  return flags
}

/** Flags for every readable record under `dir`, keyed by transcript session ID. */
export async function readDesktopSessionFlags(dir: string): Promise<Map<string, DesktopSessionFlags>> {
  const byCliSessionId = new Map<string, DesktopSessionFlags>()
  for (const file of await listRecordFiles(dir)) {
    const stat = await fs.promises.stat(file).catch(() => null)
    if (!stat) continue
    const flags = await readRecord(file, stat.mtimeMs)
    if (flags) byCliSessionId.set(flags.cliSessionId, flags)
  }
  return byCliSessionId
}

/** Flags from this machine's desktop records. Empty when there is no folder. Never throws. */
export async function loadDesktopSessionFlags(): Promise<Map<string, DesktopSessionFlags>> {
  const dir = desktopSessionsDir()
  if (!dir) return new Map()
  return readDesktopSessionFlags(dir).catch(() => new Map<string, DesktopSessionFlags>())
}

/** The two flags for one transcript session. Both false when the desktop app has no record for it. */
export function desktopFlagsFor(
  flags: Map<string, DesktopSessionFlags>,
  sessionId: string,
): { isArchived: boolean; lineageDetached: boolean } {
  const record = flags.get(sessionId)
  return {
    isArchived: record?.isArchived ?? false,
    lineageDetached: record?.lineageDetached ?? false,
  }
}
