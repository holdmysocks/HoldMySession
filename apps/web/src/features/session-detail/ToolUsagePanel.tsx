import { shortenToolName } from './timeline-chart/timeline-colors'

/** Tools shown. The rest are summed into the header count. */
const MAX_ROWS = 15

export function ToolUsagePanel({
  toolFrequency,
}: {
  toolFrequency: Record<string, number>
}) {
  const sorted = Object.entries(toolFrequency).sort(([, a], [, b]) => b - a)
  const maxCount = sorted[0]?.[1] ?? 1

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
        <h3 className="text-sm font-semibold text-gray-300">Tool Usage</h3>
        <p className="mt-2 text-xs text-gray-500">No tools used</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <h3 className="text-sm font-semibold text-gray-300">Tool Usage</h3>
      <p className="mt-1 text-xs text-gray-500">
        {sorted.length} tools, {sorted.reduce((sum, [, n]) => sum + n, 0)} calls
      </p>

      {/* One row per tool: name, bar, count. They share a centre line, so a number always sits level with its bar. */}
      <ul className="mt-3 space-y-1">
        {sorted.slice(0, MAX_ROWS).map(([tool, count]) => (
          <li key={tool} className="flex h-5 items-center gap-2">
            <span className="w-32 shrink-0 truncate text-xs font-mono text-gray-400" title={tool}>
              {shortenToolName(tool)}
            </span>
            <div className="relative h-3 flex-1 rounded bg-gray-800/60">
              <div
                data-bar
                className="absolute inset-y-0 left-0 rounded bg-brand-500/50"
                // Never narrower than a few pixels, so a rarely used tool still shows.
                style={{ width: `${(count / maxCount) * 100}%`, minWidth: 3 }}
              />
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-gray-300">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
