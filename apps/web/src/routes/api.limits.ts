import { createFileRoute } from '@tanstack/react-router'

/**
 * What the desktop app asks every half minute to alert on the subscription limits and to show them in the tray's
 * tooltip. Read-only, and the same numbers the header chip shows.
 */
export const Route = createFileRoute('/api/limits')({
  server: {
    handlers: {
      GET: async () => {
        const { readLiveLimits } = await import('@/lib/usage/live-limits')
        return new Response(JSON.stringify(readLiveLimits()), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        })
      },
    },
  },
})
