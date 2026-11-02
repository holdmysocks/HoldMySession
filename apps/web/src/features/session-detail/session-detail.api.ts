import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const inputSchema = z.object({ sessionId: z.string().min(1).max(200), projectKey: z.string().min(1).max(512), machineId: z.string().optional() })

/**
 * One session's detail. With a machine chosen on a master, the node that owns the session is asked
 * for it and answers while this page is open. Otherwise it is read from this computer.
 */
export const getSessionDetail = createServerFn({ method: 'GET' })
  .validator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { remoteCallFor } = await import('@/lib/link/remote-call')
    const remote = await remoteCallFor<Awaited<ReturnType<typeof import('@/lib/live/session-detail').loadSessionDetail>>>(
      data.machineId,
      'session-detail',
      { sessionId: data.sessionId, projectKey: data.projectKey },
    )
    if (remote.used) return remote.data
    const { loadSessionDetail } = await import('@/lib/live/session-detail')
    return loadSessionDetail(data)
  })
