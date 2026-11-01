import { createFileRoute } from '@tanstack/react-router'

/**
 * What the desktop app asks every few seconds: whether to alert, and which sessions of this computer
 * are waiting on the user. Read-only, and the same information the Map and Sessions pages show.
 */
export const Route = createFileRoute('/api/needs-you')({
  server: {
    handlers: {
      GET: async () => {
        const { readSettingsFile } = await import('@/lib/settings-file')
        const { listWaitingSessions } = await import('@/lib/live/waiting')
        const enabled = readSettingsFile().needsYouAlerts
        let waiting: Awaited<ReturnType<typeof listWaitingSessions>> = []
        try {
          waiting = await listWaitingSessions()
        } catch {
          // A scan that fails this time is tried again at the next ask.
        }
        return new Response(JSON.stringify({ enabled, waiting }), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        })
      },
    },
  },
})
