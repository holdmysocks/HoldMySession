import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ProjectMapPage } from '@/features/project-map/ProjectMapPage'

const mapSearchSchema = z.object({
  project: z.string().optional().catch(undefined),
})

export const Route = createFileRoute('/_dashboard/map')({
  validateSearch: mapSearchSchema,
  component: MapRoute,
})

function MapRoute() {
  const { project } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <ProjectMapPage
      project={project}
      onProjectChange={(projectPath) => navigate({ search: { project: projectPath } })}
    />
  )
}
