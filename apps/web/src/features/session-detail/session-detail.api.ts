import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createServerFn } from '@tanstack/react-start'
import { parseDetail } from '@/lib/parsers/session-parser'
import { buildProjectInfo } from '@/lib/scanner/project-scanner'
import { resolveProjectDisplayName } from '@/lib/scanner/project-display-name'
import { findSessionFile } from './find-session-file'

export const getSessionDetail = createServerFn({ method: 'GET' })
  .inputValidator((input: { sessionId: string; projectKey: string }) => input)
  .handler(async ({ data }) => {
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
    return { ...detail, projectDisplayName }
  })
