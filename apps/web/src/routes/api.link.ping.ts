import { createFileRoute } from '@tanstack/react-router'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/** Lets a node check the address and token before it starts sending. */
export const Route = createFileRoute('/api/link/ping')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const { readSettingsFile } = await import('@/lib/settings-file')
        const { isAuthorizedNode } = await import('@/lib/link/auth')
        const settings = readSettingsFile()
        if (settings.link.role !== 'master') return json(403, { ok: false, message: 'That machine is not a master.' })
        if (!isAuthorizedNode(request.headers, settings)) return json(401, { ok: false, message: 'The token was refused.' })
        const { openHistoryDb, LATEST_SCHEMA_VERSION } = await import('@/lib/history/history-db')
        const { selfMachineId } = await import('@/lib/link/machines')
        const db = openHistoryDb()
        try {
          const self = db.prepare('SELECT name FROM machines WHERE machine_id = ?').get(selfMachineId(db))
          return json(200, { ok: true, name: String(self?.name ?? 'Master'), schemaVersion: LATEST_SCHEMA_VERSION })
        } finally {
          db.close()
        }
      },
    },
  },
})
