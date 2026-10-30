import { z } from 'zod'

/**
 * Shape of the map layouts the dashboard saves on the server. No Node imports, so the browser and
 * the server can both validate with it.
 */

/** Object keys that must never be accepted, so a saved key can not reach an object's prototype. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const keySchema = z
  .string()
  .min(1)
  .max(500)
  .refine((key) => !FORBIDDEN_KEYS.has(key), 'reserved key')

/** A project key: the directory name of the project, as the map uses it. */
export const ProjectKeySchema = keySchema

const coordinate = z.number().min(-1_000_000).max(1_000_000)

/** Positions by node ID, as each node's top-left corner. */
export const NodePositionsSchema = z
  .record(keySchema, z.object({ x: coordinate, y: coordinate }))
  .refine((positions) => Object.keys(positions).length <= 5000, 'too many nodes')

export const LayoutFileSchema = z.object({
  version: z.literal(1),
  projects: z.record(keySchema, NodePositionsSchema),
})

export type LayoutFile = z.infer<typeof LayoutFileSchema>
