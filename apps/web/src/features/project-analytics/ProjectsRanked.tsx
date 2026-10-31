import { Link } from '@tanstack/react-router'
import { formatRelativeTime, formatTokenCount } from '@/lib/utils/format'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import type { ProjectAnalytics } from './project-analytics.api'

/** Projects ranked by output tokens, each linking to its own stats. The unlinked group comes last and muted. */
export function ProjectsRanked({ projects }: { projects: ProjectAnalytics[] }) {
  const { anonymizeProjectName } = usePrivacy()
  const rows = [
    ...projects.filter((p) => !p.isUnlinked).sort((a, b) => b.outputTokens - a.outputTokens),
    ...projects.filter((p) => p.isUnlinked),
  ]
  if (rows.length === 0) return null
  const max = Math.max(...rows.map((p) => p.outputTokens), 1)

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <h3 className="text-sm font-semibold text-gray-300">Projects</h3>
      <p className="mt-1 text-xs text-gray-500">Ranked by output tokens. Open one for its own stats.</p>
      <ul className="mt-3 divide-y divide-gray-800">
        {rows.map((p) => (
          <li key={p.projectPath}>
            <Link
              to="/stats"
              search={{ tab: 'by-project', project: p.projectPath, range: 'all' }}
              className={`grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3 transition-colors hover:bg-gray-800/50 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto_auto] ${
                p.isUnlinked ? 'opacity-60' : ''
              }`}
            >
              <span className="flex min-w-0 items-center gap-2 text-sm text-gray-100">
                <span className="truncate">{p.isUnlinked ? p.displayName : anonymizeProjectName(p.displayName)}</span>
                {p.isUnlinked && (
                  <span className="shrink-0 rounded-full border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400">
                    no project
                  </span>
                )}
              </span>
              <span className="text-right font-mono text-xs text-gray-300 sm:order-3">
                {formatTokenCount(p.outputTokens)}
              </span>
              <span className="col-span-2 h-1.5 rounded-full bg-gray-800 sm:order-2 sm:col-span-1">
                <span
                  className="block h-full rounded-full bg-brand-400"
                  style={{ width: `${(p.outputTokens / max) * 100}%` }}
                />
              </span>
              <span className="hidden text-right text-xs text-gray-500 sm:order-4 sm:block">
                {p.totalSessions} {p.totalSessions === 1 ? 'session' : 'sessions'} · {formatRelativeTime(p.lastSessionAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
