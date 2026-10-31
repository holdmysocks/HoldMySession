import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SessionList } from '@/features/sessions/SessionList'

const sessionsSearchSchema = z.object({
  page: z.number().int().min(1).default(1).catch(1),
  pageSize: z.number().int().min(5).max(100).default(10).catch(10),
  search: z.string().default('').catch(''),
  status: z.enum(['all', 'active', 'completed', 'needs-you', 'done']).default('all').catch('all'),
  project: z.string().default('').catch(''),
  sort: z
    .enum(['lastActive', 'started', 'duration', 'messages'])
    .default('lastActive')
    .catch('lastActive'),
  sortDir: z.enum(['asc', 'desc']).default('desc').catch('desc'),
})

export type SessionsSearch = z.infer<typeof sessionsSearchSchema>

export const Route = createFileRoute('/_dashboard/sessions/')({
  validateSearch: sessionsSearchSchema,
  component: SessionsPage,
})

function SessionsPage() {
  return <SessionList />
}
