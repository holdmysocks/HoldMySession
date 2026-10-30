import { createRequire } from 'node:module'

/** The part of node:sqlite's DatabaseSync that the history database uses. */
export interface Statement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
  get(...params: unknown[]): Record<string, unknown> | undefined
  all(...params: unknown[]): Record<string, unknown>[]
}

export interface Db {
  exec(sql: string): void
  prepare(sql: string): Statement
  close(): void
}

/**
 * Opens a SQLite database with the module built into Node 22. It is loaded with `require` so the
 * bundler leaves it alone, and so the experimental-feature warning only appears when it is used.
 */
export function openSqlite(file: string): Db {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
    DatabaseSync: new (file: string) => Db
  }
  return new DatabaseSync(file)
}
