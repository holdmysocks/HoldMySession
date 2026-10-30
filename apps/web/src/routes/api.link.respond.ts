import { createFileRoute } from '@tanstack/react-router'

const MAX_BYTES = 100 * 1024 * 1024

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/** A node's answer to something the master asked for. */
export const Route = createFileRoute('/api/link/respond')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { readSettingsFile } = await import('@/lib/settings-file')
        const { isAuthorizedNode } = await import('@/lib/link/auth')
        const settings = readSettingsFile()
        if (settings.link.role !== 'master') return json(403, { ok: false, message: 'This machine is not a master.' })
        if (!isAuthorizedNode(request.headers, settings)) return json(401, { ok: false, message: 'The token was refused.' })
        if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) return json(413, { ok: false, message: 'That answer is too large.' })
        let body: { machineId?: unknown; id?: unknown; ok?: unknown; data?: unknown; error?: unknown }
        try {
          body = JSON.parse(await request.text())
        } catch {
          return json(400, { ok: false, message: 'The data sent was not valid.' })
        }
        if (typeof body.machineId !== 'string' || typeof body.id !== 'string') return json(400, { ok: false, message: 'Missing machine or request id.' })
        const { completeCall } = await import('@/lib/link/channel')
        const found = completeCall(body.machineId, body.id, {
          ok: body.ok === true,
          data: body.data,
          error: typeof body.error === 'string' ? body.error : undefined,
        })
        return json(found ? 200 : 404, { ok: found })
      },
    },
  },
})
