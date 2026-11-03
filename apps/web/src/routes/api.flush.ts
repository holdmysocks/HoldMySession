import { createFileRoute } from '@tanstack/react-router'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

/**
 * Reads what changed in Claude's transcripts and, on a node, sends it to its master, now. The desktop app asks for this just
 * before it quits for being idle, so the master has the latest sessions without waiting for the next start. It needs a header
 * that a web page on another site cannot send, so a page in a browser cannot make a computer scan.
 */
export const Route = createFileRoute('/api/flush')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        if (request.headers.get('x-hms-flush') !== '1') return json(403, { ok: false, message: 'Refused.' })
        const { runHistoryScan } = await import('@/lib/history/scan')
        const outcome = await runHistoryScan()
        return json(200, { ok: outcome.ok, message: outcome.message })
      },
    },
  },
})
