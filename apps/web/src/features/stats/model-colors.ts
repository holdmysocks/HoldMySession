/** Layer colours for models. A family keeps its own colour; a second model of the same family takes a spare. */
const FAMILY_COLORS: Record<string, string> = { opus: '#D97757', sonnet: '#6A9BCC', haiku: '#788C5D' }
const SPARE_COLORS = ['#C46686', '#C9A82D', '#8F7BE0', '#4FB8A8']
export const OTHER_COLOR = '#B0AEA5'
export const TOP_MODELS = 3

/** "claude-opus-5-5-20260101" becomes "Opus 5.5". */
export function prettyModel(raw: string): string {
  const parts = raw.replace(/^claude-/, '').split('-202')[0].split('-')
  const words = parts.filter((p) => !/^\d+$/.test(p))
  const nums = parts.filter((p) => /^\d+$/.test(p))
  const name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return nums.length > 0 ? `${name} ${nums.join('.')}` : name
}

/** One colour for each name, in order, so no two top models share one. */
export function assignColors(names: string[]): string[] {
  const used = new Set<string>()
  let spare = 0
  return names.map((name) => {
    const family = Object.keys(FAMILY_COLORS).find((f) => name.toLowerCase().startsWith(f))
    let color = family ? FAMILY_COLORS[family] : undefined
    if (!color || used.has(color)) color = SPARE_COLORS[spare++ % SPARE_COLORS.length]
    used.add(color)
    return color
  })
}

/** The theme's line colour for a family, so a line reads on a light page too. Other colours stand as they are. */
export function lineOf(color: string): string {
  const family = Object.keys(FAMILY_COLORS).findIndex((f) => FAMILY_COLORS[f] === color)
  if (family >= 0) return `var(--hms-l${family + 1})`
  return color === OTHER_COLOR ? 'var(--hms-l4)' : color
}
