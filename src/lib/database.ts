import { Capacitor } from '@capacitor/core';
import { logger } from '@/lib/logger'
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import initSqlJs from 'sql.js';
import type { WikiPageType } from '@/types/bookView';
import { IMAGE_ASSET_COLUMNS } from '@/lib/databaseImportExport';
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
  DatabaseContext,
} from '@/lib/db/connection';
import * as metadataRepo from '@/lib/db/metadataRepository';
import * as wikiRepo from '@/lib/db/wikiRepository';
import * as imageRepo from '@/lib/db/imageRepository';
import { imageAssetFromSqlRow } from '@/lib/db/imageRepository';
import * as partRepo from '@/lib/db/partRepository';
import * as chapterRepo from '@/lib/db/chapterRepository';
import * as searchRepo from '@/lib/db/searchRepository';
import * as importExportRepo from '@/lib/db/importExportRepository';
import * as schemaSetup from '@/lib/db/schemaSetup';
import {
  reportPersistenceFailure,
  reportPersistenceSuccess,
} from '@/lib/persistenceStatus';

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

// Import row mappers (isRecord, toImportedBook, toImportedChapter) moved to
// ./db/importExportRepository alongside the import/export functions.

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
  private isImporting = false; // Skip intermediate saves during bulk import
  private persistenceCoordinator: PersistenceCoordinator | null = null;

  async init() {
    // Determine platform at init time, not at module load time
    // This ensures Capacitor and window.desktopImages are available
    const platform = typeof Capacitor.getPlatform === 'function' ? Capacitor.getPlatform() : 'web';
    const isElectron = isElectronRuntime();
    this.isElectron = isElectron;
    this.isNative = NATIVE_CAPACITOR_PLATFORMS.has(platform) && !isElectron;

    logger.log(`[AppDatabase] Platform: ${platform}, isElectron: ${isElectron}, isNative: ${this.isNative}`);

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
          logger.log('[AppDatabase] Migrating database from localStorage to IndexedDB...');
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
          // sql.js may defer reporting malformed bytes until the first query.
          // Probe the schema while we can still distinguish restore failures
          // from later application migrations and preserve the stored copy.
          this.db.exec('PRAGMA schema_version');
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
            try {
              verificationDb.exec('PRAGMA schema_version');
            } finally {
              verificationDb.close();
            }
            try {
              localStorage.setItem('sqliteDbMigratedToIndexedDB', 'true');
            } catch (error) {
              console.warn('[AppDatabase] Could not save the migration marker:', error);
            }
            logger.log('[AppDatabase] Migration verified. Legacy localStorage copy retained for recovery.');
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
          reportPersistenceFailure();
        },
        onPersisted: reportPersistenceSuccess,
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

  // --- Full-database export / import ---------------------------------------
  // Delegated to ./db/importExportRepository. Public signatures are unchanged.
  async exportDatabase(): Promise<Uint8Array> {
    return importExportRepo.exportDatabase(this.context);
  }

  async importDatabase(data: Uint8Array): Promise<void> {
    return importExportRepo.importDatabase(this.context, data);
  }

  async importFromNeonExport(jsonData: unknown): Promise<void> {
    return importExportRepo.importFromNeonExport(this.context, jsonData);
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
      setImporting: (value: boolean) => { this.isImporting = value; },
    };
  }

  // Schema DDL and migrations live in ./db/schemaSetup; these thin wrappers keep
  // the init() flow (and the setup hooks used by tests) reading naturally.
  private createTables(): Promise<void> {
    return schemaSetup.createTables(this.context);
  }

  private runMigrations(): Promise<void> {
    return schemaSetup.runMigrations(this.context);
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
      logger.log(`[AppDatabase] Migrated ${status.migratedCount} browser images to Blob storage.`);
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
