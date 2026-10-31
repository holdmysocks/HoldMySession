import { PillSelect } from '@/components/ui/PillSelect'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMachineScope } from '@/features/link/useMachineScope'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import { projectAnalyticsQueryFor } from './project-analytics.queries'

/** The project pill in the top bar of Stats. "All projects", or the one the page is about, outlined in the accent. */
export function ProjectFilter() {
  const navigate = useNavigate()
  const { anonymizeProjectName } = usePrivacy()
  const search = useSearch({ strict: false }) as { project?: string; range?: string }
  const machineId = useMachineScope().machineId
  const { data } = useQuery(projectAnalyticsQueryFor(machineId))
  const projects = data?.projects ?? []
  if (projects.length === 0) return null
  const value = projects.some((p) => p.projectPath === search.project) ? search.project! : ''
  return (
    <PillSelect
      label="Project"
      value={value}
      accent={!!value}
      className="max-w-[220px]"
      align="right"
      onChange={(v) => navigate({ to: '/stats', search: (prev: Record<string, unknown>) => ({ ...prev, project: v || undefined }) })}
      options={[
        { value: '', label: 'All projects' },
        ...projects.map((p) => ({ value: p.projectPath, label: p.isUnlinked ? p.displayName : anonymizeProjectName(p.displayName) })),
      ]}
    />
  )
}
