import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { NodePositionsSchema, ProjectKeySchema } from '@/lib/map/layout-schema'
import { readProjectLayout, writeProjectLayout } from '@/lib/map/layout-store'
import type { NodePositions } from '@/lib/map/layout'

const getInput = z.object({ projectKey: ProjectKeySchema })
const saveInput = z.object({ projectKey: ProjectKeySchema, positions: NodePositionsSchema })

/** The layout the user arranged for a project, or an empty object when there is none. */
export const getMapLayout = createServerFn({ method: 'GET' })
  .validator((input: unknown) => getInput.parse(input))
  .handler(async ({ data }): Promise<NodePositions> => readProjectLayout(data.projectKey))

/** Replaces the saved layout for a project. Empty positions clear it. */
export const saveMapLayout = createServerFn({ method: 'POST' })
  .validator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data }): Promise<NodePositions> => {
    await writeProjectLayout(data.projectKey, data.positions)
    return data.positions
  })
