import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import initSqlJs from 'sql.js';
import type { WikiPageType } from '@/types/bookView';
import {
  DATABASE_EXPORT_VERSION,
  IMAGE_ASSET_COLUMNS,
  WIKI_PAGE_COLUMNS,
  normalizeDatabaseImportData,
  normalizeImageAssetImportRows,
  type CapacitorExportShape,
  type DatabaseImportData,
  type ImportRow,
} from '@/lib/databaseImportExport';
import {
  decodeLegacyDatabaseSnapshot,
  PersistenceCoordinator,
} from '@/lib/persistenceCoordinator';
import {
  DATABASE_STORE,
  METADATA_STORE,
  readIndexedDbValue,
  SQLITE_DATABASE_KEY,
  writeIndexedDbValue,
} from '@/lib/indexedDbStorage';
import { IndexedDbImageContentStore } from '@/lib/imageContentStore';
import {
  IMAGE_BLOB_MIGRATION_STATUS_KEY,
  migrateLegacyImageData,
  type ImageDataMigrationRepository,
} from '@/lib/imageDataMigration';
import type {
  FindReplaceDocument,
  FindReplaceSearchRequest,
  ReplaceFindReplaceMatchesRequest,
  ReplaceFindReplaceMatchesResult,
  RestoreFindReplaceFieldsRequest,
} from '@/lib/findReplace';
import type {
  AppDatabaseConnection,
  QueryRow,
  DatabaseContext,
} from '@/lib/db/connection';
import { readQueryRowValue } from '@/lib/db/rowUtils';
import * as metadataRepo from '@/lib/db/metadataRepository';
import * as wikiRepo from '@/lib/db/wikiRepository';
import * as imageRepo from '@/lib/db/imageRepository';
import { imageAssetFromSqlRow } from '@/lib/db/imageRepository';
import * as partRepo from '@/lib/db/partRepository';
import * as chapterRepo from '@/lib/db/chapterRepository';
import * as searchRepo from '@/lib/db/searchRepository';

export interface Book {
  id: string;
  title: string;
  chapter_order: string; // JSON array of chapter IDs
  part_order: string; // JSON array of part IDs
  cover_image_id?: string | null;
  created_at: string;
}

export interface Chapter {
  id: string;
  book_id: string;
  part_id?: string | null;
  title?: string;
  text: string;
  word_count: number;
  cover_image_id?: string | null;
  created_at: string;
}

export interface ChapterRevision {
  id: string;
  chapter_id: string;
  book_id: string;
  title: string | null;
  text: string;
  word_count: number;
  words_added: number;
  words_removed: number;
  revision_kind: 'save' | 'baseline';
  created_at: string;
  discarded_at?: string | null;
}

export interface ChapterRevisionActivity {
  id: string;
  chapter_id: string;
  chapter_title: string | null;
  activity_type: 'save' | 'delete';
  words_added: number;
  words_removed: number;
  word_count_deleted: number;
  revision_available: boolean;
  revision_discarded?: boolean;
  created_at: string;
}

