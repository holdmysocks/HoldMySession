import { Link } from '@tanstack/react-router'
import { formatAgo, formatTokenCount } from '@/lib/utils/format'
import { usePrivacy } from '@/features/privacy/PrivacyContext'
import type { StatsRange } from '@/features/stats/stats-range'
import type { ProjectAnalytics } from './project-analytics.api'

export function formatMoney(usd: number): string {
  if (usd >= 100) return '$' + Math.round(usd).toLocaleString('en-US')
  return '$' + usd.toFixed(2)
}

/** Every project, biggest first, with what it used and what that would cost at API prices. The unlinked group is last and muted. */
export function ProjectsTable({
  projects,
  byProject,
  range,
}: {
  range: StatsRange
  projects: ProjectAnalytics[]
  byProject: Record<string, { usd: number; tokens: number }> | undefined
}) {
  const { anonymizeProjectName } = usePrivacy()
  const tokensOf = (p: ProjectAnalytics) => byProject?.[p.projectPath]?.tokens ?? p.outputTokens
  const rows = [
    ...projects.filter((p) => !p.isUnlinked).sort((a, b) => tokensOf(b) - tokensOf(a)),
    ...projects.filter((p) => p.isUnlinked),
  ]
  if (rows.length === 0) return null
  const max = Math.max(...rows.map(tokensOf), 1)

  return (
    <section aria-label="Projects" className="border-t border-[color:var(--hms-rule)] pt-7">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="font-display text-xl font-semibold">Projects</h2>
        <span className="text-[13px] text-[color:var(--hms-mute)]">Select a project to see this whole page for just that one</span>
      </div>
      <div className="hidden flex-wrap gap-x-5 gap-y-1 border-b border-[color:var(--hms-rule)] py-2.5 text-xs text-[color:var(--hms-mute)] sm:flex">
        <span className="min-w-full flex-1 sm:min-w-[180px]">Project</span>
        <span className="min-w-[240px] flex-[2]">Tokens</span>
        <span className="w-20 text-right">Sessions</span>
        <span className="w-[100px] text-right">API price</span>
        <span className="w-[100px] text-right">Last active</span>
      </div>
      {rows.map((p) => {
        const tokens = tokensOf(p)
        const cost = byProject?.[p.projectPath]?.usd
        return (
          <Link
            key={p.projectPath}
            to="/stats"
            search={{ project: p.projectPath, range }}
            className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-[color:var(--hms-rule)] py-4 transition-colors hover:bg-[color:var(--hms-track)] ${
              p.isUnlinked ? 'text-[color:var(--hms-sub)]' : ''
            }`}
          >
            <span className="min-w-full flex-1 sm:min-w-[180px]">
              <b className="font-display text-[17px] font-semibold">{p.isUnlinked ? p.displayName : anonymizeProjectName(p.displayName)}</b>
              {p.isUnlinked && (
                <span className="ml-2.5 rounded-full border border-[color:var(--hms-line)] px-[9px] py-0.5 align-[2px] text-[11px] text-[color:var(--hms-mute)]">
                  no project
                </span>
              )}
            </span>
            <span className="flex min-w-full flex-[2] items-center gap-3 sm:min-w-[240px]">
              <span className="h-2 flex-1 rounded bg-[color:var(--hms-track)]">
                <span
                  className="block h-2 rounded"
                  style={{
                    width: `${Math.max(2, Math.round((tokens / max) * 100))}%`,
                    background: p.isUnlinked
                      ? 'var(--hms-mute)'
                      : 'linear-gradient(90deg, var(--color-brand-500), var(--color-brand-300))',
                    boxShadow: p.isUnlinked ? undefined : '0 0 10px var(--hms-glow-strong)',
                  }}
                />
              </span>
              <span className="w-16 text-right tabular-nums">{formatTokenCount(tokens)}</span>
            </span>
            <span className="w-auto text-xs text-[color:var(--hms-mute)] tabular-nums sm:w-20 sm:text-right sm:text-base sm:text-inherit">{p.totalSessions} sessions</span>
            <span className="w-auto text-xs text-[color:var(--hms-mute)] tabular-nums sm:w-[100px] sm:text-right sm:text-base sm:text-inherit">{cost !== undefined ? formatMoney(cost) : '-'}</span>
            <span className="w-auto text-xs text-[color:var(--hms-mute)] sm:w-[100px] sm:text-right sm:text-base">{formatAgo(p.lastSessionAt)}</span>
          </Link>
        )
      })}
    </section>
  )
}
