import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SettingsPage, SETTINGS_TABS } from '@/features/settings/SettingsPage'

const settingsSearchSchema = z.object({
  tab: z.enum(SETTINGS_TABS).default('general').catch('general'),
})

export const Route = createFileRoute('/_dashboard/settings')({
  validateSearch: settingsSearchSchema,
  component: SettingsPageRoute,
})

function SettingsPageRoute() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <SettingsPage tab={tab} onTab={(next) => navigate({ search: { tab: next } })} />
}
