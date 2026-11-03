import { z } from 'zod'

/** What a node sends a master, and what the master sends back. Both sides use these shapes. */

export const UsageRowSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  model: z.string().max(200),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  thinking_tokens: z.number().int().min(0),
  cache_read_tokens: z.number().int().min(0),
  cache_write_tokens: z.number().int().min(0),
})

export const ActivityRowSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  messages: z.number().int().min(0),
  tool_calls: z.number().int().min(0),
})

export const SessionRowSchema = z.object({
  session_key: z.string().min(1).max(500),
  session_id: z.string().max(200),
  project_key: z.string().max(500),
  project_path: z.string().max(2000),
  project_display_name: z.string().max(500),
  session_name: z.string().max(2000).nullable(),
  started_at: z.string().max(40),
  last_active_at: z.string().max(40),
  duration_ms: z.number().int().min(0),
  message_count: z.number().int().min(0),
  tool_call_count: z.number().int().min(0),
  on_disk: z.number().int().min(0).max(1),
  first_seen_at: z.string().max(40),
  cwd: z.string().max(2000).nullable(),
  project_name: z.string().max(500).nullable(),
  usage: z.array(UsageRowSchema).max(100_000),
  activity: z.array(ActivityRowSchema).max(100_000),
})

export const MachineInfoSchema = z.object({
  machineId: z.string().min(8).max(100),
  name: z.string().min(1).max(60),
  nameUpdatedAt: z.string().max(40),
  appVersion: z.string().max(40).nullable(),
  schemaVersion: z.number().int(),
  /** The node's quit-when-idle choice, so the master can show it. Absent from a node that predates it. */
  idle: z
    .object({
      quit: z.boolean(),
      minutes: z.union([z.literal(10), z.literal(30), z.literal(60), z.literal(120)]),
      updatedAt: z.string().max(40).optional(),
    })
    .optional(),
})

export const PushSchema = z.object({
  machine: MachineInfoSchema,
  sessions: z.array(SessionRowSchema).max(500),
})

export type SessionPayload = z.infer<typeof SessionRowSchema>
export type PushPayload = z.infer<typeof PushSchema>

/** What the master owns and every linked node reads: prices, plans and the price overrides. */
export interface SharedPayload {
  priceEntries: Array<{
    id: number; modelId: string; kind: 'from' | 'window'; startDay: string; endDay: string | null
    inputPerMTok: number; outputPerMTok: number; cacheReadPerMTok: number; cacheWritePerMTok: number
    note: string | null; createdAt: string
  }>
  subscriptionPeriods: Array<{ id: number; tier: string; monthlyUSD: number; startDay: string; note: string | null; createdAt: string }>
  pricingOverrides: Record<string, { inputPerMTok: number; outputPerMTok: number; cacheReadPerMTok: number; cacheWritePerMTok: number }>
}

export interface PushResponse {
  ok: true
  accepted: number
  /** The name the master holds for this node, and when it was set. The newer of the two names wins. */
  name: string
  nameUpdatedAt: string
  masterName: string
  shared: SharedPayload
  /** What the master holds for this node alone. The node takes it if it is newer than its own. */
  nodeSettings?: { idle?: { quit: boolean; minutes: 10 | 30 | 60 | 120; updatedAt: string } }
}
