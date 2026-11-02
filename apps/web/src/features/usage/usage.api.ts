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

/** Whether the status line is set up, without reading any transcripts. */
export const getStatusLineState = createServerFn({ method: 'GET' }).handler(async (): Promise<StatusLineState> => {
  const { readStatusLineState } = await import('@/lib/claude-hooks/claude-settings-file')
  return readStatusLineState()
})

/** The settings for the limits: whether the 5-hour meter is drawn, and whether the desktop app alerts on them. */
export const setLimitsSettings = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z.object({ fiveHour: z.enum(['auto', 'always', 'never']).optional(), alerts: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<{ fiveHour: 'auto' | 'always' | 'never'; alerts: boolean }> => {
    const { readSettingsFile, writeSettingsFile } = await import('@/lib/settings-file')
    const current = readSettingsFile()
    const limits = { fiveHour: data.fiveHour ?? current.limits.fiveHour, alerts: data.alerts ?? current.limits.alerts }
    writeSettingsFile({ ...current, limits })
    return limits
  })
