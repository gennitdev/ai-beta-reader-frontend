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

/** Incremental column/index/table additions for databases created before them. */
const MIGRATIONS = [
  // Add chapter_order to books if not exists
  `ALTER TABLE books ADD COLUMN chapter_order TEXT DEFAULT '[]'`,
  // Add part_order to books if not exists
  `ALTER TABLE books ADD COLUMN part_order TEXT DEFAULT '[]'`,
  // Add part_id to chapters if not exists
  `ALTER TABLE chapters ADD COLUMN part_id TEXT`,
  // Add chapter_order to book_parts if not exists
  `ALTER TABLE book_parts ADD COLUMN chapter_order TEXT DEFAULT '[]'`,
  // Add cover_image_id to books if not exists
  `ALTER TABLE books ADD COLUMN cover_image_id TEXT`,
  // Add cover_image_id to book_parts if not exists
  `ALTER TABLE book_parts ADD COLUMN cover_image_id TEXT`,
  // Add cover_image_id to chapters if not exists
  `ALTER TABLE chapters ADD COLUMN cover_image_id TEXT`,
  // Add image_data to image_assets for web storage and backup/restore
  `ALTER TABLE image_assets ADD COLUMN image_data TEXT`,
  // Add pinning support to wiki pages
  `ALTER TABLE wiki_pages ADD COLUMN is_pinned BOOLEAN DEFAULT 0`,
  // Add markdown notes to image assets
  `ALTER TABLE image_assets ADD COLUMN notes TEXT DEFAULT ''`,
  // Add wiki tags for images
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
  // Add cover_image_id to wiki_pages if not exists
  `ALTER TABLE wiki_pages ADD COLUMN cover_image_id TEXT`,
  // Add metadata to chapter/wiki links
  `ALTER TABLE chapter_wiki_mentions ADD COLUMN link_source TEXT DEFAULT 'manual'`,
  `ALTER TABLE chapter_wiki_mentions ADD COLUMN updated_at TIMESTAMP`,
  `UPDATE chapter_wiki_mentions SET updated_at = created_at WHERE updated_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_chapter_wiki_mentions_chapter ON chapter_wiki_mentions(chapter_id)`,
  `CREATE INDEX IF NOT EXISTS idx_chapter_wiki_mentions_wiki_page ON chapter_wiki_mentions(wiki_page_id)`,
  `CREATE TABLE IF NOT EXISTS chapter_revisions (
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
  )`,
  `ALTER TABLE chapter_revisions ADD COLUMN discarded_at TIMESTAMP`,
  `CREATE INDEX IF NOT EXISTS idx_chapter_revisions_chapter_created ON chapter_revisions(chapter_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_chapter_revisions_book_created ON chapter_revisions(book_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS chapter_activity (
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
  )`,
  `ALTER TABLE chapter_activity ADD COLUMN revision_discarded INTEGER NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS idx_chapter_activity_book_created ON chapter_activity(book_id, created_at DESC)`,
  `INSERT OR IGNORE INTO chapter_activity
    (id, book_id, chapter_id, chapter_title, activity_type, words_added, words_removed, word_count_deleted, created_at)
    SELECT id, book_id, chapter_id, title, 'save', words_added, words_removed, 0, created_at
    FROM chapter_revisions WHERE revision_kind = 'save'`,
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
  for (const migration of MIGRATIONS) {
    try {
      if (ctx.isNative) {
        await ctx.connection.execute(migration)
      } else {
        ctx.connection.run(migration)
      }
    } catch {
      // Column already exists, ignore error
      // SQLite throws error if column exists, which is expected
    }
  }

  if (!ctx.isNative) {
    ctx.requestPersistence()
  }
}
