import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { parseStats } from '@/lib/parsers/stats-parser'

const inputSchema = z.object({ machineId: z.string().optional() })

// The history database is read first, so Stats still has the history when the Claude folder has been cleared,
// and so a master can show one machine or all of them. If it cannot be used, the session files are read as before.
export const getStats = createServerFn({ method: 'GET' })
  .inputValidator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { loadHistoryStats } = await import('@/lib/history/history-read')
    const fromHistory = await loadHistoryStats({ machineId: data.machineId })
    if (fromHistory || data.machineId) return fromHistory
    // Without the history database the stats carry no open time per day, so it is worked out from the session files.
    const stats = await parseStats()
    if (!stats) return null
    const { scanAllSessions } = await import('@/lib/scanner/session-scanner')
    const { addOpenTime } = await import('@/lib/stats/open-time')
    return addOpenTime(stats, await scanAllSessions())
  })
