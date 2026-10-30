import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { parseDetail } from '@/lib/parsers/session-parser'
import { buildProjectInfo } from '@/lib/scanner/project-scanner'
import { resolveProjectDisplayName } from '@/lib/scanner/project-display-name'
import { applyAutoCompactWindow } from '@/lib/parsers/context-limit'
import { loadAutoCompactWindow } from '@/lib/claude-settings/auto-compact'
import { findSessionFile } from '@/features/session-detail/find-session-file'

/** The full detail of one session on this computer: turns, tools, agents, context window. Server only. */
export async function loadSessionDetail(data: { sessionId: string; projectKey: string }) {
  const filePath = await findSessionFile(data.sessionId, data.projectKey)
  if (!filePath) {
    throw new Error(`Session not found: ${data.sessionId}`)
  }

  // The project's path and name come from the transcripts' cwd, as on the list page.
  const dirPath = path.dirname(filePath.path)
  const files = await fs.readdir(dirPath).catch(() => [] as string[])
  const project = await buildProjectInfo(
    dirPath,
    filePath.dirName,
    files.filter((f) => f.endsWith('.jsonl')),
  )

  const detail = await parseDetail(filePath.path, data.sessionId, project.projectPath, project.projectName)
  const projectDisplayName = await resolveProjectDisplayName(project.projectPath, project.projectName)

  // A window the user set with /autocompact or in settings.json is the one they work in.
  const configured = detail.contextWindow
    ? await loadAutoCompactWindow(project.projectPath, detail.contextWindow.modelName)
    : null
  const contextWindow = applyAutoCompactWindow(detail.contextWindow, configured)
  return { ...detail, contextWindow, projectDisplayName }
}
