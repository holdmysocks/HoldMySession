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
  /** `sessionId`: the desktop app's own ID for the session (local_<uuid>). */
  localId: string
  /** `isArchived`: the user archived the session in the desktop app. */
  isArchived: boolean
  /** `lastActivityAt` (epoch ms): when the desktop app last saw activity in the session. Null when absent. */
  lastActivityAt: number | null
  /**
   * `lineageDetached`: the session was split from its parent in the desktop app. The transcript
   * and `spawnedFrom` still point at the parent, so the map must not draw that link.
   */
  lineageDetached: boolean
  /**
   * `spawnedFrom`, as the app's own ID of the parent (local_<uuid>), or null. Null for a user fork
   * or a side question (`userFork` or `btw`): the app lists those as separate sessions, not nested.
   */
  parentLocalId: string | null
  /** `cwd` from the app's record: the project folder, or null. Used when the transcript has none. */
  cwd: string | null
  /**
   * The parent's transcript ID, resolved from `parentLocalId` across all records. Null when the
   * session is not nested, or the parent has no record on this machine.
   */
  parentCliSessionId: string | null
  /**
   * `priorCliSessionIds`: the older transcripts of this same desktop session, left behind when the
   * app moved on to a new transcript (for example after a rewind). Only `cliSessionId` is current.
   */
  priorCliSessionIds: string[]
  /**
   * True on the entry made for an older transcript named in another record's `priorCliSessionIds`.
   * Such a transcript is a former version of its session, not a session of its own.
   */
  superseded: boolean
}

/**
 * The app's ID of the parent, from `spawnedFrom`. The app writes either a bare string or an
 * object with a `sessionId` field, so both are read.
 */
function spawnedFromLocalId(value: unknown): string | null {
  if (typeof value === 'string') return value === '' ? null : value
  if (typeof value === 'object' && value !== null) {
    const id = (value as Record<string, unknown>).sessionId
    return typeof id === 'string' && id !== '' ? id : null
  }
  return null
}

/**
 * The parent to nest under, from `spawnedFrom`. A user fork or a side question (`btw`) is not
 * nested: the app lists it as its own session, even though `spawnedFrom` names the parent.
 */
function nestingParentLocalId(spawnedFrom: unknown): string | null {
  if (typeof spawnedFrom === 'object' && spawnedFrom !== null) {
    const ref = spawnedFrom as Record<string, unknown>
    if (ref.userFork === true || ref.btw === true) return null
  }
  return spawnedFromLocalId(spawnedFrom)
}

/** Pure: the flags from one parsed record, or null when the record has no transcript ID. */
export function parseDesktopRecord(value: unknown): DesktopSessionFlags | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.cliSessionId !== 'string' || record.cliSessionId === '') return null
  return {
    cliSessionId: record.cliSessionId,
    localId: typeof record.sessionId === 'string' ? record.sessionId : '',
    isArchived: record.isArchived === true,
    lastActivityAt:
      typeof record.lastActivityAt === 'number' && Number.isFinite(record.lastActivityAt)
        ? record.lastActivityAt
        : null,
    lineageDetached: Boolean(record.lineageDetached),
    parentLocalId: nestingParentLocalId(record.spawnedFrom),
    cwd: typeof record.cwd === 'string' && record.cwd.trim() !== '' ? record.cwd : null,
    parentCliSessionId: null,
    priorCliSessionIds: Array.isArray(record.priorCliSessionIds)
      ? record.priorCliSessionIds.filter((id): id is string => typeof id === 'string' && id !== '')
      : [],
    superseded: false,
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

/**
 * Flags for every readable record under `dir`, keyed by transcript session ID. Each record's
 * parent is resolved from the app's IDs to transcript IDs, using the records read here.
 */
export async function readDesktopSessionFlags(dir: string): Promise<Map<string, DesktopSessionFlags>> {
  const records: DesktopSessionFlags[] = []
  for (const file of await listRecordFiles(dir)) {
    const stat = await fs.promises.stat(file).catch(() => null)
    if (!stat) continue
    const flags = await readRecord(file, stat.mtimeMs)
    if (flags) records.push(flags)
  }

  const cliIdByLocalId = new Map<string, string>()
  for (const record of records) {
    if (record.localId !== '') cliIdByLocalId.set(record.localId, record.cliSessionId)
  }

  const byCliSessionId = new Map<string, DesktopSessionFlags>()
  for (const record of records) {
    const parent = record.parentLocalId ? cliIdByLocalId.get(record.parentLocalId) : undefined
    byCliSessionId.set(record.cliSessionId, {
      ...record,
      parentCliSessionId: parent && parent !== record.cliSessionId ? parent : null,
    })
  }

  // The older transcripts of each session get an entry of their own, so they can be told apart
  // from sessions. An ID that has a record of its own is a session in its own right, and is left alone.
  for (const record of records) {
    for (const priorId of record.priorCliSessionIds) {
      if (priorId === record.cliSessionId || byCliSessionId.has(priorId)) continue
      byCliSessionId.set(priorId, {
        ...record,
        cliSessionId: priorId,
        parentCliSessionId: null,
        priorCliSessionIds: [],
        superseded: true,
      })
    }
  }
  return byCliSessionId
}

/** Flags from this machine's desktop records. Empty when there is no folder. Never throws. */
export async function loadDesktopSessionFlags(): Promise<Map<string, DesktopSessionFlags>> {
  const dir = desktopSessionsDir()
  if (!dir) return new Map()
  return readDesktopSessionFlags(dir).catch(() => new Map<string, DesktopSessionFlags>())
}

/** The flags for one transcript session. All false or null when the desktop app has no record for it. */
export function desktopFlagsFor(
  flags: Map<string, DesktopSessionFlags>,
  sessionId: string,
): {
  isArchived: boolean
  lineageDetached: boolean
  desktopActivityAt: string | null
  desktopParentId: string | null
  isSuperseded: boolean
} {
  const record = flags.get(sessionId)
  return {
    isArchived: record?.isArchived ?? false,
    lineageDetached: record?.lineageDetached ?? false,
    desktopActivityAt:
      record?.lastActivityAt != null ? new Date(record.lastActivityAt).toISOString() : null,
    desktopParentId: record?.parentCliSessionId ?? null,
    isSuperseded: record?.superseded ?? false,
  }
}
