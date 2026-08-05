import type { QueryRow } from './connection'

/**
 * Read a column from a result row regardless of backend shape.
 *
 * sql.js returns positional arrays, while the native driver returns keyed
 * objects. `index` selects from the former and `key` from the latter, so a
 * single row mapper can serve both backends.
 */
export function readQueryRowValue(row: QueryRow, index: number, key: string): unknown {
  return Array.isArray(row) ? row[index] : row[key]
}
