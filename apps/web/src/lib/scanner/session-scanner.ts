import * as fs from 'node:fs'
import * as path from 'node:path'
import { getProjectsDir, getProjectsDirFor, getDataSources, extractSessionId } from '../utils/claude-path'
import type { DataSource } from '../utils/claude-path'
import { scanProjects, scanProjectsFrom } from './project-scanner'
import { hasRecentRecord, isSessionActive } from './active-detector'
import { backgroundTaskDir, hasRunningBackgroundTask } from './background-tasks'
import { parseSummary, parseFullScan } from '../parsers/session-parser'
import type { SessionSummary } from '../parsers/types'
import { truncateSessionName } from '../parsers/session-name'
import { resolveProjectDisplayName } from './project-display-name'
import { desktopFlagsFor, loadDesktopSessionFlags } from '../desktop/desktop-records'
import { keepOneTranscriptPerSession } from '../desktop/superseded'
import { uniqueOutputByFile } from './unique-output'

/** Extended summary that includes the absolute JSONL file path (server-side only). */
export interface SessionSummaryWithPath extends SessionSummary {
  filePath: string
}

/** What a full scan found about a file's output, kept so it can be matched against other files. */
interface OutputDetail {
  requestOutputs: Map<string, number>
  untrackedOutputTokens: number
}

// In-memory cache: file path -> { mtime, summary, output detail }. Keyed by file, not session ID,
// because one session ID can exist in more than one project folder.
const summaryCache = new Map<
  string,
  { mtimeMs: number; summary: SessionSummary; output: OutputDetail }
>()

const NO_OUTPUT: OutputDetail = { requestOutputs: new Map(), untrackedOutputTokens: 0 }

/**
 * Sets `uniqueOutputTokens` on each scanned session: its output without the requests an
 * earlier-started file already holds. The summaries are the copies returned by the scan.
 */
function applyUniqueOutput(
  scanned: Array<{ summary: SessionSummary; filePath: string; output: OutputDetail }>,
): void {
  const unique = uniqueOutputByFile(
    scanned.map(({ summary, filePath, output }) => ({
      id: filePath,
      startedAt: summary.startedAt,
      requestOutputs: output.requestOutputs,
      untrackedOutputTokens: output.untrackedOutputTokens,
    })),
  )
  for (const { summary, filePath } of scanned) {
    summary.uniqueOutputTokens = unique.get(filePath) ?? summary.outputTokens
  }
}

/**
 * Fill the values that need the whole file: output tokens, and the newest custom-title,
 * which can sit anywhere in the file. Called only when a file is parsed (not on cache hits).
 */
async function applyFullScan(summary: SessionSummary, filePath: string): Promise<OutputDetail> {
  const full = await parseFullScan(filePath).catch(() => null)
  summary.outputTokens = full?.outputTokens
  const customName = truncateSessionName(full?.customTitle ?? null)
  if (customName) summary.sessionName = customName
  return full
    ? { requestOutputs: full.requestOutputs, untrackedOutputTokens: full.untrackedOutputTokens }
    : NO_OUTPUT
}

/**
 * Whether a session is running now. A session is active when its transcript is being written
 * (see isSessionActive and hasRecentRecord), or when one of its background tasks is still running.
 * The second case is the one the transcript cannot show.
 */
async function sessionRunning(
  projectDirName: string,
  sessionId: string,
  lastActiveAt: string,
  projectsDirOverride?: string,
): Promise<boolean> {
  const transcriptActive =
    (await isSessionActive(projectDirName, sessionId, projectsDirOverride)) && hasRecentRecord(lastActiveAt)
  if (transcriptActive) return true
  return hasRunningBackgroundTask(backgroundTaskDir(projectDirName, sessionId))
}

/**
 * Internal scanning logic that returns summaries with their file paths.
 * Used by both public APIs below.
 */
async function scanSessionsInternal(): Promise<SessionSummaryWithPath[]> {
  const projects = await scanProjects()
  const summaries: SessionSummaryWithPath[] = []
  const scanned: Array<{ summary: SessionSummary; filePath: string; output: OutputDetail }> = []

  for (const project of projects) {
    const projectDisplayName = await resolveProjectDisplayName(project.projectPath, project.projectName)
    for (const file of project.sessionFiles) {
      const sessionId = extractSessionId(file)
      const filePath = path.join(
        getProjectsDir(),
        project.dirName,
        file,
      )

      const stat = await fs.promises.stat(filePath).catch(() => null)
      if (!stat) continue

      // Check cache
      const cached = summaryCache.get(filePath)
      if (cached && cached.mtimeMs === stat.mtimeMs) {
        // Refresh active status even for cached entries
        const active = await sessionRunning(project.dirName, sessionId, cached.summary.lastActiveAt)
        const entry = { ...cached.summary, isActive: active, filePath, projectDisplayName }
        summaries.push(entry)
        scanned.push({ summary: entry, filePath, output: cached.output })
        continue
      }

      // Parse summary from first/last lines
      const summary = await parseSummary(
        filePath,
        sessionId,
        project.projectPath,
        project.projectName,
        projectDisplayName,
        stat.size,
      )

      if (summary) {
        const active = await sessionRunning(project.dirName, sessionId, summary.lastActiveAt)
        summary.isActive = active
        const output = await applyFullScan(summary, filePath)

        summaryCache.set(filePath, {
          mtimeMs: stat.mtimeMs,
          summary,
          output,
        })
        const entry = { ...summary, filePath }
        summaries.push(entry)
        scanned.push({ summary: entry, filePath, output })
      }
    }
  }

  applyUniqueOutput(scanned)

  // Sort by last active, newest first
  summaries.sort(
    (a, b) =>
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  )

  // Desktop app flags (archived, split). Added to copies, so the summary cache is not changed.
  // A session whose transcript has no working directory takes the desktop record's, so it keeps its project.
  const desktopFlags = await loadDesktopSessionFlags()
  const flagged = summaries.map((summary) => ({
    ...summary,
    ...desktopFlagsFor(desktopFlags, summary.sessionId),
    cwd: summary.cwd ?? desktopFlags.get(summary.sessionId)?.cwd ?? null,
  }))
  // Older transcripts are hidden, but a session whose current transcript is not on disk keeps one.
  return keepOneTranscriptPerSession(flagged)
}

