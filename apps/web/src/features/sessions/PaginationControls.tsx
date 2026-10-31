import { PillSelect } from '@/components/ui/PillSelect'
import { VALID_SIZES } from './usePageSizePreference'

interface PaginationControlsProps {
  page: number
  totalPages: number
  totalCount: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export function PaginationControls({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  if (totalCount === 0) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalCount)

  const showNavigation = totalPages > 1
  const pageNumbers = showNavigation ? buildPageNumbers(page, totalPages) : []

  const circle = 'flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--hms-line)] text-gray-100 transition-colors hover:border-gray-500 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-[13px] text-[color:var(--hms-mute)]">
        Showing {start} to {end} of {totalCount}
      </p>

      {showNavigation && (
        <div className="flex items-center gap-1">
          <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page" className={circle}>
            ←
          </button>
          {pageNumbers.map((item, i) =>
            item === 'ellipsis' ? (
              <span key={`ellipsis-${i}`} className="w-11 text-center text-sm text-[color:var(--hms-mute)]">
                ...
              </span>
            ) : (
              <button
                key={item}
                onClick={() => onPageChange(item)}
                aria-current={item === page ? 'page' : undefined}
                className={`h-11 min-w-11 rounded-full border text-sm ${
                  item === page ? 'border-[1.5px] border-brand-400 text-brand-400' : 'border-transparent text-gray-100 hover:border-[color:var(--hms-line)]'
                }`}
              >
                {item}
              </button>
            ),
          )}
          <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next page" className={circle}>
            →
          </button>
        </div>
      )}

      <PillSelect
        label="Sessions per page"
        value={String(pageSize)}
        onChange={(v) => onPageSizeChange(Number(v))}
        align="right"
        options={VALID_SIZES.map((size) => ({ value: String(size), label: `${size} / page` }))}
      />
    </div>
  )
}

/**
 * Build an array of page numbers with ellipsis gaps.
 * Shows first page, last page, and 2 pages around current.
 * Example for page 6 of 20: [1, 'ellipsis', 4, 5, 6, 7, 8, 'ellipsis', 20]
 */
function buildPageNumbers(
  current: number,
  total: number,
): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages = new Set<number>()

  // Always include first and last
  pages.add(1)
  pages.add(total)

  // Include 2 pages around current
  for (let i = current - 2; i <= current + 2; i++) {
    if (i >= 1 && i <= total) {
      pages.add(i)
    }
  }

  const sorted = Array.from(pages).sort((a, b) => a - b)
  const result: Array<number | 'ellipsis'> = []

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push('ellipsis')
    }
    result.push(sorted[i])
  }

  return result
}
