import { beforeAll, describe, expect, it, vi } from 'vitest'
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import type { AppDatabaseConnection, DatabaseContext } from '@/lib/db/connection'
import {
  createTables,
  CURRENT_SCHEMA_VERSION,
  runMigrations,
} from '@/lib/db/schemaSetup'

let SQL: SqlJsStatic

beforeAll(async () => {
  SQL = await initSqlJs()
})

function context(database: Database) {
  const requestPersistence = vi.fn()
  const ctx: DatabaseContext = {
    connection: database as unknown as AppDatabaseConnection,
    isNative: false,
    requestPersistence,
    flushPersistence: vi.fn(async () => undefined),
    setImporting: vi.fn(),
  }
  return { ctx, requestPersistence }
}

function nativeContext(database: Database) {
  const beginTransaction = vi.fn(async () => { database.run('BEGIN TRANSACTION') })
  const commitTransaction = vi.fn(async () => { database.run('COMMIT') })
  const rollbackTransaction = vi.fn(async () => { database.run('ROLLBACK') })
  const connection = {
    execute: vi.fn(async (sql: string) => { database.run(sql) }),
    query: vi.fn(async (sql: string) => {
      const result = database.exec(sql)
      if (result.length === 0) return { values: [] }
      return {
        values: result[0].values.map((row) => Object.fromEntries(
          result[0].columns.map((column, index) => [column, row[index]]),
        )),
      }
    }),
    beginTransaction,
    commitTransaction,
    rollbackTransaction,
  } as unknown as AppDatabaseConnection
  const ctx: DatabaseContext = {
    connection,
    isNative: true,
    requestPersistence: vi.fn(),
    flushPersistence: vi.fn(async () => undefined),
    setImporting: vi.fn(),
  }
  return { beginTransaction, commitTransaction, ctx, rollbackTransaction }
}

function columns(database: Database, table: string): string[] {
  const result = database.exec(`PRAGMA table_info(${table})`)
  if (result.length === 0) return []
  const nameIndex = result[0].columns.indexOf('name')
  return result[0].values.map((row) => String(row[nameIndex]))
}

