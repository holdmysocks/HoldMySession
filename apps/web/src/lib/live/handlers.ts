import { z } from 'zod'

/**
 * What a node can be asked for. Each answer is the same thing the node's own pages show, worked out
 * now, so the master draws exactly what the node would. Server only.
 */
const detailParams = z.object({ sessionId: z.string().min(1).max(200), projectKey: z.string().min(1).max(512) })
const mapParams = z.object({ projectKey: z.string().min(1).max(512) })

export const COMMAND_KINDS = ['sessions', 'session-detail', 'project-map', 'map-projects', 'hook-events', 'sync'] as const
export type CommandKind = (typeof COMMAND_KINDS)[number]

export async function runCommand(kind: string, params: unknown): Promise<unknown> {
  switch (kind) {
    case 'sessions': {
      const { liveSessions } = await import('./sessions')
      return liveSessions()
    }
    case 'session-detail': {
      const { loadSessionDetail } = await import('./session-detail')
      return loadSessionDetail(detailParams.parse(params))
    }
    case 'project-map': {
      const { computeProjectMap } = await import('./project-map')
      return computeProjectMap(mapParams.parse(params).projectKey)
    }
    case 'map-projects': {
      const { computeMapProjects } = await import('./project-map')
      return computeMapProjects()
    }
    case 'hook-events': {
      const { computeHookEvents } = await import('./project-map')
      return computeHookEvents()
    }
    case 'sync': {
      // A scan, and the push that follows it, brings the master's stats up to date.
      const { runHistoryScan } = await import('@/lib/history/scan')
      await runHistoryScan()
      return { ok: true }
    }
    default:
      throw new Error(`Unknown request: ${kind}`)
  }
}
