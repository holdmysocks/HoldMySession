import { createServerFn } from '@tanstack/react-start'
import { parseStats } from '@/lib/parsers/stats-parser'

// The history database is read first, so Stats still has the history when the Claude folder has been cleared.
// If it cannot be used, the session files are read as before.
export const getStats = createServerFn({ method: 'GET' }).handler(async () => {
  const { loadHistoryStats } = await import('@/lib/history/history-read')
  return (await loadHistoryStats()) ?? parseStats()
})
