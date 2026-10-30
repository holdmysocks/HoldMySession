import { useId, useState } from 'react'
import { formatTokenCount } from '@/lib/utils/format'
import type { TokenBreakdown } from './token-breakdown'

/**
 * Every token processed: the prompt (new input plus what was read from or written to the cache),
 * the answer, and the reasoning the model did before answering. The three add up to the total.
 * Only the total shows at first. The arrow opens the breakdown.
 */
export function TokenCard({ breakdown }: { breakdown: TokenBreakdown }) {
  const [open, setOpen] = useState(false)
  const detailId = useId()
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between text-left text-xs text-gray-400 hover:text-gray-200"
      >
        <span>Total Tokens</span>
        <svg
          viewBox="0 0 16 16"
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      <p className="mt-1 text-xl font-bold text-gray-100">{formatTokenCount(breakdown.total)}</p>
      {open && (
        <dl id={detailId} className="mt-2 space-y-0.5 text-xs text-gray-500">
          <TokenRow label="Input (prompt)" value={breakdown.input} />
          <TokenRow label="new" value={breakdown.uncachedInput} indent />
          <TokenRow label="cache read" value={breakdown.cacheRead} indent />
          <TokenRow label="cache write" value={breakdown.cacheWrite} indent />
          <TokenRow label="Output (answer)" value={breakdown.output} />
          <TokenRow
            label="Reasoning"
            value={breakdown.reasoning}
            title="Internal reasoning before the answer. Billed as output. Read from session transcripts."
          />
        </dl>
      )}
    </div>
  )
}

function TokenRow({
  label,
  value,
  indent,
  title,
}: {
  label: string
  value: number
  indent?: boolean
  title?: string
}) {
  return (
    <div className={`flex justify-between gap-2 ${indent ? 'pl-3 text-gray-600' : ''}`} title={title}>
      <dt>{label}</dt>
      <dd className="font-mono text-gray-300">{formatTokenCount(value)}</dd>
    </div>
  )
}
