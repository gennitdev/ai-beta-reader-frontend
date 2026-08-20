/**
 * Schema definition and lightweight migrations for the local SQLite database.
 *
 * `createTables` creates the full current schema from scratch (idempotent, via
 * CREATE TABLE IF NOT EXISTS); `runMigrations` brings older databases forward
 * by adding columns/indexes that post-date their creation. Both are called once
 * from AppDatabase.init() and take a {@link DatabaseContext}.
 */

import type { DatabaseContext } from './connection'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    chapter_order TEXT DEFAULT '[]',
    part_order TEXT DEFAULT '[]',
    cover_image_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    part_id TEXT,
    title TEXT,
    text TEXT NOT NULL,
    word_count INTEGER,
    cover_image_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(id),
    FOREIGN KEY (part_id) REFERENCES book_parts(id)
  );

  CREATE TABLE IF NOT EXISTS chapter_revisions (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    title TEXT,
    text TEXT NOT NULL,
    word_count INTEGER NOT NULL DEFAULT 0,
    words_added INTEGER NOT NULL DEFAULT 0,
    words_removed INTEGER NOT NULL DEFAULT 0,
    revision_kind TEXT NOT NULL DEFAULT 'save',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    discarded_at TIMESTAMP,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id),
    FOREIGN KEY (book_id) REFERENCES books(id)
  );

  CREATE TABLE IF NOT EXISTS chapter_activity (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    chapter_title TEXT,
    activity_type TEXT NOT NULL,
    words_added INTEGER NOT NULL DEFAULT 0,
    words_removed INTEGER NOT NULL DEFAULT 0,
    word_count_deleted INTEGER NOT NULL DEFAULT 0,
    revision_discarded INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(id)
  );

  CREATE TABLE IF NOT EXISTS book_parts (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    name TEXT NOT NULL,
    chapter_order TEXT DEFAULT '[]',
    cover_image_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(id)
  );

  CREATE TABLE IF NOT EXISTS chapter_summaries (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL,
    summary TEXT,
    pov TEXT,
    characters TEXT,
    beats TEXT,
    spoilers_ok BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id)
  );

  CREATE TABLE IF NOT EXISTS part_summaries (
    id TEXT PRIMARY KEY,
    part_id TEXT NOT NULL,
    summary TEXT,
    characters TEXT,
    beats TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (part_id) REFERENCES book_parts(id)
  );

  CREATE TABLE IF NOT EXISTS wiki_pages (
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_pinned BOOLEAN DEFAULT 0,
    cover_image_id TEXT,
    FOREIGN KEY (book_id) REFERENCES books(id)
  );

  CREATE TABLE IF NOT EXISTS book_characters (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    character_name TEXT NOT NULL,
    wiki_page_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(id),
    FOREIGN KEY (wiki_page_id) REFERENCES wiki_pages(id)
  );

  CREATE TABLE IF NOT EXISTS chapter_reviews (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL,
    review_text TEXT NOT NULL,
    prompt_used TEXT,
    profile_id INTEGER,
    profile_name TEXT,
    tone_key TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id)
  );

  CREATE TABLE IF NOT EXISTS custom_reviewer_profiles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ai_profiles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    tone_key TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    is_system BOOLEAN,
    is_default BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wiki_updates (
    id TEXT PRIMARY KEY,
    wiki_page_id TEXT NOT NULL,
    chapter_id TEXT,
    update_type TEXT,
    change_summary TEXT,
    contradiction_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wiki_page_id) REFERENCES wiki_pages(id),
    FOREIGN KEY (chapter_id) REFERENCES chapters(id)
  );

  CREATE TABLE IF NOT EXISTS chapter_wiki_mentions (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL,
    wiki_page_id TEXT NOT NULL,
    link_source TEXT DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id),
    FOREIGN KEY (wiki_page_id) REFERENCES wiki_pages(id)
  );

  CREATE TABLE IF NOT EXISTS image_assets (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    chapter_id TEXT,
    asset_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT,
    image_data TEXT,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES books(id),
    FOREIGN KEY (chapter_id) REFERENCES chapters(id)
  );

  CREATE TABLE IF NOT EXISTS image_wiki_tags (
    image_id TEXT NOT NULL,
    wiki_page_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (image_id, wiki_page_id),
    FOREIGN KEY (image_id) REFERENCES image_assets(id),
    FOREIGN KEY (wiki_page_id) REFERENCES wiki_pages(id)
  );

  CREATE TABLE IF NOT EXISTS chapter_notes (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL,
    notes TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id)
  );

  CREATE INDEX IF NOT EXISTS idx_image_assets_book ON image_assets(book_id);
  CREATE INDEX IF NOT EXISTS idx_image_assets_chapter ON image_assets(chapter_id);
  CREATE INDEX IF NOT EXISTS idx_image_wiki_tags_image ON image_wiki_tags(image_id);
  CREATE INDEX IF NOT EXISTS idx_image_wiki_tags_wiki_page ON image_wiki_tags(wiki_page_id);
  CREATE INDEX IF NOT EXISTS idx_chapter_wiki_mentions_chapter ON chapter_wiki_mentions(chapter_id);
  CREATE INDEX IF NOT EXISTS idx_chapter_wiki_mentions_wiki_page ON chapter_wiki_mentions(wiki_page_id);
  CREATE INDEX IF NOT EXISTS idx_chapter_revisions_chapter_created ON chapter_revisions(chapter_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_chapter_revisions_book_created ON chapter_revisions(book_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_chapter_activity_book_created ON chapter_activity(book_id, created_at DESC);
`

export const CURRENT_SCHEMA_VERSION = 1

interface ColumnMigration {
  table: string
  column: string
  definition: string
}

/** Columns introduced before schema versions were tracked explicitly. */
const LEGACY_COLUMN_MIGRATIONS: ColumnMigration[] = [
  { table: 'books', column: 'chapter_order', definition: `TEXT DEFAULT '[]'` },
  { table: 'books', column: 'part_order', definition: `TEXT DEFAULT '[]'` },
  { table: 'chapters', column: 'part_id', definition: 'TEXT' },
  { table: 'book_parts', column: 'chapter_order', definition: `TEXT DEFAULT '[]'` },
  { table: 'books', column: 'cover_image_id', definition: 'TEXT' },
  { table: 'book_parts', column: 'cover_image_id', definition: 'TEXT' },
  { table: 'chapters', column: 'cover_image_id', definition: 'TEXT' },
  { table: 'image_assets', column: 'image_data', definition: 'TEXT' },
  { table: 'wiki_pages', column: 'is_pinned', definition: 'BOOLEAN DEFAULT 0' },
  { table: 'image_assets', column: 'notes', definition: `TEXT DEFAULT ''` },
  { table: 'wiki_pages', column: 'cover_image_id', definition: 'TEXT' },
  { table: 'chapter_wiki_mentions', column: 'link_source', definition: `TEXT DEFAULT 'manual'` },
  { table: 'chapter_wiki_mentions', column: 'updated_at', definition: 'TIMESTAMP' },
  { table: 'chapter_revisions', column: 'discarded_at', definition: 'TIMESTAMP' },
  {
    table: 'chapter_activity',
    column: 'revision_discarded',
    definition: 'INTEGER NOT NULL DEFAULT 0',
  },
]

/** Idempotent table, index, and data backfills for legacy databases. */
const LEGACY_SQL_MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS image_wiki_tags (
    image_id TEXT NOT NULL,
    wiki_page_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (image_id, wiki_page_id),
    FOREIGN KEY (image_id) REFERENCES image_assets(id),
    FOREIGN KEY (wiki_page_id) REFERENCES wiki_pages(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_image_wiki_tags_image ON image_wiki_tags(image_id)`,
  `CREATE INDEX IF NOT EXISTS idx_image_wiki_tags_wiki_page ON image_wiki_tags(wiki_page_id)`,
  `UPDATE chapter_wiki_mentions SET updated_at = created_at WHERE updated_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_chapter_wiki_mentions_chapter ON chapter_wiki_mentions(chapter_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chapter_wiki_mentions_wiki_page ON chapter_wiki_mentions(wiki_page_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chapter_revisions_chapter_created ON chapter_revisions(chapter_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_chapter_revisions_book_created ON chapter_revisions(book_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_chapter_activity_book_created ON chapter_activity(book_id, created_at DESC)`,
  `INSERT OR IGNORE INTO chapter_activity
    (id, book_id, chapter_id, chapter_title, activity_type, words_added, words_removed, word_count_deleted, created_at)
    SELECT id, book_id, chapter_id, title, 'save', words_added, words_removed, 0, created_at
    FROM chapter_revisions WHERE revision_kind = 'save'`,
]

async function execute(ctx: DatabaseContext, sql: string): Promise<void> {
  if (ctx.isNative) await ctx.connection.execute(sql)
  else ctx.connection.run(sql)
}

async function getSchemaVersion(ctx: DatabaseContext): Promise<number> {
  if (ctx.isNative) {
    const tableResult = await ctx.connection.query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`,
    )
    if (!tableResult.values?.length) return 0
    const result = await ctx.connection.query(
      'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
    )
    const row = result.values?.[0]
    if (!row) return 0
    const value = Array.isArray(row) ? row[0] : row.version
    return Number(value ?? 0)
  }

  const tableResult = ctx.connection.exec(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`,
  )
  if (tableResult.length === 0) return 0
  const result = ctx.connection.exec(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
  )
  return Number(result[0]?.values[0]?.[0] ?? 0)
}

async function columnExists(
  ctx: DatabaseContext,
  table: string,
  column: string,
): Promise<boolean> {
  if (ctx.isNative) {
    const result = await ctx.connection.query(`PRAGMA table_info(${table})`)
    return (result.values ?? []).some((row) => {
      const value = Array.isArray(row) ? row[1] : row.name
      return value === column
    })
  }

  const result = ctx.connection.exec(`PRAGMA table_info(${table})`)
  if (result.length === 0) return false
  const nameIndex = result[0].columns.indexOf('name')
  return result[0].values.some((row) => row[nameIndex] === column)
}

async function beginTransaction(ctx: DatabaseContext): Promise<void> {
  if (ctx.isNative && ctx.connection.beginTransaction) {
    await ctx.connection.beginTransaction()
  } else {
    await execute(ctx, 'BEGIN TRANSACTION')
  }
}

async function commitTransaction(ctx: DatabaseContext): Promise<void> {
  if (ctx.isNative && ctx.connection.commitTransaction) {
    await ctx.connection.commitTransaction()
  } else {
    await execute(ctx, 'COMMIT')
  }
}

async function rollbackTransaction(ctx: DatabaseContext): Promise<void> {
  if (ctx.isNative && ctx.connection.rollbackTransaction) {
    await ctx.connection.rollbackTransaction()
  } else {
    await execute(ctx, 'ROLLBACK')
  }
}

interface SchemaMigration {
  version: number
  apply(ctx: DatabaseContext): Promise<void>
}

async function applyLegacySchemaMigration(ctx: DatabaseContext): Promise<void> {
  for (const migration of LEGACY_COLUMN_MIGRATIONS) {
    if (!await columnExists(ctx, migration.table, migration.column)) {
      await execute(
        ctx,
        `ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.definition}`,
      )
    }
  }

  for (const migration of LEGACY_SQL_MIGRATIONS) {
    await execute(ctx, migration)
  }
}

/** Append future migrations here; each version is committed and recorded separately. */
const SCHEMA_MIGRATIONS: SchemaMigration[] = [
  { version: 1, apply: applyLegacySchemaMigration },
]

export async function createTables(ctx: DatabaseContext): Promise<void> {
  if (ctx.isNative) {
    await ctx.connection.execute(SCHEMA)
  } else {
    ctx.connection.run(SCHEMA)
    ctx.requestPersistence()
  }
}

export async function runMigrations(ctx: DatabaseContext): Promise<void> {
  const currentVersion = await getSchemaVersion(ctx)
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    throw new Error(`Database schema version ${String(currentVersion)} is invalid.`)
  }
  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}.`,
    )
  }
  if (currentVersion === CURRENT_SCHEMA_VERSION) return

  let appliedMigration = false
  for (const migration of SCHEMA_MIGRATIONS) {
    if (migration.version <= currentVersion) continue

    let transactionStarted = false
    try {
      await beginTransaction(ctx)
      transactionStarted = true
      await migration.apply(ctx)
      await execute(
        ctx,
        `INSERT INTO schema_migrations (version) VALUES (${migration.version})`,
      )
      await commitTransaction(ctx)
      transactionStarted = false
      appliedMigration = true
    } catch (error) {
      if (transactionStarted) await rollbackTransaction(ctx)
      throw error
    }
  }

  if (appliedMigration && !ctx.isNative) ctx.requestPersistence()
}
