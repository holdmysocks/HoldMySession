import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { UsageOverview } from '@/lib/usage/overview'
import type { StatusLineState } from '@/lib/claude-hooks/claude-settings-file'

export type { UsageOverview, StatusLineState }

/** The subscription limits and what the transcripts add up to, for this computer. */
export const getUsageOverview = createServerFn({ method: 'GET' }).handler(async (): Promise<UsageOverview> => {
  const { buildUsageOverview } = await import('@/lib/usage/overview')
  return buildUsageOverview()
})

/**
 * Makes HoldMySession the Claude Code status line so it receives the real limits, or puts the old status line
 * back. Like the hooks, the only thing it writes under ~/.claude.
 */
export const setStatusLineEnabled = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data }): Promise<StatusLineState> => {
    const { setStatusLine } = await import('@/lib/claude-hooks/claude-settings-file')
    return setStatusLine(data.enabled)
  })
