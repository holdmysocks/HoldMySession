import type { ModelUsage } from '@/lib/parsers/types'
import { formatTokenCount } from '@/lib/utils/format'
import { modelColor, TOP_MODELS } from './model-colors'

/** The top models by tokens as ranked rows with a bar each, and the rest grouped as "Other". */
export function ModelUsageChart({ data }: { data: ModelUsage }) {
  // "<synthetic>" is a placeholder Claude Code writes for messages it made itself, not a model.
  const all = Object.entries(data)
    .filter(([model, usage]) => !model.startsWith('<') && usage.inputTokens + usage.outputTokens > 0)
    .map(([model, usage]) => ({
      name: model.replace(/^claude-/, '').split('-202')[0],
      tokens: usage.inputTokens + usage.outputTokens,
    }))
    .sort((a, b) => b.tokens - a.tokens)

  const rows = all.slice(0, TOP_MODELS).map((m, i) => ({ ...m, color: modelColor(i, false) }))
  const rest = all.slice(TOP_MODELS)
  if (rest.length > 0) {
    rows.push({ name: 'Other', tokens: rest.reduce((sum, m) => sum + m.tokens, 0), color: modelColor(0, true) })
  }
  const max = Math.max(...rows.map((r) => r.tokens), 1)

  return (
    <div className="flex flex-col rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <h3 className="text-sm font-semibold text-gray-300">Models</h3>
      <p className="mt-1 text-xs text-gray-500">Input and output tokens by model</p>
      <ul className="mt-4 flex flex-col gap-4">
        {rows.map((r) => (
          <li key={r.name}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-gray-200">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                {r.name}
              </span>
              <span className="font-mono text-xs text-gray-400">{formatTokenCount(r.tokens)}</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-gray-800">
              <div className="h-full rounded-full" style={{ width: `${(r.tokens / max) * 100}%`, backgroundColor: r.color }} />
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="text-sm text-gray-500">No model usage yet</li>}
      </ul>
    </div>
  )
}
