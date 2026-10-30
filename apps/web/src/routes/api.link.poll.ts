import { createFileRoute } from '@tanstack/react-router'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/**
 * A node's open request. The master holds it for up to 25 seconds and answers with anything it wants
 * the node to do, so the node never has to be reachable from the master.
 */
export const Route = createFileRoute('/api/link/poll')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const { readSettingsFile } = await import('@/lib/settings-file')
        const { isAuthorizedNode } = await import('@/lib/link/auth')
        const settings = readSettingsFile()
        if (settings.link.role !== 'master') return json(403, { ok: false, message: 'This machine is not a master.' })
        if (!isAuthorizedNode(request.headers, settings)) return json(401, { ok: false, message: 'The token was refused.' })
        const url = new URL(request.url)
        const machineId = url.searchParams.get('machineId') ?? ''
        if (machineId.length < 8 || machineId.length > 100) return json(400, { ok: false, message: 'A machine id is needed.' })
        const wait = Math.min(Math.max(Number(url.searchParams.get('wait') ?? 25), 0), 30) * 1000
        const { pollCommands } = await import('@/lib/link/channel')
        return json(200, { ok: true, commands: await pollCommands(machineId, wait) })
      },
    },
  },
})
