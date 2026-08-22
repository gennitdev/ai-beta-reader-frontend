/**
 * Schema definition and lightweight migrations for the local SQLite database.
 *
 * `createTables` creates the full current schema from scratch (idempotent, via
 * CREATE TABLE IF NOT EXISTS); `runMigrations` brings older databases forward
 * by adding columns/indexes that post-date their creation. Both are called once
 * from AppDatabase.init() and take a {@link DatabaseContext}.
 */

import type { DatabaseContext } from './connection'
import { createPortableProfileId } from '@/lib/portableIds'

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
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
    updated_at TIMESTAMP,
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
    generated_by TEXT,
    model TEXT,
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
    generated_by TEXT,
    model TEXT,
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
    updated_at TIMESTAMP,
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
    profile_stable_id TEXT,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id)
  );

  CREATE TABLE IF NOT EXISTS custom_reviewer_profiles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    stable_id TEXT
  );

  CREATE TABLE IF NOT EXISTS ai_profiles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    tone_key TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    is_system BOOLEAN,
    is_default BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    stable_id TEXT,
    updated_at TIMESTAMP
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
    content_hash TEXT,
    content_hash_algorithm TEXT,
    content_byte_length INTEGER,
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

  CREATE TABLE IF NOT EXISTS wiki_review_state (
    wiki_page_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    chapter_content_sha256 TEXT NOT NULL,
    reviewed_at TIMESTAMP NOT NULL,
    reviewed_by TEXT NOT NULL,
    PRIMARY KEY (wiki_page_id, chapter_id),
    FOREIGN KEY (wiki_page_id) REFERENCES wiki_pages(id),
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
  CREATE INDEX IF NOT EXISTS idx_wiki_review_state_chapter ON wiki_review_state(chapter_id);
`

export const CURRENT_SCHEMA_VERSION = 3

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

const PORTABLE_COLUMN_MIGRATIONS: ColumnMigration[] = [
  { table: 'books', column: 'updated_at', definition: 'TIMESTAMP' },
  { table: 'chapters', column: 'updated_at', definition: 'TIMESTAMP' },
  { table: 'book_characters', column: 'updated_at', definition: 'TIMESTAMP' },
  { table: 'custom_reviewer_profiles', column: 'stable_id', definition: 'TEXT' },
  { table: 'ai_profiles', column: 'stable_id', definition: 'TEXT' },
  { table: 'ai_profiles', column: 'updated_at', definition: 'TIMESTAMP' },
  { table: 'chapter_summaries', column: 'generated_by', definition: 'TEXT' },
  { table: 'chapter_summaries', column: 'model', definition: 'TEXT' },
  { table: 'part_summaries', column: 'generated_by', definition: 'TEXT' },
  { table: 'part_summaries', column: 'model', definition: 'TEXT' },
  { table: 'chapter_reviews', column: 'profile_stable_id', definition: 'TEXT' },
]

async function queryRows(
  ctx: DatabaseContext,
  sql: string,
): Promise<Array<Record<string, unknown>>> {
  if (ctx.isNative) {
    const result = await ctx.connection.query(sql)
    return result.values ?? []
  }

  const result = ctx.connection.exec(sql)
  if (result.length === 0) return []
  return result[0].values.map((row) => Object.fromEntries(
    result[0].columns.map((column, index) => [column, row[index]]),
  ))
}

async function backfillStableProfileIds(ctx: DatabaseContext): Promise<void> {
  const customProfiles = await queryRows(
    ctx,
    `SELECT id FROM custom_reviewer_profiles WHERE stable_id IS NULL OR stable_id = '' ORDER BY id`,
  )
  for (const profile of customProfiles) {
    const stableId = createPortableProfileId()
    await ctx.connection.run(
      `UPDATE custom_reviewer_profiles SET stable_id = ? WHERE id = ?`,
      [stableId, profile.id],
    )
  }

  const aiProfiles = await queryRows(
    ctx,
    `SELECT id, tone_key, is_system FROM ai_profiles WHERE stable_id IS NULL OR stable_id = '' ORDER BY id`,
  )
  for (const profile of aiProfiles) {
    const kind = Boolean(profile.is_system) ? 'system' : 'ai'
    const toneKey = String(profile.tone_key)
    const stableId = kind === 'system' ? `system:${toneKey}` : `ai:${toneKey}:${String(profile.id)}`
    await ctx.connection.run(`UPDATE ai_profiles SET stable_id = ? WHERE id = ?`, [stableId, profile.id])
  }
}

async function applyPortableBundleSchemaMigration(ctx: DatabaseContext): Promise<void> {
  for (const migration of PORTABLE_COLUMN_MIGRATIONS) {
    if (!await columnExists(ctx, migration.table, migration.column)) {
      await execute(
        ctx,
        `ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.definition}`,
      )
    }
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS wiki_review_state (
      wiki_page_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_content_sha256 TEXT NOT NULL,
      reviewed_at TIMESTAMP NOT NULL,
      reviewed_by TEXT NOT NULL,
      PRIMARY KEY (wiki_page_id, chapter_id),
      FOREIGN KEY (wiki_page_id) REFERENCES wiki_pages(id),
      FOREIGN KEY (chapter_id) REFERENCES chapters(id)
    )`,
    `UPDATE chapters SET updated_at = created_at WHERE updated_at IS NULL`,
    `UPDATE chapters SET updated_at = (SELECT MAX(created_at) FROM chapter_revisions WHERE chapter_id = chapters.id)
      WHERE EXISTS (SELECT 1 FROM chapter_revisions WHERE chapter_id = chapters.id)
        AND (SELECT MAX(created_at) FROM chapter_revisions WHERE chapter_id = chapters.id) > updated_at`,
    `UPDATE chapters SET updated_at = (SELECT MAX(updated_at) FROM chapter_summaries WHERE chapter_id = chapters.id)
      WHERE EXISTS (SELECT 1 FROM chapter_summaries WHERE chapter_id = chapters.id)
        AND (SELECT MAX(updated_at) FROM chapter_summaries WHERE chapter_id = chapters.id) > updated_at`,
    `UPDATE chapters SET updated_at = (SELECT MAX(updated_at) FROM chapter_notes WHERE chapter_id = chapters.id)
      WHERE EXISTS (SELECT 1 FROM chapter_notes WHERE chapter_id = chapters.id)
        AND (SELECT MAX(updated_at) FROM chapter_notes WHERE chapter_id = chapters.id) > updated_at`,
    `UPDATE chapters SET updated_at = (SELECT MAX(updated_at) FROM chapter_reviews WHERE chapter_id = chapters.id)
      WHERE EXISTS (SELECT 1 FROM chapter_reviews WHERE chapter_id = chapters.id)
        AND (SELECT MAX(updated_at) FROM chapter_reviews WHERE chapter_id = chapters.id) > updated_at`,
    `UPDATE books SET updated_at = created_at WHERE updated_at IS NULL`,
    `UPDATE books SET updated_at = (SELECT MAX(updated_at) FROM chapters WHERE book_id = books.id)
      WHERE EXISTS (SELECT 1 FROM chapters WHERE book_id = books.id)
        AND (SELECT MAX(updated_at) FROM chapters WHERE book_id = books.id) > updated_at`,
    `UPDATE books SET updated_at = (SELECT MAX(updated_at) FROM book_parts WHERE book_id = books.id)
      WHERE EXISTS (SELECT 1 FROM book_parts WHERE book_id = books.id)
        AND (SELECT MAX(updated_at) FROM book_parts WHERE book_id = books.id) > updated_at`,
    `UPDATE books SET updated_at = (SELECT MAX(updated_at) FROM wiki_pages WHERE book_id = books.id)
      WHERE EXISTS (SELECT 1 FROM wiki_pages WHERE book_id = books.id)
        AND (SELECT MAX(updated_at) FROM wiki_pages WHERE book_id = books.id) > updated_at`,
    `UPDATE book_characters SET updated_at = created_at WHERE updated_at IS NULL`,
    `UPDATE ai_profiles SET updated_at = created_at WHERE updated_at IS NULL`,
  ]
  for (const statement of statements) await execute(ctx, statement)

  await backfillStableProfileIds(ctx)

  const finalStatements = [
    `UPDATE chapter_reviews SET profile_stable_id = (
      SELECT stable_id FROM custom_reviewer_profiles WHERE id = chapter_reviews.profile_id
    ) WHERE profile_stable_id IS NULL AND profile_id IS NOT NULL`,
    `UPDATE chapter_reviews SET profile_stable_id = 'system:' || tone_key
      WHERE profile_stable_id IS NULL AND profile_id IS NULL AND tone_key IS NOT NULL
        AND tone_key NOT LIKE 'custom-%'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_reviewer_profiles_stable_id
      ON custom_reviewer_profiles(stable_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_profiles_stable_id ON ai_profiles(stable_id)`,
    `CREATE INDEX IF NOT EXISTS idx_wiki_review_state_chapter ON wiki_review_state(chapter_id)`,
  ]
  for (const statement of finalStatements) await execute(ctx, statement)
}

const IMAGE_CONTENT_HASH_COLUMN_MIGRATIONS: ColumnMigration[] = [
  { table: 'image_assets', column: 'content_hash', definition: 'TEXT' },
  { table: 'image_assets', column: 'content_hash_algorithm', definition: 'TEXT' },
  { table: 'image_assets', column: 'content_byte_length', definition: 'INTEGER' },
]

async function applyImageContentHashSchemaMigration(ctx: DatabaseContext): Promise<void> {
  for (const migration of IMAGE_CONTENT_HASH_COLUMN_MIGRATIONS) {
    if (!await columnExists(ctx, migration.table, migration.column)) {
      await execute(
        ctx,
        `ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.definition}`,
      )
    }
  }
}

/** Append future migrations here; each version is committed and recorded separately. */
const SCHEMA_MIGRATIONS: SchemaMigration[] = [
  { version: 1, apply: applyLegacySchemaMigration },
  { version: 2, apply: applyPortableBundleSchemaMigration },
  { version: 3, apply: applyImageContentHashSchemaMigration },
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
