import { isDay, type PriceEntry } from '@/lib/pricing/price-timeline'
import type { Db } from './sqlite'

export interface NewPriceEntry {
  modelId: string
  kind: 'from' | 'window'
  startDay: string
  endDay: string | null
  inputPerMTok: number
  outputPerMTok: number
  cacheReadPerMTok: number
  cacheWritePerMTok: number
  note: string | null
}

function toEntry(row: Record<string, unknown>): PriceEntry {
  return {
    id: Number(row.id),
    modelId: String(row.model_id),
    kind: row.kind === 'window' ? 'window' : 'from',
    startDay: String(row.start_day),
    endDay: row.end_day === null ? null : String(row.end_day),
    inputPerMTok: Number(row.input_per_mtok),
    outputPerMTok: Number(row.output_per_mtok),
    cacheReadPerMTok: Number(row.cache_read_per_mtok),
    cacheWritePerMTok: Number(row.cache_write_per_mtok),
    note: row.note === null ? null : String(row.note),
    createdAt: String(row.created_at),
  }
}

/** All entries, or one model's, in the order they were made. */
export function listPriceEntries(db: Db, modelId?: string): PriceEntry[] {
  const rows = modelId
    ? db.prepare('SELECT * FROM price_entries WHERE model_id = ? ORDER BY id').all(modelId)
    : db.prepare('SELECT * FROM price_entries ORDER BY id').all()
  return rows.map(toEntry)
}

/** Throws a plain message if the entry is not valid. */
export function validatePriceEntry(entry: NewPriceEntry): void {
  if (!entry.modelId.trim()) throw new Error('Choose a model.')
  if (!isDay(entry.startDay)) throw new Error('The start date is not a valid date.')
  if (entry.kind === 'window') {
    if (!entry.endDay || !isDay(entry.endDay)) throw new Error('A window needs a valid end date.')
    if (entry.endDay < entry.startDay) throw new Error('The window ends before it starts.')
  } else if (entry.endDay !== null) {
    throw new Error('A price from a date has no end date.')
  }
  for (const value of [entry.inputPerMTok, entry.outputPerMTok, entry.cacheReadPerMTok, entry.cacheWritePerMTok]) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Prices must be zero or more.')
  }
}

export function addPriceEntry(db: Db, entry: NewPriceEntry, now: Date = new Date()): PriceEntry {
  validatePriceEntry(entry)
  const result = db
    .prepare(
      `INSERT INTO price_entries (model_id, kind, start_day, end_day, input_per_mtok, output_per_mtok,
         cache_read_per_mtok, cache_write_per_mtok, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.modelId.trim(), entry.kind, entry.startDay, entry.endDay, entry.inputPerMTok, entry.outputPerMTok,
      entry.cacheReadPerMTok, entry.cacheWritePerMTok, entry.note?.trim() || null, now.toISOString(),
    )
  return listPriceEntries(db).find((e) => e.id === Number(result.lastInsertRowid))!
}

/** Removes an entry. The prices around it recalculate, since they are always worked out from the list. */
export function deletePriceEntry(db: Db, id: number): boolean {
  return Number(db.prepare('DELETE FROM price_entries WHERE id = ?').run(id).changes) > 0
}
