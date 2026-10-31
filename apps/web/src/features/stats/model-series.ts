import type { DailyModelTokens } from '@/lib/parsers/types'
import { assignColors, lineOf, OTHER_COLOR, prettyModel, TOP_MODELS } from './model-colors'

export interface ModelSeries {
  name: string
  color: string
  /** The colour of its line: a family's own line colour in the theme, else its fill colour. */
  line: string
  /** The rest, when this is the "Other" group. */
  note: string
  total: number
  /** Tokens per day, in the order of `days`. */
  values: number[]
}

/** The top models by tokens and the rest grouped as Other, with a series each over the days given. */
export function modelSeries(data: DailyModelTokens[]): { days: string[]; series: ModelSeries[]; grand: number } {
  const days = data.map((d) => d.date)
  const byName = new Map<string, number[]>()
  data.forEach((day, i) => {
    for (const [raw, tokens] of Object.entries(day.tokensByModel)) {
      if (raw.startsWith('<')) continue
      const name = prettyModel(raw)
      const values = byName.get(name) ?? new Array<number>(days.length).fill(0)
      values[i] += tokens
      byName.set(name, values)
    }
  })
  const all = [...byName].map(([name, values]) => ({ name, values, total: values.reduce((s, v) => s + v, 0) }))
  all.sort((a, b) => b.total - a.total)
  const top = all.slice(0, TOP_MODELS)
  const colors = assignColors(top.map((m) => m.name))
  const series: ModelSeries[] = top.map((m, i) => ({ ...m, color: colors[i], line: lineOf(colors[i]), note: '' }))
  const rest = all.slice(TOP_MODELS)
  if (rest.length > 0) {
    series.push({
      name: 'Other',
      color: OTHER_COLOR,
      line: lineOf(OTHER_COLOR),
      note: `${rest.length} more ${rest.length === 1 ? 'model' : 'models'}`,
      total: rest.reduce((s, m) => s + m.total, 0),
      values: days.map((_, i) => rest.reduce((s, m) => s + m.values[i], 0)),
    })
  }
  return { days, series, grand: series.reduce((s, m) => s + m.total, 0) }
}