export interface BookPart {
  id: string;
  book_id: string;
  name: string;
  chapter_order: string; // JSON array of chapter IDs
  cover_image_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChapterSummary {
  id: string;
  chapter_id: string;
  summary: string | null;
  pov: string | null;
  characters: string | null; // JSON array as string
  beats: string | null; // JSON array as string
  spoilers_ok: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface PartSummary {
  id: string;
  part_id: string;
  summary: string | null;
  characters: string | null; // JSON array as string
  beats: string | null; // JSON array as string
  created_at: string;
  updated_at: string;
}

export interface ChapterReview {
  id: string;
  chapter_id: string;
  review_text: string;
  prompt_used: string | null;
  profile_id: number | null;
  profile_name: string | null;
  tone_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChapterNote {
  id: string;
  chapter_id: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CustomReviewerProfile {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface WikiPage {
  id: string;
  book_id: string;
  page_name: string;
  page_type: WikiPageType;
  content: string;
  summary: string;
  aliases: string | null;
  tags: string | null;
  is_major: boolean;
  created_by_ai: boolean;
  created_at: string;
  updated_at: string;
  is_pinned: boolean;
  cover_image_id?: string | null;
}

export type ImageAssetType = 'cover' | 'chapter' | 'part_cover';

export interface ImageAsset {
  id: string;
  book_id: string;
  chapter_id: string | null;
  asset_type: ImageAssetType;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  image_data: string | null; // Base64 data URL for web storage and backup/restore
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ImageWikiTag {
  image_id: string;
  wiki_page_id: string;
  page_name: string;
  page_type: string;
  created_at: string;
}

export type ChapterWikiLinkSource = 'ai_summary' | 'manual';

export interface ChapterWikiMention {
  id: string;
  chapter_id: string;
  wiki_page_id: string;
  link_source: ChapterWikiLinkSource | null;
  created_at: string;
  updated_at: string | null;
}

export interface ChapterWikiLink {
  wiki_page_id: string;
  page_name: string;
  page_type: WikiPageType;
  link_source: ChapterWikiLinkSource | null;
  created_at: string;
  updated_at: string | null;
}

export interface WikiPageChapterLink {
  chapter_id: string;
  chapter_title: string | null;
  part_id: string | null;
  link_source: ChapterWikiLinkSource | null;
  created_at: string;
  updated_at: string | null;
}

// Image asset row mappers moved to ./db/imageRepository (imageAssetFromSqlRow is
// re-imported below for the legacy browser-image migration).

const NATIVE_CAPACITOR_PLATFORMS = new Set(['ios', 'android']);

// Connection contracts (QueryRow, QueryResultRowStatement, AppDatabaseConnection)
// live in ./db/connection and are imported at the top of this file.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toImportedBook(row: ImportRow): Book {
  if (Array.isArray(row)) {
    return {
      id: String(row[0]),
      title: String(row[1]),
      chapter_order: typeof row[2] === 'string' ? row[2] : '[]',
      part_order: typeof row[3] === 'string' ? row[3] : '[]',
      cover_image_id: typeof row[4] === 'string' ? row[4] : null,
      created_at: String(row[5]),
    };
  }

  return {
    id: String(row.id),
    title: String(row.title),
    chapter_order: typeof row.chapter_order === 'string' ? row.chapter_order : '[]',
    part_order: typeof row.part_order === 'string' ? row.part_order : '[]',
    cover_image_id: typeof row.cover_image_id === 'string' ? row.cover_image_id : null,
    created_at: String(row.created_at),
  };
}

function toImportedChapter(row: ImportRow): Chapter {
  if (Array.isArray(row)) {
    return {
      id: String(row[0]),
      book_id: String(row[1]),
      part_id: typeof row[2] === 'string' ? row[2] : null,
      title: typeof row[3] === 'string' ? row[3] : undefined,
      text: String(row[4] ?? ''),
      word_count: Number(row[5] ?? 0),
      created_at: String(row[6]),
    };
  }

  return {
    id: String(row.id),
    book_id: String(row.book_id),
    part_id: typeof row.part_id === 'string' ? row.part_id : null,
    title: typeof row.title === 'string' ? row.title : undefined,
    text: String(row.text ?? ''),
    word_count: Number(row.word_count ?? 0),
    created_at: String(row.created_at),
  };
}

// Part row mappers moved to ./db/partRepository alongside their functions.

// Chapter/part metadata row mappers (summaries, reviews, notes, profiles) moved
// to ./db/metadataRepository alongside their repository functions.

// Wiki row mappers (pages, mentions, links) moved to ./db/wikiRepository
// alongside their repository functions.

// Detect if we're running in Electron (uses sql.js like web, not native SQLite)
function isElectronRuntime(): boolean {
  if (typeof window !== 'undefined' && window.desktopImages) {
    return true;
  }
  try {
    return Capacitor.getPlatform() === 'electron';
  } catch {
    return false;
  }
}

export class AppDatabase {
  private db!: AppDatabaseConnection;
  private sqlite: SQLiteConnection | null = null;
  private isNative: boolean | null = null; // Determined at init() time
  private isElectron = false;
  private tableColumnCache = new Map<string, string[]>();
  private isImporting = false; // Skip intermediate saves during bulk import
  private persistenceCoordinator: PersistenceCoordinator | null = null;

  async init() {
    // Determine platform at init time, not at module load time
    // This ensures Capacitor and window.desktopImages are available
    const platform = typeof Capacitor.getPlatform === 'function' ? Capacitor.getPlatform() : 'web';
    const isElectron = isElectronRuntime();
    this.isElectron = isElectron;
    this.isNative = NATIVE_CAPACITOR_PLATFORMS.has(platform) && !isElectron;

    console.log(`[AppDatabase] Platform: ${platform}, isElectron: ${isElectron}, isNative: ${this.isNative}`);

    if (this.isNative) {
      // Mobile: Use native SQLite
      this.sqlite = new SQLiteConnection(CapacitorSQLite);
      this.db = await this.sqlite.createConnection(
        'ai-beta-reader',
        false,
        'no-encryption',
        1,
        false
      ) as unknown as AppDatabaseConnection;
      await this.db.open();
    } else {
      // Desktop/Web: Use sql.js (SQLite compiled to WebAssembly)
      // Use local WASM file (bundled in public/) to avoid CSP issues in Electron
      const SQL = await initSqlJs({
        // The browser export asks for sql-wasm-browser.wasm, while the local
        // asset copied by the project is sql-wasm.wasm. Both package files are
        // the same binary, so always resolve SQL.js to the bundled asset.
        locateFile: () => '/sql-wasm.wasm'
      });

      // Try to load existing database from IndexedDB first, then fall back to localStorage for migration
      const indexedDbSnapshot = await this.loadFromIndexedDB();
      let savedDb = indexedDbSnapshot;
      let migratedFromLocalStorage = false;

      // If no IndexedDB data, check localStorage for migration
      if (!savedDb) {
        const localStorageDb = localStorage.getItem('sqliteDb');
        if (localStorageDb) {
          console.log('[AppDatabase] Migrating database from localStorage to IndexedDB...');
          try {
            savedDb = decodeLegacyDatabaseSnapshot(localStorageDb);
            migratedFromLocalStorage = true;
          } catch (error) {
            console.error('[AppDatabase] Failed to parse legacy localStorage data:', error);
            throw new Error(
              'The legacy local database could not be read. It was left unchanged so it can be recovered.',
            );
          }
        }
      }

      if (savedDb) {
        try {
          this.db = new SQL.Database(savedDb) as unknown as AppDatabaseConnection;
        } catch (error) {
          console.error('[AppDatabase] Failed to restore stored database.', error);
          const source = migratedFromLocalStorage ? 'legacy localStorage' : 'IndexedDB';
          throw new Error(
            `The database stored in ${source} could not be opened. No empty replacement was created.`,
          );
        }

        // Verify the IndexedDB copy before marking a legacy migration complete.
        if (migratedFromLocalStorage) {
          try {
            await this.writeSnapshotToIndexedDB(this.db.export());
            const verifiedSnapshot = await this.loadFromIndexedDB();
            if (!verifiedSnapshot) {
              throw new Error('The migrated IndexedDB snapshot could not be read back.');
            }
            const verificationDb = new SQL.Database(
              verifiedSnapshot,
            ) as unknown as AppDatabaseConnection;
            verificationDb.close();
            try {
              localStorage.setItem('sqliteDbMigratedToIndexedDB', 'true');
            } catch (error) {
              console.warn('[AppDatabase] Could not save the migration marker:', error);
            }
            console.log('[AppDatabase] Migration verified. Legacy localStorage copy retained for recovery.');
          } catch (error) {
            console.error('[AppDatabase] Failed to verify IndexedDB migration.', error);
            throw new Error(
              'The legacy database opened successfully but could not be copied safely to IndexedDB. The legacy copy was retained.',
            );
          }
        }
      } else {
        this.db = new SQL.Database() as unknown as AppDatabaseConnection;
      }

      this.persistenceCoordinator = new PersistenceCoordinator({
        exportSnapshot: () => this.db.export(),
        writeSnapshot: (snapshot) => this.writeSnapshotToIndexedDB(snapshot),
        onBackgroundError: (error) => {
          console.error('[AppDatabase] Failed to persist DB to IndexedDB:', error);
        },
      });
    }

    await this.createTables();
    await this.runMigrations();
    await wikiRepo.ensureChapterWikiMentionsSchema(this.context);
    await this.flushPersistence();
    if (!this.isNative && !this.isElectron) {
      await this.migrateLegacyBrowserImageData();
    }
  }

  private async createTables() {
    const schema = `
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
    `;

    if (this.isNative) {
      await this.db.execute(schema);
    } else {
      this.db.run(schema);
      this.requestPersistence();
    }
  }

  private async runMigrations() {
    // Add missing columns to existing tables
    const migrations = [
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
        FROM chapter_revisions WHERE revision_kind = 'save'`
    ];

    for (const migration of migrations) {
      try {
        if (this.isNative) {
          await this.db.execute(migration);
        } else {
          this.db.run(migration);
        }
      } catch {
        // Column already exists, ignore error
        // SQLite throws error if column exists, which is expected
      }
    }

    if (!this.isNative) {
      this.requestPersistence();
    }
  }

  // --- Books, chapters, and revision history --------------------------------
  // Delegated to ./db/chapterRepository. Public signatures are unchanged.
  async saveBook(book: Book) {
    return chapterRepo.saveBook(this.context, book);
  }

  async getBooks(): Promise<Book[]> {
    return chapterRepo.getBooks(this.context);
  }

  async saveChapter(chapter: Chapter, options: { createRevision?: boolean; forceRevision?: boolean } = {}): Promise<string | null> {
    return chapterRepo.saveChapter(this.context, chapter, options);
  }

  async getChapters(bookId: string): Promise<Chapter[]> {
    return chapterRepo.getChapters(this.context, bookId);
  }

  async deleteChapter(chapterId: string, bookId: string): Promise<void> {
    return chapterRepo.deleteChapter(this.context, chapterId, bookId);
  }

  async getChapterRevisions(chapterId: string): Promise<ChapterRevision[]> {
    return chapterRepo.getChapterRevisions(this.context, chapterId);
  }

  async discardChapterRevision(revisionId: string): Promise<ChapterRevision> {
    return chapterRepo.discardChapterRevision(this.context, revisionId);
  }

  async restoreChapterRevision(revisionId: string): Promise<ChapterRevision> {
    return chapterRepo.restoreChapterRevision(this.context, revisionId);
  }

  async getBookRevisionActivity(bookId: string): Promise<ChapterRevisionActivity[]> {
    return chapterRepo.getBookRevisionActivity(this.context, bookId);
  }

  // Book Parts methods
  // --- Book parts (volumes) and chapter/part ordering ----------------------
  // Delegated to ./db/partRepository. Public signatures are unchanged.
  async createPart(part: { book_id: string; name: string }): Promise<BookPart> {
    return partRepo.createPart(this.context, part);
  }

  async getParts(bookId: string): Promise<BookPart[]> {
    return partRepo.getParts(this.context, bookId);
  }

  async setPartCoverImageId(partId: string, imageId: string | null): Promise<void> {
    return partRepo.setPartCoverImageId(this.context, partId, imageId);
  }

  async updatePart(partId: string, name: string) {
    return partRepo.updatePart(this.context, partId, name);
  }

  async updatePartOrder(bookId: string, partOrder: string[]) {
    return partRepo.updatePartOrder(this.context, bookId, partOrder);
  }

  async deletePart(partId: string) {
    return partRepo.deletePart(this.context, partId);
  }

  async updateChapterOrders(
    bookId: string,
    chapterOrder: string[],
    partUpdates: Record<string, string[]>,
    partOrder?: string[]
  ) {
    return partRepo.updateChapterOrders(this.context, bookId, chapterOrder, partUpdates, partOrder);
  }

  async exportDatabase(): Promise<Uint8Array> {
    await this.flushPersistence();

    if (this.isNative) {
      const jsonExport = await this.db.exportToJson('full');
      const normalized = this.normalizeCapacitorExport(jsonExport);
      return new TextEncoder().encode(JSON.stringify(normalized));
    } else {
      // Export all tables as JSON
      const books = await this.getBooks();
      const allChapters: Chapter[] = [];

      for (const book of books) {
        const chapters = await this.getChapters(book.id);
        allChapters.push(...chapters);
      }

      // Get all data from other tables
      const getAllFromTable = (tableName: string) => {
        const result = this.db.exec(`SELECT * FROM ${tableName}`);
        return result.length > 0 ? result[0].values : [];
      };
      const getAllObjectsFromTable = (tableName: string, columns: string[]) => {
        const result = this.db.exec(`SELECT ${columns.join(', ')} FROM ${tableName}`);
        if (result.length === 0) return [];

        return result[0].values.map((row: unknown[]) =>
          columns.reduce((entry, column, index) => {
            entry[column] = row[index] ?? null;
            return entry;
          }, {} as Record<string, unknown>)
        );
      };

      const exportData = {
        version: DATABASE_EXPORT_VERSION,
        books,
        chapters: allChapters,
        chapter_revisions: getAllFromTable('chapter_revisions'),
        chapter_activity: getAllFromTable('chapter_activity'),
        book_parts: getAllFromTable('book_parts'),
        chapter_summaries: getAllFromTable('chapter_summaries'),
        part_summaries: getAllFromTable('part_summaries'),
        wiki_pages: getAllObjectsFromTable('wiki_pages', WIKI_PAGE_COLUMNS),
        book_characters: getAllFromTable('book_characters'),
        chapter_reviews: getAllFromTable('chapter_reviews'),
        custom_reviewer_profiles: getAllFromTable('custom_reviewer_profiles'),
        ai_profiles: getAllFromTable('ai_profiles'),
        wiki_updates: getAllFromTable('wiki_updates'),
        chapter_wiki_mentions: getAllFromTable('chapter_wiki_mentions'),
        image_assets: getAllObjectsFromTable('image_assets', IMAGE_ASSET_COLUMNS),
        image_wiki_tags: getAllObjectsFromTable('image_wiki_tags', ['image_id', 'wiki_page_id', 'created_at']),
        chapter_notes: getAllFromTable('chapter_notes')
      };

      return new TextEncoder().encode(JSON.stringify(exportData));
    }
  }

  async importDatabase(data: Uint8Array): Promise<void> {
    const jsonString = new TextDecoder().decode(data);
    const importData = this.normalizeCapacitorExport(JSON.parse(jsonString));
    console.log('[Database] importDatabase: image_assets count:', importData.image_assets?.length || 0);
    if (importData.image_assets?.length > 0) {
      console.log('[Database] importDatabase: First image_asset:', importData.image_assets[0]);
      // image_data is at index 9 for arrays (added via ALTER TABLE)
      const hasImageData = importData.image_assets.some((row) => Array.isArray(row) ? row[9] : row.image_data);
      console.log('[Database] importDatabase: Any have image_data?', hasImageData);
    }

    const run = async (sql: string, params: unknown[] = []) => {
      if (this.isNative) {
        await this.db.run(sql, params);
      } else {
        this.db.run(sql, params);
      }
    };

    // Skip intermediate saves during bulk import (saves 170MB+ being written hundreds of times)
    this.isImporting = true;

    try {
      // Disable foreign key constraints during import
      // Use execute() on native platforms for PRAGMA commands
      if (this.isNative) {
        await this.db.execute('PRAGMA foreign_keys = OFF');
      } else {
        this.db.run('PRAGMA foreign_keys = OFF');
      }

      const tablesToClear = [
        'chapter_wiki_mentions',
        'wiki_updates',
        'chapter_reviews',
        'book_characters',
        'chapter_summaries',
        'part_summaries',
        'chapter_notes',
        'chapter_revisions',
        'chapter_activity',
        'image_wiki_tags',
        'wiki_pages',
        'chapters',
        'book_parts',
        'books',
        'custom_reviewer_profiles',
        'ai_profiles',
        'image_assets'
      ];

      for (const table of tablesToClear) {
        await run(`DELETE FROM ${table}`);
      }

      const importTable = async (tableName: string, rows: ImportRow[]) => {
        if (!rows || rows.length === 0) return;

        const expectedColumns = await this.getTableColumns(tableName);
        if (!expectedColumns.length) return;

        const placeholders = expectedColumns.map(() => '?').join(', ');
        const columnList = expectedColumns.map((col) => `"${col}"`).join(', ');
        const insertSql = `INSERT OR REPLACE INTO ${tableName} (${columnList}) VALUES (${placeholders})`;

        for (const row of rows) {
          const rowValues: Record<string, unknown> = Array.isArray(row)
            ? expectedColumns.reduce((acc, column, index) => {
                acc[column] = row[index] ?? null;
                return acc;
              }, {} as Record<string, unknown>)
            : row ?? {};

          const values = expectedColumns.map((column) => rowValues[column] ?? null);
          await run(insertSql, values);
        }
      };

      if (importData.books) {
        for (const book of importData.books) {
          await this.saveBook(toImportedBook(book));
        }
      }

      await importTable('book_parts', importData.book_parts);

      if (importData.chapters) {
        for (const chapter of importData.chapters) {
          await this.saveChapter(toImportedChapter(chapter), { createRevision: false });
        }
      }

      await importTable('chapter_revisions', importData.chapter_revisions);
      await importTable('chapter_activity', importData.chapter_activity);
      await run(`INSERT OR IGNORE INTO chapter_activity
        (id, book_id, chapter_id, chapter_title, activity_type, words_added, words_removed, word_count_deleted, created_at)
        SELECT id, book_id, chapter_id, title, 'save', words_added, words_removed, 0, created_at
        FROM chapter_revisions WHERE revision_kind = 'save'`);

      await importTable('wiki_pages', importData.wiki_pages);
      await importTable('custom_reviewer_profiles', importData.custom_reviewer_profiles);
      await importTable('ai_profiles', importData.ai_profiles);
      await importTable('chapter_summaries', importData.chapter_summaries);
      await importTable('part_summaries', importData.part_summaries);
      await importTable('chapter_reviews', importData.chapter_reviews);
      await importTable('book_characters', importData.book_characters);
      await importTable('wiki_updates', importData.wiki_updates);
      await importTable('chapter_wiki_mentions', importData.chapter_wiki_mentions);
      await importTable('image_assets', this.normalizeImageAssetImportRows(importData.image_assets));
      await importTable('image_wiki_tags', importData.image_wiki_tags);
      await importTable('chapter_notes', importData.chapter_notes);

      // Re-enable foreign key constraints after import
      // Use execute() on native platforms for PRAGMA commands
      if (this.isNative) {
        await this.db.execute('PRAGMA foreign_keys = ON');
      } else {
        this.db.run('PRAGMA foreign_keys = ON');
      }
    } finally {
      this.isImporting = false;
    }

    // Save once at the end after all imports are complete
    if (!this.isNative) {
      console.log('[Database] importDatabase: Saving to IndexedDB...');
      this.requestPersistence();
      await this.flushPersistence();
      console.log('[Database] importDatabase: Save complete');
    }
  }

  async importFromNeonExport(jsonData: unknown): Promise<void> {
    // Transform Neon PostgreSQL export to match our schema
    // Neon exports tables as arrays of objects with column names
    const sourceData = isRecord(jsonData) ? jsonData : {};
    const transformedData: DatabaseImportData = {
      version: DATABASE_EXPORT_VERSION,
      books: [],
      chapters: [],
      chapter_revisions: [],
      chapter_activity: [],
      book_parts: [],
      chapter_summaries: [],
      part_summaries: [],
      wiki_pages: [],
      book_characters: [],
      chapter_reviews: [],
      custom_reviewer_profiles: [],
      ai_profiles: [],
      wiki_updates: [],
      chapter_wiki_mentions: [],
      image_assets: [],
      image_wiki_tags: [],
      chapter_notes: []
    };

    // Map Neon table exports to our format
    if (Array.isArray(sourceData.books)) {
      transformedData.books = sourceData.books.filter(isRecord).map((b) => ({
        id: b.id,
        title: b.title,
        created_at: b.created_at
      }));
    }

    if (Array.isArray(sourceData.chapters)) {
      transformedData.chapters = sourceData.chapters.filter(isRecord).map((c) => ({
        id: c.id,
        book_id: c.book_id,
        title: c.title,
        text: c.text,
        word_count: c.word_count,
        created_at: c.created_at
      }));
    }

    // Just pass through other tables as-is
    transformedData.book_parts = Array.isArray(sourceData.book_parts) ? sourceData.book_parts.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : [];
    transformedData.chapter_summaries = Array.isArray(sourceData.chapter_summaries) ? sourceData.chapter_summaries.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : [];
    transformedData.part_summaries = Array.isArray(sourceData.part_summaries) ? sourceData.part_summaries.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : [];
    transformedData.wiki_pages = Array.isArray(sourceData.wiki_pages) ? sourceData.wiki_pages.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : [];
    transformedData.book_characters = Array.isArray(sourceData.book_characters) ? sourceData.book_characters.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : [];
    transformedData.chapter_reviews = Array.isArray(sourceData.chapter_reviews) ? sourceData.chapter_reviews.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : [];
    transformedData.custom_reviewer_profiles = Array.isArray(sourceData.custom_reviewer_profiles) ? sourceData.custom_reviewer_profiles.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : [];
    transformedData.ai_profiles = Array.isArray(sourceData.ai_profiles) ? sourceData.ai_profiles.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : [];
    transformedData.wiki_updates = Array.isArray(sourceData.wiki_updates) ? sourceData.wiki_updates.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : [];
    transformedData.chapter_wiki_mentions = Array.isArray(sourceData.chapter_wiki_mentions) ? sourceData.chapter_wiki_mentions.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : [];
    transformedData.image_assets = Array.isArray(sourceData.image_assets) ? sourceData.image_assets.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : [];
    transformedData.image_wiki_tags = Array.isArray(sourceData.image_wiki_tags) ? sourceData.image_wiki_tags.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : [];
    transformedData.chapter_notes = Array.isArray(sourceData.chapter_notes) ? sourceData.chapter_notes.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : [];

    // Use the standard import function
    const jsonString = JSON.stringify(transformedData);
    await this.importDatabase(new TextEncoder().encode(jsonString));
  }

  private normalizeCapacitorExport(raw: unknown): DatabaseImportData {
    return normalizeDatabaseImportData(raw);
  }

  private convertCapacitorExport(exportData: CapacitorExportShape): DatabaseImportData {
    return normalizeDatabaseImportData({ tables: exportData.tables });
  }

  private normalizeImageAssetImportRows(rows: unknown[] | undefined) {
    return normalizeImageAssetImportRows(rows);
  }

  private async getTableColumns(tableName: string): Promise<string[]> {
    if (this.tableColumnCache.has(tableName)) {
      return this.tableColumnCache.get(tableName)!;
    }

    let columns: string[] = [];

    if (this.isNative) {
      const result = await this.db.query(`PRAGMA table_info(${tableName})`);
      const rows = result?.values ?? [];
      columns = rows
        .map((row: unknown) => {
          if (isRecord(row) && typeof row.name === 'string') return row.name;
          if (Array.isArray(row)) return typeof row[1] === 'string' ? row[1] : null;
          return null;
        })
        .filter((name: unknown): name is string => typeof name === 'string');
    } else {
      const result = this.db.exec(`PRAGMA table_info(${tableName})`);
      if (result.length > 0) {
        const nameIndex = result[0].columns.indexOf('name');
        columns = result[0].values
          .map((row: unknown[]) => row[nameIndex])
          .filter((name: unknown): name is string => typeof name === 'string');
      }
    }

    this.tableColumnCache.set(tableName, columns);
    return columns;
  }

  // --- Chapter/part metadata (summaries, reviews, notes, profiles) ---------
  // These methods delegate to ./db/metadataRepository. The class keeps the same
  // public surface; the data-access logic now lives in a focused, independently
  // testable module. See DatabaseContext for the shared dependency it receives.

  /** Dependencies handed to repository modules for data access. */
  private get context(): DatabaseContext {
    return {
      connection: this.db,
      isNative: this.isNative ?? false,
      requestPersistence: () => this.requestPersistence(),
      flushPersistence: () => this.flushPersistence(),
    };
  }

  // Chapter Summary methods
  async saveSummary(summary: {
    chapter_id: string;
    summary: string;
    pov: string | null;
    characters: string[];
    beats: string[];
    spoilers_ok: boolean;
  }) {
    return metadataRepo.saveSummary(this.context, summary);
  }

  async getSummary(chapterId: string): Promise<ChapterSummary | null> {
    return metadataRepo.getSummary(this.context, chapterId);
  }

  async savePartSummary(summary: {
    part_id: string;
    summary: string;
    characters: string[];
    beats: string[];
  }) {
    return metadataRepo.savePartSummary(this.context, summary);
  }

  async getPartSummary(partId: string): Promise<PartSummary | null> {
    return metadataRepo.getPartSummary(this.context, partId);
  }

  async deletePartSummary(partId: string) {
    return metadataRepo.deletePartSummary(this.context, partId);
  }

  // Chapter Review methods
  async saveReview(review: {
    chapter_id: string;
    review_text: string;
    prompt_used: string | null;
    profile_id: number | null;
    profile_name: string | null;
    tone_key: string | null;
  }) {
    return metadataRepo.saveReview(this.context, review);
  }

  async getReviews(chapterId: string): Promise<ChapterReview[]> {
    return metadataRepo.getReviews(this.context, chapterId);
  }

  async deleteReview(reviewId: string) {
    return metadataRepo.deleteReview(this.context, reviewId);
  }

  // Chapter Notes methods
  async saveNotes(chapterId: string, notes: string): Promise<void> {
    return metadataRepo.saveNotes(this.context, chapterId, notes);
  }

  async getNotes(chapterId: string): Promise<ChapterNote | null> {
    return metadataRepo.getNotes(this.context, chapterId);
  }

  async deleteNotes(chapterId: string): Promise<void> {
    return metadataRepo.deleteNotes(this.context, chapterId);
  }

  // Custom Reviewer Profile methods
  async getCustomProfiles(): Promise<CustomReviewerProfile[]> {
    return metadataRepo.getCustomProfiles(this.context);
  }

  async createCustomProfile(profile: {
    name: string;
    description: string;
  }) {
    return metadataRepo.createCustomProfile(this.context, profile);
  }

  async updateCustomProfile(profileId: number, updates: {
    name?: string;
    description?: string;
  }) {
    return metadataRepo.updateCustomProfile(this.context, profileId, updates);
  }

  async deleteCustomProfile(profileId: number) {
    return metadataRepo.deleteCustomProfile(this.context, profileId);
  }

  // --- Wiki pages, updates, and chapter<->wiki links -----------------------
  // Delegated to ./db/wikiRepository. Public signatures are unchanged.
  async createWikiPage(page: {
    book_id: string;
    page_name: string;
    content: string;
    summary: string;
    page_type?: string;
    created_by_ai?: boolean;
    is_pinned?: boolean;
    aliases?: string[];
  }) {
    return wikiRepo.createWikiPage(this.context, page);
  }

  async updateWikiPage(pageId: string, updates: {
    content?: string;
    summary?: string;
    page_name?: string;
    tags?: string;
    is_pinned?: boolean;
    aliases?: string[];
  }) {
    return wikiRepo.updateWikiPage(this.context, pageId, updates);
  }

  async getWikiPageById(id: string): Promise<WikiPage | null> {
    return wikiRepo.getWikiPageById(this.context, id);
  }

  async getWikiPage(bookId: string, pageName: string, pageType?: string): Promise<WikiPage | null> {
    return wikiRepo.getWikiPage(this.context, bookId, pageName, pageType);
  }

  async getWikiPages(bookId: string): Promise<WikiPage[]> {
    return wikiRepo.getWikiPages(this.context, bookId);
  }

  async deleteWikiPage(pageId: string): Promise<void> {
    return wikiRepo.deleteWikiPage(this.context, pageId);
  }

  async trackWikiUpdate(update: {
    wiki_page_id: string;
    chapter_id: string;
    update_type: string;
    change_summary?: string;
    contradiction_notes?: string;
  }) {
    return wikiRepo.trackWikiUpdate(this.context, update);
  }

  async getChapterWikiMentions(chapterId: string): Promise<ChapterWikiMention[]> {
    return wikiRepo.getChapterWikiMentions(this.context, chapterId);
  }

  async getChapterWikiLinks(chapterId: string): Promise<ChapterWikiLink[]> {
    return wikiRepo.getChapterWikiLinks(this.context, chapterId);
  }

  async getWikiPageChapterLinks(wikiPageId: string): Promise<WikiPageChapterLink[]> {
    return wikiRepo.getWikiPageChapterLinks(this.context, wikiPageId);
  }

  async addChapterWikiMention(
    chapterId: string,
    wikiPageId: string,
    linkSource: ChapterWikiLinkSource = 'manual',
  ) {
    return wikiRepo.addChapterWikiMention(this.context, chapterId, wikiPageId, linkSource);
  }

  async setChapterWikiLinks(
    chapterId: string,
    wikiPageIds: string[],
    linkSource: ChapterWikiLinkSource = 'manual',
  ): Promise<void> {
    return wikiRepo.setChapterWikiLinks(this.context, chapterId, wikiPageIds, linkSource);
  }

  async ensureChapterWikiLinks(
    chapterId: string,
    wikiPageIds: string[],
    linkSource: ChapterWikiLinkSource = 'manual',
  ): Promise<void> {
    return wikiRepo.ensureChapterWikiLinks(this.context, chapterId, wikiPageIds, linkSource);
  }

  async setWikiPageChapterLinks(
    wikiPageId: string,
    chapterIds: string[],
    linkSource: ChapterWikiLinkSource = 'manual',
  ): Promise<void> {
    return wikiRepo.setWikiPageChapterLinks(this.context, wikiPageId, chapterIds, linkSource);
  }

  // Search and Replace methods
  // --- Full-text search and find/replace -----------------------------------
  // Delegated to ./db/searchRepository. Public signatures are unchanged.
  async searchBook(bookId: string, searchTerm: string) {
    return searchRepo.searchBook(this.context, bookId, searchTerm);
  }

  async findReplaceMatches(request: FindReplaceSearchRequest): Promise<FindReplaceDocument[]> {
    return searchRepo.findReplaceMatches(this.context, request);
  }

  async replaceFindReplaceMatches(
    request: ReplaceFindReplaceMatchesRequest,
  ): Promise<ReplaceFindReplaceMatchesResult> {
    return searchRepo.replaceFindReplaceMatches(this.context, request);
  }

  async restoreFindReplaceFields(request: RestoreFindReplaceFieldsRequest): Promise<void> {
    return searchRepo.restoreFindReplaceFields(this.context, request);
  }


  // --- Image assets, wiki tags, and cover images ---------------------------
  // Delegated to ./db/imageRepository. Public signatures are unchanged.
  async saveImageAsset(asset: ImageAsset) {
    return imageRepo.saveImageAsset(this.context, asset);
  }

  async deleteImageAsset(imageId: string) {
    return imageRepo.deleteImageAsset(this.context, imageId);
  }

  async updateImageAssetNotes(imageId: string, notes: string): Promise<void> {
    return imageRepo.updateImageAssetNotes(this.context, imageId, notes);
  }

  async getImageWikiTags(imageId: string): Promise<ImageWikiTag[]> {
    return imageRepo.getImageWikiTags(this.context, imageId);
  }

  async setImageWikiTags(imageId: string, wikiPageIds: string[]): Promise<void> {
    return imageRepo.setImageWikiTags(this.context, imageId, wikiPageIds);
  }

  async getWikiPageImages(wikiPageId: string): Promise<ImageAsset[]> {
    return imageRepo.getWikiPageImages(this.context, wikiPageId);
  }

  async getChapterImages(chapterId: string): Promise<ImageAsset[]> {
    return imageRepo.getChapterImages(this.context, chapterId);
  }

  async getPartImages(partId: string): Promise<ImageAsset[]> {
    return imageRepo.getPartImages(this.context, partId);
  }

  async getBookImages(bookId: string): Promise<ImageAsset[]> {
    return imageRepo.getBookImages(this.context, bookId);
  }

  async getBookCoverImage(bookId: string): Promise<ImageAsset | null> {
    return imageRepo.getBookCoverImage(this.context, bookId);
  }

  async setBookCoverImage(bookId: string, imageId: string | null) {
    return imageRepo.setBookCoverImage(this.context, bookId, imageId);
  }

  async getPartCoverImage(partId: string): Promise<ImageAsset | null> {
    return imageRepo.getPartCoverImage(this.context, partId);
  }

  async setChapterCoverImageId(chapterId: string, imageId: string | null): Promise<void> {
    return imageRepo.setChapterCoverImageId(this.context, chapterId, imageId);
  }

  async getChapterCoverImage(chapterId: string): Promise<ImageAsset | null> {
    return imageRepo.getChapterCoverImage(this.context, chapterId);
  }

  async setWikiPageCoverImageId(wikiPageId: string, imageId: string | null): Promise<void> {
    return imageRepo.setWikiPageCoverImageId(this.context, wikiPageId, imageId);
  }

  async getWikiPageCoverImage(wikiPageId: string): Promise<ImageAsset | null> {
    return imageRepo.getWikiPageCoverImage(this.context, wikiPageId);
  }

  async replaceInChapter(chapterId: string, searchTerm: string, replaceTerm: string): Promise<void> {
    return searchRepo.replaceInChapter(this.context, chapterId, searchTerm, replaceTerm);
  }

  async replaceInWikiPage(wikiPageId: string, searchTerm: string, replaceTerm: string): Promise<void> {
    return searchRepo.replaceInWikiPage(this.context, wikiPageId, searchTerm, replaceTerm);
  }


  private requestPersistence() {
    if (!this.isNative && !this.isImporting) {
      // Skip during bulk import to avoid exporting and writing a large database
      // hundreds of times. The import path requests and flushes once at the end.
      this.persistenceCoordinator?.request();
    }
  }

  async flushPersistence(): Promise<void> {
    if (this.isNative) return;
    await this.persistenceCoordinator?.flush();
  }

  private async writeSnapshotToIndexedDB(data: Uint8Array): Promise<void> {
    await writeIndexedDbValue(DATABASE_STORE, SQLITE_DATABASE_KEY, data);
  }

  private async loadFromIndexedDB(): Promise<Uint8Array | null> {
    const result = await readIndexedDbValue<Uint8Array | ArrayBuffer>(
      DATABASE_STORE,
      SQLITE_DATABASE_KEY,
    );
    if (result instanceof Uint8Array) return result;
    if (result) return new Uint8Array(result);
    return null;
  }

  private async migrateLegacyBrowserImageData(): Promise<void> {
    const repository: ImageDataMigrationRepository = {
      listPendingImageIds: async () => {
        const result = this.db.exec(
          `SELECT id FROM image_assets
           WHERE image_data IS NOT NULL AND image_data <> ''
           ORDER BY created_at ASC`,
        );
        return result.length > 0
          ? result[0].values.map((row) => String(row[0]))
          : [];
      },
      loadImages: async (imageIds) => {
        if (imageIds.length === 0) return [];
        const placeholders = imageIds.map(() => '?').join(', ');
        const result = this.db.exec(
          `SELECT ${IMAGE_ASSET_COLUMNS.join(', ')} FROM image_assets
           WHERE id IN (${placeholders})`,
          imageIds,
        );
        return result.length > 0
          ? result[0].values.map(imageAssetFromSqlRow)
          : [];
      },
      clearImageData: async (imageIds) => {
        if (imageIds.length === 0) return;
        const placeholders = imageIds.map(() => '?').join(', ');
        this.db.run(
          `UPDATE image_assets SET image_data = NULL WHERE id IN (${placeholders})`,
          imageIds,
        );
        this.requestPersistence();
      },
      flush: () => this.flushPersistence(),
      saveStatus: (status) => writeIndexedDbValue(
        METADATA_STORE,
        IMAGE_BLOB_MIGRATION_STATUS_KEY,
        status,
      ),
    };

    const status = await migrateLegacyImageData({
      repository,
      store: new IndexedDbImageContentStore(),
    });
    if (status.status === 'partial') {
      console.warn(
        '[AppDatabase] Some legacy image data could not be migrated and was retained:',
        status.failedImageIds,
      );
    } else if (status.migratedCount > 0) {
      console.log(`[AppDatabase] Migrated ${status.migratedCount} browser images to Blob storage.`);
    }
  }

  async close() {
    if (this.isNative && this.db) {
      await this.db.close();
    } else {
      await this.flushPersistence();
    }
  }
}

export const db = new AppDatabase();
