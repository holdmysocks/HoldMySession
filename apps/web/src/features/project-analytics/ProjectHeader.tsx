import { Link } from '@tanstack/react-router'
import { formatDuration, formatRelativeTime } from '@/lib/utils/format'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import type { ProjectAnalytics } from './project-analytics.api'

/** The top of one project's stats: a way back, its name and path, and a link to its map. */
export function ProjectHeader({ project }: { project: ProjectAnalytics }) {
  const { anonymizeProjectName, anonymizePath } = usePrivacy()
  const name = project.isUnlinked ? project.displayName : anonymizeProjectName(project.displayName)
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
      <div className="min-w-0">
        <Link
          to="/stats"
          search={{ tab: 'overview', range: 'all' }}
          className="text-xs text-gray-400 hover:text-gray-200"
        >
          ← All projects
        </Link>
        <h2 className="mt-1 truncate font-display text-3xl font-extrabold text-gray-100">{name}</h2>
        {!project.isUnlinked && (
          <p className="mt-1 truncate font-mono text-xs text-gray-500">
            {anonymizePath(project.projectPath, project.displayName)}
          </p>
        )}
        <p className="mt-2 text-xs text-gray-400">
          {project.totalSessions} {project.totalSessions === 1 ? 'session' : 'sessions'}
          {' · '}
          {formatDuration(project.totalDurationMs)}
          {' · last active '}
          {formatRelativeTime(project.lastSessionAt)}
        </p>
      </div>
      {!project.isUnlinked && (
        <Link
          to="/map"
          search={{ project: project.projectName }}
          className="rounded-full border border-brand-400 px-4 py-1.5 text-sm text-brand-400 hover:bg-gray-800"
        >
          Open this project on the map
        </Link>
      )}
      {project.isUnlinked && (
        <Link
          to="/sessions"
          search={{ project: project.projectName }}
          className="rounded-full border border-gray-700 px-4 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
        >
          See its sessions
        </Link>
      )}
    </div>
  )
}
