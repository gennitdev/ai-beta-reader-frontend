import type { DatabaseContext } from './connection'

/**
 * Return the set of column names on a table, across both backends.
 *
 * Uses `PRAGMA table_info`, which is available on sql.js and the native driver
 * alike. Repositories use this for lightweight schema-capability detection
 * (e.g. deciding whether an optional column exists yet) without a migration.
 */
export async function getTableColumnNames(
  ctx: Pick<DatabaseContext, 'connection' | 'isNative'>,
  tableName: string,
): Promise<Set<string>> {
  const query = `PRAGMA table_info(${tableName})`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query)
    return new Set((result.values || []).map((row) => String(row.name)))
  }

  const result = ctx.connection.exec(query)
  if (result.length === 0) {
    return new Set()
  }

  return new Set(result[0].values.map((row: unknown[]) => String(row[1])))
}