function schemaVersion(database: Database): number {
  const table = database.exec(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`,
  )
  if (table.length === 0) return 0
  return Number(database.exec(
    'SELECT COALESCE(MAX(version), 0) FROM schema_migrations',
  )[0].values[0][0])
}

function createLegacyDatabase(): Database {
  const database = new SQL.Database()
  database.run(`
    CREATE TABLE books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE chapters (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      title TEXT,
      text TEXT NOT NULL,
      word_count INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE book_parts (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE wiki_pages (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      page_name TEXT NOT NULL,
      page_type TEXT,
      content TEXT,
      summary TEXT,
      aliases TEXT,
      tags TEXT,
      is_major BOOLEAN,
      created_by_ai BOOLEAN,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE image_assets (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      chapter_id TEXT,
      asset_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE chapter_wiki_mentions (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      wiki_page_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE chapter_revisions (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      title TEXT,
      text TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      words_added INTEGER NOT NULL DEFAULT 0,
      words_removed INTEGER NOT NULL DEFAULT 0,
      revision_kind TEXT NOT NULL DEFAULT 'save',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE chapter_activity (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_title TEXT,
      activity_type TEXT NOT NULL,
      words_added INTEGER NOT NULL DEFAULT 0,
      words_removed INTEGER NOT NULL DEFAULT 0,
      word_count_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO books (id, title, created_at)
      VALUES ('book-1', 'Legacy Book', '2025-01-01T00:00:00.000Z');
    INSERT INTO chapters (id, book_id, title, text, word_count, created_at)
      VALUES ('chapter-1', 'book-1', 'Opening', 'Legacy prose', 2, '2025-01-02T00:00:00.000Z');
    INSERT INTO wiki_pages (
      id, book_id, page_name, page_type, content, summary, aliases, tags,
      is_major, created_by_ai, created_at, updated_at
    ) VALUES (
      'wiki-1', 'book-1', 'Alice', 'character', '# Alice', '', null, null,
      1, 0, '2025-01-03T00:00:00.000Z', '2025-01-03T00:00:00.000Z'
    );
    INSERT INTO chapter_wiki_mentions (id, chapter_id, wiki_page_id, created_at)
      VALUES ('mention-1', 'chapter-1', 'wiki-1', '2025-01-04T00:00:00.000Z');
    INSERT INTO chapter_revisions (
      id, chapter_id, book_id, title, text, word_count, words_added,
      words_removed, revision_kind, created_at
    ) VALUES (
      'revision-1', 'chapter-1', 'book-1', 'Opening', 'Legacy prose', 2, 2,
      0, 'save', '2025-01-05T00:00:00.000Z'
    );
  `)
  return database
}

describe('schema migrations', () => {
  it('upgrades an unversioned historical schema without losing data', async () => {
    const database = createLegacyDatabase()
    const { ctx, requestPersistence } = context(database)

    await createTables(ctx)
    requestPersistence.mockClear()
    await runMigrations(ctx)

    expect(schemaVersion(database)).toBe(CURRENT_SCHEMA_VERSION)
    expect(columns(database, 'books')).toEqual(expect.arrayContaining([
      'chapter_order', 'part_order', 'cover_image_id',
    ]))
    expect(columns(database, 'chapters')).toEqual(expect.arrayContaining([
      'part_id', 'cover_image_id',
    ]))
    expect(columns(database, 'image_assets')).toEqual(expect.arrayContaining([
      'image_data', 'notes',
    ]))
    expect(columns(database, 'wiki_pages')).toEqual(expect.arrayContaining([
      'is_pinned', 'cover_image_id',
    ]))
    expect(columns(database, 'chapter_revisions')).toContain('discarded_at')
    expect(columns(database, 'chapter_activity')).toContain('revision_discarded')

    expect(database.exec(`SELECT title FROM books WHERE id = 'book-1'`)[0].values[0][0])
      .toBe('Legacy Book')
    expect(database.exec(
      `SELECT link_source, updated_at FROM chapter_wiki_mentions WHERE id = 'mention-1'`,
    )[0].values[0]).toEqual(['manual', '2025-01-04T00:00:00.000Z'])
    expect(database.exec(
      `SELECT activity_type, words_added FROM chapter_activity WHERE id = 'revision-1'`,
    )[0].values[0]).toEqual(['save', 2])
    expect(database.exec(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_chapter_activity_book_created'`,
    )[0].values[0][0]).toBe('idx_chapter_activity_book_created')
    expect(requestPersistence).toHaveBeenCalledOnce()
  })

  it('does not rerun a completed schema version', async () => {
    const database = createLegacyDatabase()
    const { ctx, requestPersistence } = context(database)
    await createTables(ctx)
    await runMigrations(ctx)
    requestPersistence.mockClear()

    const before = database.export()
    await runMigrations(ctx)

    expect(database.export()).toEqual(before)
    expect(requestPersistence).not.toHaveBeenCalled()
  })

  it('uses the native transaction adapter and keyed PRAGMA rows', async () => {
    const database = createLegacyDatabase()
    const { beginTransaction, commitTransaction, ctx, rollbackTransaction } = nativeContext(database)

    await createTables(ctx)
    await runMigrations(ctx)

    expect(schemaVersion(database)).toBe(CURRENT_SCHEMA_VERSION)
    expect(columns(database, 'image_assets')).toEqual(expect.arrayContaining(['image_data', 'notes']))
    expect(beginTransaction).toHaveBeenCalledOnce()
    expect(commitTransaction).toHaveBeenCalledOnce()
    expect(rollbackTransaction).not.toHaveBeenCalled()
    expect(ctx.requestPersistence).not.toHaveBeenCalled()
  })

  it('rejects a database created by a newer app version', async () => {
    const database = new SQL.Database()
    database.run(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO schema_migrations (version) VALUES (${CURRENT_SCHEMA_VERSION + 1});
    `)
    const { ctx, requestPersistence } = context(database)

    await expect(runMigrations(ctx)).rejects.toThrow(/newer than supported version/)
    expect(schemaVersion(database)).toBe(CURRENT_SCHEMA_VERSION + 1)
    expect(requestPersistence).not.toHaveBeenCalled()
  })

  it('rejects corrupt migration ledger values', async () => {
    const database = new SQL.Database()
    database.run(`
      CREATE TABLE schema_migrations (version TEXT PRIMARY KEY);
      INSERT INTO schema_migrations (version) VALUES ('not-a-version');
    `)
    const { ctx, requestPersistence } = context(database)

    await expect(runMigrations(ctx)).rejects.toThrow(/schema version NaN is invalid/)
    expect(requestPersistence).not.toHaveBeenCalled()
  })

  it('rolls back earlier migration steps and does not advance the version on failure', async () => {
    const database = new SQL.Database()
    database.run(`CREATE TABLE books (id TEXT PRIMARY KEY, title TEXT NOT NULL)`)
    const { ctx, requestPersistence } = context(database)

    await expect(runMigrations(ctx)).rejects.toThrow(/no such table: chapters/)

    expect(columns(database, 'books')).toEqual(['id', 'title'])
    expect(schemaVersion(database)).toBe(0)
    expect(requestPersistence).not.toHaveBeenCalled()
  })
})
