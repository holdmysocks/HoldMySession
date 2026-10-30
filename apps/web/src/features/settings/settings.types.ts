import { z } from 'zod'

// --- Zod Schemas ---

export const ModelPricingOverrideSchema = z.object({
  inputPerMTok: z.number().min(0),
  outputPerMTok: z.number().min(0),
  cacheReadPerMTok: z.number().min(0),
  cacheWritePerMTok: z.number().min(0),
})

/** How often the history database is refreshed by itself, in minutes. */
export const AUTO_SCAN_INTERVALS = [5, 10, 15, 30, 60, 120, 360, 720, 1440] as const

export const AutoScanSchema = z.object({
  enabled: z.boolean().default(true),
  intervalMinutes: z
    .number()
    .int()
    .refine((n) => (AUTO_SCAN_INTERVALS as readonly number[]).includes(n), 'Not one of the offered intervals')
    .default(15),
})

export const SettingsSchema = z.object({
  version: z.literal(1),
  subscriptionTier: z
    .enum(['free', 'pro', 'max-5x', 'max-20x', 'teams', 'enterprise', 'api'])
    .default('pro'),
  autoScan: AutoScanSchema.default({ enabled: true, intervalMinutes: 15 }),
  pricingOverrides: z
    .record(z.string(), ModelPricingOverrideSchema)
    .default({}),
  dataSources: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        path: z.string(),
        enabled: z.boolean().default(true),
      }),
    )
    .default([]),
  updatedAt: z.string().datetime().optional(),
})

// --- TypeScript Types ---

export type ModelPricingOverride = z.infer<typeof ModelPricingOverrideSchema>
export type Settings = z.infer<typeof SettingsSchema>
export type AutoScanSetting = z.infer<typeof AutoScanSchema>
export type SubscriptionTierId = Settings['subscriptionTier']

export interface ModelPricing {
  modelId: string
  displayName: string
  inputPerMTok: number
  outputPerMTok: number
  cacheReadPerMTok: number
  cacheWritePerMTok: number
}

export interface SubscriptionTier {
  id: SubscriptionTierId
  displayName: string
  monthlyUSD: number | null
}

// --- Constants ---

/**
 * USD per million tokens. Cache write is the 5-minute rate (1.25x input). The Claude 5 models
 * are listed first. Haiku 5.5 is priced for prompts up to 100K tokens; longer prompts are billed
 * at $0.50 input / $2.50 output, which the table cannot express, so edit the override for those.
 */
export const DEFAULT_PRICING: ModelPricing[] = [
  {
    modelId: 'claude-fable-5-1',
    displayName: 'Claude Fable 5.1',
    inputPerMTok: 10.0,
    outputPerMTok: 50.0,
    cacheReadPerMTok: 0.25,
    cacheWritePerMTok: 12.5,
  },
  {
    modelId: 'claude-opus-5-5',
    displayName: 'Claude Opus 5.5',
    inputPerMTok: 4.0,
    outputPerMTok: 20.0,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: 5.0,
  },
  {
    modelId: 'claude-sonnet-5-5',
    displayName: 'Claude Sonnet 5.5',
    inputPerMTok: 2.0,
    outputPerMTok: 10.0,
    cacheReadPerMTok: 0.1,
    cacheWritePerMTok: 2.5,
  },
  {
    modelId: 'claude-haiku-5-5',
    displayName: 'Claude Haiku 5.5',
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    cacheReadPerMTok: 0.01,
    cacheWritePerMTok: 0.125,
  },
  {
    modelId: 'claude-opus-5',
    displayName: 'Claude Opus 5',
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    cacheReadPerMTok: 0.5,
    cacheWritePerMTok: 6.25,
  },
  {
    modelId: 'claude-mythos-5-1',
    displayName: 'Claude Mythos 5.1',
    inputPerMTok: 10.0,
    outputPerMTok: 50.0,
    cacheReadPerMTok: 0.25,
    cacheWritePerMTok: 12.5,
  },
  {
    modelId: 'claude-fable-5',
    displayName: 'Claude Fable 5',
    inputPerMTok: 10.0,
    outputPerMTok: 50.0,
    cacheReadPerMTok: 1.0,
    cacheWritePerMTok: 12.5,
  },
  {
    modelId: 'claude-mythos-5',
    displayName: 'Claude Mythos 5',
    inputPerMTok: 10.0,
    outputPerMTok: 50.0,
    cacheReadPerMTok: 1.0,
    cacheWritePerMTok: 12.5,
  },
  {
    modelId: 'claude-sonnet-5',
    displayName: 'Claude Sonnet 5',
    inputPerMTok: 2.0,
    outputPerMTok: 10.0,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: 2.5,
  },
  {
    modelId: 'claude-opus-4-8',
    displayName: 'Claude Opus 4.8',
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    cacheReadPerMTok: 0.5,
    cacheWritePerMTok: 6.25,
  },
  {
    modelId: 'claude-opus-4-7',
    displayName: 'Claude Opus 4.7',
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    cacheReadPerMTok: 0.5,
    cacheWritePerMTok: 6.25,
  },
  {
    modelId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheReadPerMTok: 0.3,
    cacheWritePerMTok: 3.75,
  },
  {
    modelId: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6',
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    cacheReadPerMTok: 0.5,
    cacheWritePerMTok: 6.25,
  },
  {
    modelId: 'claude-opus-4-5',
    displayName: 'Claude Opus 4.5',
    inputPerMTok: 5.0,
    outputPerMTok: 25.0,
    cacheReadPerMTok: 0.5,
    cacheWritePerMTok: 6.25,
  },
  {
    modelId: 'claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5',
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheReadPerMTok: 0.3,
    cacheWritePerMTok: 3.75,
  },
  {
    modelId: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5',
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    cacheReadPerMTok: 0.1,
    cacheWritePerMTok: 1.25,
  },
]

