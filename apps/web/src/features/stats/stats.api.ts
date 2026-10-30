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
    return (await loadHistoryStats({ machineId: data.machineId })) ?? (data.machineId ? null : parseStats())
  })
