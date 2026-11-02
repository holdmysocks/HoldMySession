import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { HookState } from '@/lib/claude-hooks/claude-settings-file'

export type { HookState }

export const getHookState = createServerFn({ method: 'GET' }).handler(async (): Promise<HookState> => {
  const { readHookState } = await import('@/lib/claude-hooks/claude-settings-file')
  return readHookState()
})

/** Adds or removes one hook in Claude Code's settings. The only thing the dashboard ever writes under ~/.claude. */
export const setHookEnabled = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ kind: z.enum(['notify', 'start']), enabled: z.boolean() }).parse(input))
  .handler(async ({ data }): Promise<HookState> => {
    const { setHook } = await import('@/lib/claude-hooks/claude-settings-file')
    return setHook(data.kind, data.enabled)
  })
