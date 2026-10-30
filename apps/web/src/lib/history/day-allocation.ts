/** The local calendar day (yyyy-MM-dd) of an ISO timestamp, or null if it is not a date. */
export function localDay(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Splits `total` across days in proportion to `weights`, in whole numbers that add up to exactly
 * `total` (largest remainder). A day with a bigger share of the work gets a bigger share of the tokens.
 */
export function splitByWeight(total: number, weights: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>()
  const sum = [...weights.values()].reduce((a, b) => a + b, 0)
  if (total <= 0 || sum <= 0) return out

  const parts = [...weights.entries()]
    .filter(([, w]) => w > 0)
    .map(([day, w]) => {
      const exact = (total * w) / sum
      return { day, whole: Math.floor(exact), rest: exact - Math.floor(exact) }
    })
  let left = total - parts.reduce((a, p) => a + p.whole, 0)
  // Hand the leftover units to the biggest remainders; ties go to the earlier day.
  const order = [...parts].sort((a, b) => b.rest - a.rest || (a.day < b.day ? -1 : 1))
  for (const p of order) {
    if (left <= 0) break
    p.whole += 1
    left -= 1
  }
  for (const p of parts) out.set(p.day, p.whole)
  return out
}