/**
 * Models Anthropic has retired (see the model deprecations page). They are not offered in Settings, but old
 * sessions still name them, so their prices stay in the cost table, and the fallback for an unknown model
 * is one of them.
 */
export const RETIRED_PRICING: ModelPricing[] = [
  {
    modelId: 'claude-opus-4-1',
    displayName: 'Claude Opus 4.1',
    inputPerMTok: 15.0,
    outputPerMTok: 75.0,
    cacheReadPerMTok: 1.5,
    cacheWritePerMTok: 18.75,
  },
  {
    modelId: 'claude-opus-4',
    displayName: 'Claude Opus 4',
    inputPerMTok: 15.0,
    outputPerMTok: 75.0,
    cacheReadPerMTok: 1.5,
    cacheWritePerMTok: 18.75,
  },
  {
    modelId: 'claude-sonnet-4',
    displayName: 'Claude Sonnet 4',
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheReadPerMTok: 0.3,
    cacheWritePerMTok: 3.75,
  },
  {
    modelId: 'claude-haiku-3-5',
    displayName: 'Claude Haiku 3.5',
    inputPerMTok: 0.8,
    outputPerMTok: 4.0,
    cacheReadPerMTok: 0.08,
    cacheWritePerMTok: 1.0,
  },
  {
    modelId: 'claude-haiku-3',
    displayName: 'Claude Haiku 3',
    inputPerMTok: 0.25,
    outputPerMTok: 1.25,
    cacheReadPerMTok: 0.03,
    cacheWritePerMTok: 0.3,
  },
]

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  { id: 'free', displayName: 'Free', monthlyUSD: 0 },
  { id: 'pro', displayName: 'Pro', monthlyUSD: 20 },
  { id: 'max-5x', displayName: 'Max 5x', monthlyUSD: 100 },
  { id: 'max-20x', displayName: 'Max 20x', monthlyUSD: 200 },
  { id: 'teams', displayName: 'Teams', monthlyUSD: 150 },
  { id: 'enterprise', displayName: 'Enterprise', monthlyUSD: null },
  { id: 'api', displayName: 'API Only', monthlyUSD: null },
]

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  subscriptionTier: 'pro',
  autoScan: { enabled: true, intervalMinutes: 15 },
  pricingOverrides: {},
  dataSources: [],
}

// --- Helpers ---

/** Strip date suffix from model IDs: claude-sonnet-4-20250514 -> claude-sonnet-4 */
export function normalizeModelId(raw: string): string {
  return raw.replace(/-\d{8}$/, '')
}
