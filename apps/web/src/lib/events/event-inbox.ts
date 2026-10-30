import * as fs from 'node:fs/promises'
import { dataDir } from '@/lib/data-dir'
import * as path from 'node:path'
import { z } from 'zod'

/**
 * Hook events written by bin/holdmysession-hook.mjs, one JSON object per line.
 * The dashboard only reads this file; the hook is the sole writer.
 */

export const HookEventSchema = z.object({
  ts: z.string(),
  event: z.string(),
  sessionId: z.string(),
  cwd: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
  /** Notification only: permission_prompt, idle_prompt, elicitation_dialog, and so on. */
  notificationType: z.string().nullable().optional(),
  /** Notification only, optional in Claude Code's hook input. */
  title: z.string().nullable().optional(),
})

export type HookEvent = z.infer<typeof HookEventSchema>

/**
 * Must match the path the hook script writes to. The hook cannot import from src/,
 * so it repeats this logic; the hook test checks the two agree.
 */
export function getEventLogPath(): string {
  return path.join(dataDir(), 'events.jsonl')
}

/**
 * Parse JSONL text and return the last `limit` valid events in file order.
 * Blank and invalid lines are skipped. Scans from the end, so it stops early
 * once it has enough events.
 */
export function parseEventLines(text: string, limit: number): HookEvent[] {
  if (limit <= 0) return []

  const lines = text.split('\n')
  const picked: HookEvent[] = []

  for (let i = lines.length - 1; i >= 0 && picked.length < limit; i--) {
    const line = lines[i].trim()
    if (!line) continue

    let raw: unknown
    try {
      raw = JSON.parse(line)
    } catch {
      continue
    }

    const result = HookEventSchema.safeParse(raw)
    if (result.success) picked.push(result.data)
  }

  return picked.reverse()
}

/** Read the most recent `limit` events. Returns [] when the log does not exist yet. */
export async function readRecentEvents(limit = 500): Promise<HookEvent[]> {
  let text: string
  try {
    text = await fs.readFile(getEventLogPath(), 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  return parseEventLines(text, limit)
}

/**
 * Latest Notification timestamp per session. Compares instants, so timestamps
 * written with different offsets still order correctly. Unparseable timestamps are ignored.
 */
export function latestNotificationBySession(events: HookEvent[]): Map<string, string> {
  const latest = new Map<string, string>()

  for (const event of events) {
    if (event.event !== 'Notification') continue
    const time = Date.parse(event.ts)
    if (Number.isNaN(time)) continue

    const current = latest.get(event.sessionId)
    if (current === undefined || time > Date.parse(current)) {
      latest.set(event.sessionId, event.ts)
    }
  }

  return latest
}
