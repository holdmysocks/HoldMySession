import * as fs from 'node:fs'
import { createFileRoute } from '@tanstack/react-router'

/** Downloads one backup file from the backups folder, by name. */
export const Route = createFileRoute('/api/history-backup')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const { backupPath } = await import('@/lib/history/backup')
        const name = new URL(request.url).searchParams.get('name') ?? ''
        const file = backupPath(name)
        if (!file || !fs.existsSync(file)) return new Response('Not found', { status: 404 })
        return new Response(new Uint8Array(fs.readFileSync(file)), {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${name}"`,
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
