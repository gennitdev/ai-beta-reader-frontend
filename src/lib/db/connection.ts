/**
 * Low-level database connection contracts shared by AppDatabase and the
 * per-domain repository modules under `src/lib/db/`.
 *
 * These describe the thin surface the app relies on across two very different
 * backends: sql.js (synchronous, web/desktop) and @capacitor-community/sqlite
 * (asynchronous, native mobile). Repository functions receive a
 * {@link DatabaseContext} rather than the whole AppDatabase instance so their
 * dependencies stay explicit and they remain unit-testable in isolation.
 */

/** A single result row, either positional (sql.js) or keyed (native). */
export type QueryRow = Record<string, unknown>

/** Prepared-statement handle exposed by the underlying driver. */
export interface QueryResultRowStatement {
  bind(values?: unknown[]): void
  step(): boolean
  getAsObject(): Record<string, unknown>
  free(): void
}

/** The unified connection surface implemented by both backends. */
export interface AppDatabaseConnection {
  open(): Promise<void>
  close(): Promise<void> | void
  execute(sql: string): Promise<unknown>
  run(sql: string, params?: unknown[]): Promise<unknown> | void
  query(sql: string, params?: unknown[]): Promise<{ values?: QueryRow[] }>
  exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>
  export(): Uint8Array
  exportToJson(mode?: string): Promise<unknown>
  prepare(sql: string): QueryResultRowStatement
}

/**
 * The dependencies a repository function needs to talk to the database.
 *
 * - `connection` — the active driver connection.
 * - `isNative` — selects the async native path vs the synchronous web path.
 * - `requestPersistence` — schedules a debounced snapshot write on the web/
 *   desktop backend (a no-op on native and during bulk imports). Repositories
 *   should call this after any mutation on the non-native path.
 * - `flushPersistence` — forces the pending snapshot to be written immediately.
 *   Used where a mutation must be durable before returning (e.g. image assets).
 */
export interface DatabaseContext {
  readonly connection: AppDatabaseConnection
  readonly isNative: boolean
  requestPersistence(): void
  flushPersistence(): Promise<void>
}
