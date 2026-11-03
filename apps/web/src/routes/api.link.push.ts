import { createFileRoute } from '@tanstack/react-router'

const MAX_BYTES = 50 * 1024 * 1024

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/** A linked node sends its changed sessions here. Only a master with the right token accepts. */
export const Route = createFileRoute('/api/link/push')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { readSettingsFile } = await import('@/lib/settings-file')
        const { isAuthorizedNode } = await import('@/lib/link/auth')
        const settings = readSettingsFile()
        if (settings.link.role !== 'master') return json(403, { ok: false, message: 'This machine is not a master.' })
        if (!isAuthorizedNode(request.headers, settings)) return json(401, { ok: false, message: 'The token was refused.' })
        if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return json(413, { ok: false, message: 'That push is too large.' })

        let body: unknown
        try {
          const text = await request.text()
          if (text.length > MAX_BYTES) return json(413, { ok: false, message: 'That push is too large.' })
          body = JSON.parse(text)
        } catch {
          return json(400, { ok: false, message: 'The data sent was not valid.' })
        }

        const { openHistoryDb } = await import('@/lib/history/history-db')
        const { acceptPush, PushRefused } = await import('@/lib/link/receive')
        const { buildShared } = await import('@/lib/link/shared')
        const { selfMachineId } = await import('@/lib/link/machines')
        const db = openHistoryDb()
        try {
          const result = acceptPush(db, body)
          const self = db.prepare('SELECT name FROM machines WHERE machine_id = ?').get(selfMachineId(db))
          return json(200, {
            ok: true,
            accepted: result.accepted,
            name: result.name,
            nameUpdatedAt: result.nameUpdatedAt,
            masterName: String(self?.name ?? 'Master'),
            shared: buildShared(db, settings),
            // The master's own choice for this node, if it has made one. The node takes it if it is newer than its own.
            nodeSettings: settings.link.nodeIdle[result.machineId] ? { idle: settings.link.nodeIdle[result.machineId] } : undefined,
          })
        } catch (error) {
          if (error instanceof PushRefused) return json(error.status, { ok: false, message: error.message })
          return json(500, { ok: false, message: 'The master could not store that push.' })
        } finally {
          db.close()
        }
      },
    },
  },
})
