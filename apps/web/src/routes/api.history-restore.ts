import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'

/** The largest backup accepted, in bytes. */
const MAX_BYTES = 2 * 1024 * 1024 * 1024

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Replaces the history database with an uploaded backup file. */
export const Route = createFileRoute('/api/history-restore')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { isSameOriginRequest } = await import('@/lib/history/request-guard')
        if (!isSameOriginRequest(request)) return json(403, { ok: false, message: 'Refused: the request did not come from this dashboard.' })
        const length = Number(request.headers.get('content-length') ?? 0)
        if (length > MAX_BYTES) return json(413, { ok: false, message: 'That file is too large.' })

        const { isHistoryScanRunning } = await import('@/lib/history/scan')
        if (isHistoryScanRunning()) return json(409, { ok: false, message: 'A scan is running. Try again in a moment.' })

        const temp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'holdmysession-restore-')), 'upload.db')
        try {
          const bytes = Buffer.from(await request.arrayBuffer())
          if (bytes.length > MAX_BYTES) return json(413, { ok: false, message: 'That file is too large.' })
          fs.writeFileSync(temp, bytes)

          const { openHistoryDb } = await import('@/lib/history/history-db')
          const { restoreFromFile } = await import('@/lib/history/backup')
          const db = openHistoryDb()
          try {
            const result = restoreFromFile(db, temp)
            return json(200, { ok: true, sessions: result.sessions, savedAs: result.savedAs.name })
          } catch (error) {
            try {
              db.close()
            } catch {
              // Already closed by the restore.
            }
            return json(400, { ok: false, message: error instanceof Error ? error.message : String(error) })
          }
        } finally {
          fs.rmSync(path.dirname(temp), { recursive: true, force: true })
        }
      },
    },
  },
})