/** Public API: returns SessionSummary[] without filePath -- used by server functions that serialize to client. */
export async function scanAllSessions(): Promise<SessionSummary[]> {
  const results = await scanSessionsInternal()
  // Strip filePath to avoid leaking absolute paths to the client
  return results.map(({ filePath: _filePath, ...summary }) => summary)
}

/** Public API: returns SessionSummaryWithPath[] -- used by server-side stats enrichment. */
export async function scanAllSessionsWithPaths(): Promise<SessionSummaryWithPath[]> {
  return scanSessionsInternal()
}

export async function getActiveSessions(): Promise<SessionSummary[]> {
  const all = await scanAllSessions()
  return all.filter((s) => s.isActive)
}

/**
 * Scan sessions from a single DataSource, setting sourceId and sourceLabel on each result.
 * For non-primary sources, passes projectsDirOverride to isSessionActive.
 */
export async function scanSessionsFromSource(source: DataSource): Promise<SessionSummary[]> {
  const projects = await scanProjectsFrom(source)
  const summaries: SessionSummary[] = []
  const scanned: Array<{ summary: SessionSummary; filePath: string; output: OutputDetail }> = []
  const projectsDirOverride = source.id !== 'primary' ? getProjectsDirFor(source) : undefined

  for (const project of projects) {
    const projectDisplayName = await resolveProjectDisplayName(project.projectPath, project.projectName)
    for (const file of project.sessionFiles) {
      const sessionId = extractSessionId(file)
      const projectsDir = source.id === 'primary' ? getProjectsDir() : getProjectsDirFor(source)
      const filePath = path.join(projectsDir, project.dirName, file)

      const stat = await fs.promises.stat(filePath).catch(() => null)
      if (!stat) continue

      const cached = summaryCache.get(filePath)
      if (cached && cached.mtimeMs === stat.mtimeMs) {
        const active = await sessionRunning(project.dirName, sessionId, cached.summary.lastActiveAt, projectsDirOverride)
        const entry = {
          ...cached.summary,
          isActive: active,
          projectDisplayName,
          sourceId: source.id,
          sourceLabel: source.label,
          sourcePlatform: source.platform,
        }
        summaries.push(entry)
        scanned.push({ summary: entry, filePath, output: cached.output })
        continue
      }

      const summary = await parseSummary(
        filePath,
        sessionId,
        project.projectPath,
        project.projectName,
        projectDisplayName,
        stat.size,
      )

      if (summary) {
        const active = await sessionRunning(project.dirName, sessionId, summary.lastActiveAt, projectsDirOverride)
        summary.isActive = active
        const output = await applyFullScan(summary, filePath)
        summary.sourceId = source.id
        summary.sourceLabel = source.label
        summary.sourcePlatform = source.platform

        summaryCache.set(filePath, {
          mtimeMs: stat.mtimeMs,
          summary,
          output,
        })
        const entry = { ...summary }
        summaries.push(entry)
        scanned.push({ summary: entry, filePath, output })
      }
    }
  }

  applyUniqueOutput(scanned)
  return summaries
}

/**
 * Scan sessions from all available DataSources, merging results sorted by lastActiveAt descending.
 * Deduplicates by sessionId, keeping the entry with the most recent lastActiveAt.
 */
export async function scanAllSessionsMultiSource(): Promise<SessionSummary[]> {
  const sources = await getDataSources()
  const allSessions: SessionSummary[] = []

  for (const source of sources) {
    if (!source.available) continue
    const sessions = await scanSessionsFromSource(source)
    allSessions.push(...sessions)
  }

  // Deduplicate by sessionId, keeping the one with newest lastActiveAt
  const deduped = new Map<string, SessionSummary>()
  for (const session of allSessions) {
    const existing = deduped.get(session.sessionId)
    if (!existing || new Date(session.lastActiveAt).getTime() > new Date(existing.lastActiveAt).getTime()) {
      deduped.set(session.sessionId, session)
    }
  }

  const results = Array.from(deduped.values())
  results.sort(
    (a, b) =>
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
  )

  return results
}
