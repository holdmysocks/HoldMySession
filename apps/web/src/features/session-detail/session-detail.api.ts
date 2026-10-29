import { createServerFn } from '@tanstack/react-start'
import { extractProjectName } from '@/lib/utils/claude-path'
import { parseDetail } from '@/lib/parsers/session-parser'
import { resolveProjectDisplayName } from '@/lib/scanner/project-display-name'
import { findSessionFile } from './find-session-file'

export const getSessionDetail = createServerFn({ method: 'GET' })
  .inputValidator((input: { sessionId: string; projectPath: string }) => input)
  .handler(async ({ data }) => {
    const filePath = await findSessionFile(data.sessionId, data.projectPath)
    if (!filePath) {
      throw new Error(`Session not found: ${data.sessionId}`)
    }

    const projectName = extractProjectName(data.projectPath)
    const detail = await parseDetail(filePath.path, data.sessionId, data.projectPath, projectName)
    const projectDisplayName = await resolveProjectDisplayName(data.projectPath, projectName)
    return { ...detail, projectDisplayName }
  })
