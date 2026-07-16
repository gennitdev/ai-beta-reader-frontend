import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import initSqlJs from 'sql.js';
import type { WikiPageType } from '@/types/bookView';
import {
  IMAGE_ASSET_COLUMNS,
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
  readIndexedDbValue,
  SQLITE_DATABASE_KEY,
  writeIndexedDbValue,
} from '@/lib/indexedDbStorage';
import { dispatchChapterWikiLinksChanged } from '@/utils/chapterWikiLinkEvents';

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

interface SearchChapterResult {
  id: string;
  title: string;
  text: string;
  word_count: number;
  position: number;
}

interface SearchWikiPageResult {
  id: string;
  page_name: string;
  content: string;
  summary: string;
  page_type: string;
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

function imageAssetFromSqlRow(row: unknown[]): ImageAsset {
  return {
    id: String(row[0]),
    book_id: String(row[1]),
    chapter_id: row[2] == null ? null : String(row[2]),
    asset_type: row[3] as ImageAssetType,
    file_name: String(row[4]),
    file_path: String(row[5]),
    mime_type: row[6] == null ? null : String(row[6]),
    image_data: row[7] == null ? null : String(row[7]),
    notes: row[8] == null ? '' : String(row[8]),
    created_at: String(row[9]),
    updated_at: String(row[10]),
  };
}

function imageAssetFromNativeRow(row: Record<string, unknown>): ImageAsset {
  return {
    id: String(row.id),
    book_id: String(row.book_id),
    chapter_id: row.chapter_id == null ? null : String(row.chapter_id),
    asset_type: row.asset_type as ImageAssetType,
    file_name: String(row.file_name),
    file_path: String(row.file_path),
    mime_type: row.mime_type == null ? null : String(row.mime_type),
    image_data: row.image_data == null ? null : String(row.image_data),
    notes: row.notes == null ? '' : String(row.notes),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

const NATIVE_CAPACITOR_PLATFORMS = new Set(['ios', 'android']);

type QueryRow = Record<string, unknown>;

interface QueryResultRowStatement {
  bind(values?: unknown[]): void;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
}

interface AppDatabaseConnection {
  open(): Promise<void>;
  close(): Promise<void> | void;
  execute(sql: string): Promise<unknown>;
  run(sql: string, params?: unknown[]): Promise<unknown> | void;
  query(sql: string, params?: unknown[]): Promise<{ values?: QueryRow[] }>;
  exec(sql: string, params?: unknown[]): Array<{ columns: string[]; values: unknown[][] }>;
  export(): Uint8Array;
  exportToJson(mode?: string): Promise<unknown>;
  prepare(sql: string): QueryResultRowStatement;
}

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

function toNativeBook(row: Record<string, unknown>): Book {
  return {
    id: String(row.id),
    title: String(row.title),
    chapter_order: typeof row.chapter_order === 'string' ? row.chapter_order : '[]',
    part_order: typeof row.part_order === 'string' ? row.part_order : '[]',
    cover_image_id: typeof row.cover_image_id === 'string' ? row.cover_image_id : null,
    created_at: String(row.created_at),
  };
}

function toWebBook(row: unknown[]): Book {
  return {
    id: String(row[0]),
    title: String(row[1]),
    chapter_order: typeof row[2] === 'string' ? row[2] : '[]',
    part_order: typeof row[3] === 'string' ? row[3] : '[]',
    cover_image_id: typeof row[4] === 'string' ? row[4] : null,
    created_at: String(row[5]),
  };
}

function toWebChapter(row: unknown[]): Chapter {
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

function toNativePart(row: Record<string, unknown>): BookPart {
  return {
    id: String(row.id),
    book_id: String(row.book_id),
    name: String(row.name),
    chapter_order: typeof row.chapter_order === 'string' ? row.chapter_order : '[]',
    cover_image_id: typeof row.cover_image_id === 'string' ? row.cover_image_id : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function toNativePartFromQueryRow(row: QueryRow): BookPart {
  return Array.isArray(row)
    ? toWebPart(row)
    : toNativePart(row);
}

function toWebPart(row: unknown[]): BookPart {
  return {
    id: String(row[0]),
    book_id: String(row[1]),
    name: String(row[2]),
    chapter_order: typeof row[3] === 'string' ? row[3] : '[]',
    cover_image_id: typeof row[4] === 'string' ? row[4] : null,
    created_at: String(row[5]),
    updated_at: String(row[6]),
  };
}

function toWebReview(row: unknown[]): ChapterReview {
  return {
    id: String(row[0]),
    chapter_id: String(row[1]),
    review_text: String(row[2]),
    prompt_used: typeof row[3] === 'string' ? row[3] : null,
    profile_id: typeof row[4] === 'number' ? row[4] : null,
    profile_name: typeof row[5] === 'string' ? row[5] : null,
    tone_key: typeof row[6] === 'string' ? row[6] : null,
    created_at: String(row[7]),
    updated_at: String(row[8]),
  };
}

function toWebSummary(row: unknown[]): ChapterSummary {
  return {
    id: String(row[0]),
    chapter_id: String(row[1]),
    summary: typeof row[2] === 'string' ? row[2] : null,
    pov: typeof row[3] === 'string' ? row[3] : null,
    characters: typeof row[4] === 'string' ? row[4] : null,
    beats: typeof row[5] === 'string' ? row[5] : null,
    spoilers_ok: typeof row[6] === 'boolean' ? row[6] : typeof row[6] === 'number' ? Boolean(row[6]) : null,
    created_at: String(row[7]),
    updated_at: String(row[8]),
  };
}

function toWebPartSummary(row: unknown[]): PartSummary {
  return {
    id: String(row[0]),
    part_id: String(row[1]),
    summary: typeof row[2] === 'string' ? row[2] : null,
    characters: typeof row[3] === 'string' ? row[3] : null,
    beats: typeof row[4] === 'string' ? row[4] : null,
    created_at: String(row[5]),
    updated_at: String(row[6]),
  };
}

function toWebNote(row: unknown[]): ChapterNote {
  return {
    id: String(row[0]),
    chapter_id: String(row[1]),
    notes: String(row[2] ?? ''),
    created_at: String(row[3]),
    updated_at: String(row[4]),
  };
}

function toWebCustomProfile(row: unknown[]): CustomReviewerProfile {
  return {
    id: Number(row[0]),
    name: String(row[1]),
    description: String(row[2]),
    created_at: String(row[3]),
    updated_at: String(row[4]),
  };
}

function toWebWikiPage(row: unknown[]): WikiPage {
  const rawPageType = typeof row[3] === 'string' ? row[3] : 'character';
  const pageType: WikiPageType = ['character', 'location', 'concept', 'other'].includes(rawPageType)
    ? rawPageType as WikiPageType
    : 'character';
  return {
    id: String(row[0]),
    book_id: String(row[1]),
    page_name: String(row[2]),
    page_type: pageType,
    content: String(row[4] ?? ''),
    summary: String(row[5] ?? ''),
    aliases: typeof row[6] === 'string' ? row[6] : null,
    tags: typeof row[7] === 'string' ? row[7] : null,
    is_major: Boolean(row[8]),
    created_by_ai: Boolean(row[9]),
    created_at: String(row[10]),
    updated_at: String(row[11]),
    is_pinned: Boolean(row[12]),
    cover_image_id: typeof row[13] === 'string' ? row[13] : null,
  };
}

function readQueryRowValue(row: QueryRow, index: number, key: string): unknown {
  return Array.isArray(row) ? row[index] : row[key];
}

function toNativeChapter(row: QueryRow): Chapter {
  return {
    id: String(readQueryRowValue(row, 0, 'id')),
    book_id: String(readQueryRowValue(row, 1, 'book_id')),
    part_id: typeof readQueryRowValue(row, 2, 'part_id') === 'string' ? readQueryRowValue(row, 2, 'part_id') as string : null,
    title: typeof readQueryRowValue(row, 3, 'title') === 'string' ? readQueryRowValue(row, 3, 'title') as string : undefined,
    text: String(readQueryRowValue(row, 4, 'text') ?? ''),
    word_count: Number(readQueryRowValue(row, 5, 'word_count') ?? 0),
    created_at: String(readQueryRowValue(row, 6, 'created_at')),
  };
}

function toNativeSummary(row: QueryRow): ChapterSummary {
  return {
    id: String(readQueryRowValue(row, 0, 'id')),
    chapter_id: String(readQueryRowValue(row, 1, 'chapter_id')),
    summary: typeof readQueryRowValue(row, 2, 'summary') === 'string' ? readQueryRowValue(row, 2, 'summary') as string : null,
    pov: typeof readQueryRowValue(row, 3, 'pov') === 'string' ? readQueryRowValue(row, 3, 'pov') as string : null,
    characters: typeof readQueryRowValue(row, 4, 'characters') === 'string' ? readQueryRowValue(row, 4, 'characters') as string : null,
    beats: typeof readQueryRowValue(row, 5, 'beats') === 'string' ? readQueryRowValue(row, 5, 'beats') as string : null,
    spoilers_ok: typeof readQueryRowValue(row, 6, 'spoilers_ok') === 'boolean'
      ? readQueryRowValue(row, 6, 'spoilers_ok') as boolean
      : typeof readQueryRowValue(row, 6, 'spoilers_ok') === 'number'
        ? Boolean(readQueryRowValue(row, 6, 'spoilers_ok'))
        : null,
    created_at: String(readQueryRowValue(row, 7, 'created_at')),
    updated_at: String(readQueryRowValue(row, 8, 'updated_at')),
  };
}

function toNativePartSummary(row: QueryRow): PartSummary {
  return {
    id: String(readQueryRowValue(row, 0, 'id')),
    part_id: String(readQueryRowValue(row, 1, 'part_id')),
    summary: typeof readQueryRowValue(row, 2, 'summary') === 'string' ? readQueryRowValue(row, 2, 'summary') as string : null,
    characters: typeof readQueryRowValue(row, 3, 'characters') === 'string' ? readQueryRowValue(row, 3, 'characters') as string : null,
    beats: typeof readQueryRowValue(row, 4, 'beats') === 'string' ? readQueryRowValue(row, 4, 'beats') as string : null,
    created_at: String(readQueryRowValue(row, 5, 'created_at')),
    updated_at: String(readQueryRowValue(row, 6, 'updated_at')),
  };
}

function toNativeReview(row: QueryRow): ChapterReview {
  return {
    id: String(readQueryRowValue(row, 0, 'id')),
    chapter_id: String(readQueryRowValue(row, 1, 'chapter_id')),
    review_text: String(readQueryRowValue(row, 2, 'review_text') ?? ''),
    prompt_used: typeof readQueryRowValue(row, 3, 'prompt_used') === 'string' ? readQueryRowValue(row, 3, 'prompt_used') as string : null,
    profile_id: typeof readQueryRowValue(row, 4, 'profile_id') === 'number' ? readQueryRowValue(row, 4, 'profile_id') as number : null,
    profile_name: typeof readQueryRowValue(row, 5, 'profile_name') === 'string' ? readQueryRowValue(row, 5, 'profile_name') as string : null,
    tone_key: typeof readQueryRowValue(row, 6, 'tone_key') === 'string' ? readQueryRowValue(row, 6, 'tone_key') as string : null,
    created_at: String(readQueryRowValue(row, 7, 'created_at')),
    updated_at: String(readQueryRowValue(row, 8, 'updated_at')),
  };
}

function toNativeNote(row: QueryRow): ChapterNote {
  return {
    id: String(readQueryRowValue(row, 0, 'id')),
    chapter_id: String(readQueryRowValue(row, 1, 'chapter_id')),
    notes: String(readQueryRowValue(row, 2, 'notes') ?? ''),
    created_at: String(readQueryRowValue(row, 3, 'created_at')),
    updated_at: String(readQueryRowValue(row, 4, 'updated_at')),
  };
}

function toNativeCustomProfile(row: QueryRow): CustomReviewerProfile {
  return {
    id: Number(readQueryRowValue(row, 0, 'id')),
    name: String(readQueryRowValue(row, 1, 'name')),
    description: String(readQueryRowValue(row, 2, 'description') ?? ''),
    created_at: String(readQueryRowValue(row, 3, 'created_at')),
    updated_at: String(readQueryRowValue(row, 4, 'updated_at')),
  };
}

function toNativeWikiPage(row: QueryRow): WikiPage {
  return toWebWikiPage(Array.isArray(row)
    ? row
    : [
        row.id,
        row.book_id,
        row.page_name,
        row.page_type,
        row.content,
        row.summary,
        row.aliases,
        row.tags,
        row.is_major,
        row.created_by_ai,
        row.created_at,
        row.updated_at,
        row.is_pinned,
        row.cover_image_id,
      ]);
}

function toChapterWikiMentionLinkSource(value: unknown): ChapterWikiLinkSource | null {
  return value === 'ai_summary' || value === 'manual' ? value : null;
}

function toWebChapterWikiMention(row: unknown[]): ChapterWikiMention {
  return {
    id: String(row[0]),
    chapter_id: String(row[1]),
    wiki_page_id: String(row[2]),
    link_source: toChapterWikiMentionLinkSource(row[3]),
    created_at: String(row[4]),
    updated_at: typeof row[5] === 'string' ? row[5] : null,
  };
}

function toNativeChapterWikiMention(row: QueryRow): ChapterWikiMention {
  return {
    id: String(readQueryRowValue(row, 0, 'id')),
    chapter_id: String(readQueryRowValue(row, 1, 'chapter_id')),
    wiki_page_id: String(readQueryRowValue(row, 2, 'wiki_page_id')),
    link_source: toChapterWikiMentionLinkSource(readQueryRowValue(row, 3, 'link_source')),
    created_at: String(readQueryRowValue(row, 4, 'created_at')),
    updated_at:
      typeof readQueryRowValue(row, 5, 'updated_at') === 'string'
        ? (readQueryRowValue(row, 5, 'updated_at') as string)
        : null,
  };
}

function toWebChapterWikiLink(row: unknown[]): ChapterWikiLink {
  const rawPageType = typeof row[2] === 'string' ? row[2] : 'character';
  const pageType: WikiPageType = ['character', 'location', 'concept', 'other'].includes(rawPageType)
    ? (rawPageType as WikiPageType)
    : 'character';

  return {
    wiki_page_id: String(row[0]),
    page_name: String(row[1]),
    page_type: pageType,
    link_source: toChapterWikiMentionLinkSource(row[3]),
    created_at: String(row[4]),
    updated_at: typeof row[5] === 'string' ? row[5] : null,
  };
}

function toNativeChapterWikiLink(row: QueryRow): ChapterWikiLink {
  const rawPageType = readQueryRowValue(row, 2, 'page_type');
  const pageType: WikiPageType =
    typeof rawPageType === 'string' && ['character', 'location', 'concept', 'other'].includes(rawPageType)
      ? (rawPageType as WikiPageType)
      : 'character';

  return {
    wiki_page_id: String(readQueryRowValue(row, 0, 'wiki_page_id')),
    page_name: String(readQueryRowValue(row, 1, 'page_name')),
    page_type: pageType,
    link_source: toChapterWikiMentionLinkSource(readQueryRowValue(row, 3, 'link_source')),
    created_at: String(readQueryRowValue(row, 4, 'created_at')),
    updated_at:
      typeof readQueryRowValue(row, 5, 'updated_at') === 'string'
        ? (readQueryRowValue(row, 5, 'updated_at') as string)
        : null,
  };
}

function toWebWikiPageChapterLink(row: unknown[]): WikiPageChapterLink {
  return {
    chapter_id: String(row[0]),
    chapter_title: typeof row[1] === 'string' ? row[1] : null,
    part_id: typeof row[2] === 'string' ? row[2] : null,
    link_source: toChapterWikiMentionLinkSource(row[3]),
    created_at: String(row[4]),
    updated_at: typeof row[5] === 'string' ? row[5] : null,
  };
}

function toNativeWikiPageChapterLink(row: QueryRow): WikiPageChapterLink {
  return {
    chapter_id: String(readQueryRowValue(row, 0, 'chapter_id')),
    chapter_title:
      typeof readQueryRowValue(row, 1, 'title') === 'string'
        ? (readQueryRowValue(row, 1, 'title') as string)
        : null,
    part_id:
      typeof readQueryRowValue(row, 2, 'part_id') === 'string'
        ? (readQueryRowValue(row, 2, 'part_id') as string)
        : null,
    link_source: toChapterWikiMentionLinkSource(readQueryRowValue(row, 3, 'link_source')),
    created_at: String(readQueryRowValue(row, 4, 'created_at')),
    updated_at:
      typeof readQueryRowValue(row, 5, 'updated_at') === 'string'
        ? (readQueryRowValue(row, 5, 'updated_at') as string)
        : null,
  };
}

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
  private tableColumnCache = new Map<string, string[]>();
  private isImporting = false; // Skip intermediate saves during bulk import
  private persistenceCoordinator: PersistenceCoordinator | null = null;

  async init() {
    // Determine platform at init time, not at module load time
    // This ensures Capacitor and window.desktopImages are available
    const platform = typeof Capacitor.getPlatform === 'function' ? Capacitor.getPlatform() : 'web';
    const isElectron = isElectronRuntime();
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
        locateFile: (file: string) => `/${file}`
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
    await this.ensureChapterWikiMentionsSchema();
    await this.flushPersistence();
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
      `CREATE INDEX IF NOT EXISTS idx_chapter_wiki_mentions_wiki_page ON chapter_wiki_mentions(wiki_page_id)`
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

  private async getTableColumnNames(tableName: string): Promise<Set<string>> {
    const query = `PRAGMA table_info(${tableName})`;

    if (this.isNative) {
      const result = await this.db.query(query);
      return new Set((result.values || []).map((row) => String(row.name)));
    }

    const result = this.db.exec(query);
    if (result.length === 0) {
      return new Set();
    }

    return new Set(result[0].values.map((row: unknown[]) => String(row[1])));
  }

  private async ensureChapterWikiMentionsSchema(): Promise<void> {
    const columns = await this.getTableColumnNames('chapter_wiki_mentions');
    const statements: string[] = [];

    if (!columns.has('link_source')) {
      statements.push(`ALTER TABLE chapter_wiki_mentions ADD COLUMN link_source TEXT DEFAULT 'manual'`);
    }

    if (!columns.has('updated_at')) {
      statements.push(`ALTER TABLE chapter_wiki_mentions ADD COLUMN updated_at TIMESTAMP`);
      statements.push(`UPDATE chapter_wiki_mentions SET updated_at = created_at WHERE updated_at IS NULL`);
    }

    statements.push(`CREATE INDEX IF NOT EXISTS idx_chapter_wiki_mentions_chapter ON chapter_wiki_mentions(chapter_id)`);
    statements.push(`CREATE INDEX IF NOT EXISTS idx_chapter_wiki_mentions_wiki_page ON chapter_wiki_mentions(wiki_page_id)`);

    for (const statement of statements) {
      try {
        if (this.isNative) {
          await this.db.execute(statement);
        } else {
          this.db.run(statement);
        }
      } catch (error) {
        console.warn('[AppDatabase] Failed to ensure chapter_wiki_mentions schema:', statement, error);
      }
    }

    if (!this.isNative) {
      this.requestPersistence();
    }
  }

  private async getChapterWikiMentionsCapabilities(): Promise<{
    hasLinkSource: boolean;
    hasUpdatedAt: boolean;
  }> {
    const columns = await this.getTableColumnNames('chapter_wiki_mentions');
    return {
      hasLinkSource: columns.has('link_source'),
      hasUpdatedAt: columns.has('updated_at'),
    };
  }

  async saveBook(book: Book) {
    const query = `INSERT OR REPLACE INTO books (id, title, chapter_order, part_order, cover_image_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`;
    const chapterOrder = book.chapter_order || '[]';
    const partOrder = book.part_order || '[]';
    const coverImageId = book.cover_image_id ?? null;

    if (this.isNative) {
      await this.db.run(query, [
        book.id,
        book.title,
        chapterOrder,
        partOrder,
        coverImageId,
        book.created_at,
      ]);
    } else {
      this.db.run(query, [book.id, book.title, chapterOrder, partOrder, coverImageId, book.created_at]);
      this.requestPersistence();
    }
  }

  async getBooks(): Promise<Book[]> {
    const query = `SELECT id, title, chapter_order, part_order, cover_image_id, created_at FROM books ORDER BY created_at DESC`;

    if (this.isNative) {
      const result = await this.db.query(query);
      if (!result.values) return [];

      return result.values.map((row: Record<string, unknown>) => toNativeBook(row));
    } else {
      const result = this.db.exec(query);
      if (result.length === 0) return [];

      return result[0].values.map((row: unknown[]) => toWebBook(row));
    }
  }

  async saveChapter(chapter: Chapter) {
    const query = `INSERT OR REPLACE INTO chapters (id, book_id, part_id, title, text, word_count, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;

    if (this.isNative) {
      await this.db.run(query, [
        chapter.id,
        chapter.book_id,
        chapter.part_id || null,
        chapter.title,
        chapter.text,
        chapter.word_count,
        chapter.created_at
      ]);
    } else {
      this.db.run(query, [
        chapter.id,
        chapter.book_id,
        chapter.part_id || null,
        chapter.title,
        chapter.text,
        chapter.word_count,
        chapter.created_at
      ]);
      this.requestPersistence();
    }

    // Add chapter to book's chapter_order if not already present
    await this.addChapterToBookOrder(chapter.book_id, chapter.id);
  }

  async getChapters(bookId: string): Promise<Chapter[]> {
    const query = `SELECT id, book_id, part_id, title, text, word_count, created_at
                   FROM chapters WHERE book_id = ? ORDER BY created_at`;

    if (this.isNative) {
      const result = await this.db.query(query, [bookId]);
      return (result.values || []).map((row) => toNativeChapter(row));
    } else {
      const result = this.db.exec(query, [bookId]);
      if (result.length === 0) return [];

      return result[0].values.map((row: unknown[]) => toWebChapter(row));
    }
  }

  async deleteChapter(chapterId: string, bookId: string): Promise<void> {
    // Lookup part assignment before deletion
    let partId: string | null = null;
    const getPartQuery = `SELECT part_id FROM chapters WHERE id = ? LIMIT 1`;

    if (this.isNative) {
      const result = await this.db.query(getPartQuery, [chapterId]);
      if (result.values && result.values[0]) {
        const value = readQueryRowValue(result.values[0], 0, 'part_id');
        partId = typeof value === 'string' ? value : null;
      }
    } else {
      const result = this.db.exec(getPartQuery, [chapterId]);
      if (result.length > 0 && result[0].values && result[0].values[0]) {
        const row = result[0].values[0];
        partId = (row[0] as string) || null;
      }
    }

    // Remove dependent records
    const cleanupStatements = [
      { query: "DELETE FROM chapter_summaries WHERE chapter_id = ?", params: [chapterId] },
      { query: "DELETE FROM chapter_reviews WHERE chapter_id = ?", params: [chapterId] },
      { query: "DELETE FROM chapter_wiki_mentions WHERE chapter_id = ?", params: [chapterId] },
      { query: "DELETE FROM wiki_updates WHERE chapter_id = ?", params: [chapterId] },
      { query: "DELETE FROM image_assets WHERE chapter_id = ?", params: [chapterId] },
      { query: "DELETE FROM chapter_notes WHERE chapter_id = ?", params: [chapterId] },
    ];

    for (const statement of cleanupStatements) {
      if (this.isNative) {
        await this.db.run(statement.query, statement.params);
      } else {
        this.db.run(statement.query, statement.params);
      }
    }

    // Delete the chapter itself
    const deleteChapterQuery = `DELETE FROM chapters WHERE id = ?`;
    if (this.isNative) {
      await this.db.run(deleteChapterQuery, [chapterId]);
    } else {
      this.db.run(deleteChapterQuery, [chapterId]);
    }

    // Update book chapter order
    const getBookOrderQuery = `SELECT chapter_order FROM books WHERE id = ?`;
    let bookOrder: string[] = [];

    if (this.isNative) {
      const result = await this.db.query(getBookOrderQuery, [bookId]);
      if (result.values && result.values[0]) {
        const orderValue = readQueryRowValue(result.values[0], 0, 'chapter_order');
        const orderStr = typeof orderValue === 'string' ? orderValue : '[]';
        bookOrder = JSON.parse(orderStr);
      }
    } else {
      const result = this.db.exec(getBookOrderQuery, [bookId]);
      if (result.length > 0 && result[0].values && result[0].values[0]) {
        const orderStr = (result[0].values[0][0] as string) || "[]";
        bookOrder = JSON.parse(orderStr);
      }
    }

    const updatedBookOrder = bookOrder.filter((id) => id !== chapterId);
    const updateBookOrderQuery = `UPDATE books SET chapter_order = ? WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(updateBookOrderQuery, [JSON.stringify(updatedBookOrder), bookId]);
    } else {
      this.db.run(updateBookOrderQuery, [JSON.stringify(updatedBookOrder), bookId]);
    }

    // Update part order if needed
    if (partId) {
      const getPartOrderQuery = `SELECT chapter_order FROM book_parts WHERE id = ?`;
      let partOrder: string[] = [];

      if (this.isNative) {
        const result = await this.db.query(getPartOrderQuery, [partId]);
        if (result.values && result.values[0]) {
          const orderValue = readQueryRowValue(result.values[0], 0, 'chapter_order');
          const orderStr = typeof orderValue === 'string' ? orderValue : '[]';
          partOrder = JSON.parse(orderStr);
        }
      } else {
        const result = this.db.exec(getPartOrderQuery, [partId]);
        if (result.length > 0 && result[0].values && result[0].values[0]) {
          const orderStr = (result[0].values[0][0] as string) || "[]";
          partOrder = JSON.parse(orderStr);
        }
      }

      const updatedPartOrder = partOrder.filter((id) => id !== chapterId);
      const updatePartOrderQuery = `UPDATE book_parts SET chapter_order = ? WHERE id = ?`;

      if (this.isNative) {
        await this.db.run(updatePartOrderQuery, [JSON.stringify(updatedPartOrder), partId]);
      } else {
        this.db.run(updatePartOrderQuery, [JSON.stringify(updatedPartOrder), partId]);
      }
    }

    if (!this.isNative) {
      this.requestPersistence();
    }
  }

  // Helper method to add chapter to book's chapter_order
  private async addChapterToBookOrder(bookId: string, chapterId: string) {
    // Get current chapter order
    const query = `SELECT chapter_order FROM books WHERE id = ?`;
    let currentOrder: string[] = [];

    if (this.isNative) {
      const result = await this.db.query(query, [bookId]);
      if (result.values && result.values[0]) {
        const orderValue = readQueryRowValue(result.values[0], 0, 'chapter_order');
        const orderStr = typeof orderValue === 'string' ? orderValue : '[]';
        currentOrder = JSON.parse(orderStr);
      }
    } else {
      const result = this.db.exec(query, [bookId]);
      if (result.length > 0 && result[0].values[0]) {
        const orderStr = result[0].values[0][0] || '[]';
        currentOrder = JSON.parse(orderStr as string);
      }
    }

    // Only add if not already present
    if (!currentOrder.includes(chapterId)) {
      currentOrder.push(chapterId);
      const updateQuery = `UPDATE books SET chapter_order = ? WHERE id = ?`;

      if (this.isNative) {
        await this.db.run(updateQuery, [JSON.stringify(currentOrder), bookId]);
      } else {
        this.db.run(updateQuery, [JSON.stringify(currentOrder), bookId]);
        this.requestPersistence();
      }
    }
  }

  // Book Parts methods
  async createPart(part: { book_id: string; name: string }): Promise<BookPart> {
    const id = `part-${part.book_id}-${Date.now()}`;
    const now = new Date().toISOString();
    const query = `INSERT INTO book_parts (id, book_id, name, chapter_order, created_at, updated_at)
                   VALUES (?, ?, ?, '[]', ?, ?)`;

    if (this.isNative) {
      await this.db.run(query, [id, part.book_id, part.name, now, now]);
    } else {
      this.db.run(query, [id, part.book_id, part.name, now, now]);
      this.requestPersistence();
    }

    const currentOrder = await this.getBookPartOrder(part.book_id);
    if (!currentOrder.includes(id)) {
      await this.saveBookPartOrder(part.book_id, [...currentOrder, id]);
    }

    return {
      id,
      book_id: part.book_id,
      name: part.name,
      chapter_order: '[]',
      cover_image_id: null,
      created_at: now,
      updated_at: now
    };
  }

  async getParts(bookId: string): Promise<BookPart[]> {
    const query = `SELECT id, book_id, name, chapter_order, cover_image_id, created_at, updated_at FROM book_parts WHERE book_id = ? ORDER BY created_at`;

    if (this.isNative) {
      const result = await this.db.query(query, [bookId]);
      return (result.values || []).map((row) => toNativePartFromQueryRow(row));
    } else {
      const result = this.db.exec(query, [bookId]);
      if (result.length === 0) return [];

      return result[0].values.map((row: unknown[]) => toWebPart(row));
    }
  }

  async setPartCoverImageId(partId: string, imageId: string | null): Promise<void> {
    const now = new Date().toISOString();
    const query = `UPDATE book_parts SET cover_image_id = ?, updated_at = ? WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(query, [imageId, now, partId]);
    } else {
      this.db.run(query, [imageId, now, partId]);
      this.requestPersistence();
    }
  }

  async updatePart(partId: string, name: string) {
    const now = new Date().toISOString();
    const query = `UPDATE book_parts SET name = ?, updated_at = ? WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(query, [name, now, partId]);
    } else {
      this.db.run(query, [name, now, partId]);
      this.requestPersistence();
    }
  }

  private async getBookPartOrder(bookId: string): Promise<string[]> {
    const query = `SELECT part_order FROM books WHERE id = ?`;
    let partOrder: string[] = [];

    if (this.isNative) {
      const result = await this.db.query(query, [bookId]);
      if (result.values && result.values[0]) {
        const orderValue = readQueryRowValue(result.values[0], 0, 'part_order');
        const orderStr = typeof orderValue === 'string' ? orderValue : '[]';
        try {
          const parsed = JSON.parse(orderStr);
          if (Array.isArray(parsed)) {
            partOrder = parsed;
          }
        } catch (error) {
          console.warn('Failed to parse part order for book', bookId, error);
        }
      }
    } else {
      const result = this.db.exec(query, [bookId]);
      if (result.length > 0 && result[0].values && result[0].values[0]) {
        const orderStr = (result[0].values[0][0] as string) || '[]';
        try {
          const parsed = JSON.parse(orderStr);
          if (Array.isArray(parsed)) {
            partOrder = parsed;
          }
        } catch (error) {
          console.warn('Failed to parse part order for book', bookId, error);
        }
      }
    }

    return partOrder;
  }

  private async saveBookPartOrder(bookId: string, partOrder: string[]) {
    const uniqueOrder = Array.from(new Set(partOrder));
    const query = `UPDATE books SET part_order = ? WHERE id = ?`;
    const serialized = JSON.stringify(uniqueOrder);

    if (this.isNative) {
      await this.db.run(query, [serialized, bookId]);
    } else {
      this.db.run(query, [serialized, bookId]);
      this.requestPersistence();
    }
  }

  async updatePartOrder(bookId: string, partOrder: string[]) {
    await this.saveBookPartOrder(bookId, partOrder);
  }

  async deletePart(partId: string) {
    let bookId: string | null = null;
    const getBookIdQuery = `SELECT book_id FROM book_parts WHERE id = ? LIMIT 1`;

    if (this.isNative) {
      const result = await this.db.query(getBookIdQuery, [partId]);
      if (result.values && result.values[0]) {
        bookId = result.values[0].book_id as string;
      }
    } else {
      const result = this.db.exec(getBookIdQuery, [partId]);
      if (result.length > 0 && result[0].values && result[0].values[0]) {
        const row = result[0].values[0];
        bookId = (row[0] as string) || null;
      }
    }

    // Remove part reference from chapters
    const updateChaptersQuery = `UPDATE chapters SET part_id = NULL WHERE part_id = ?`;
    const deleteQuery = `DELETE FROM book_parts WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(updateChaptersQuery, [partId]);
      await this.db.run(deleteQuery, [partId]);
      await this.db.run(`DELETE FROM part_summaries WHERE part_id = ?`, [partId]);
    } else {
      this.db.run(updateChaptersQuery, [partId]);
      this.db.run(deleteQuery, [partId]);
      this.db.run(`DELETE FROM part_summaries WHERE part_id = ?`, [partId]);
      this.requestPersistence();
    }

    if (bookId) {
      const currentOrder = await this.getBookPartOrder(bookId);
      const updatedOrder = currentOrder.filter((id) => id !== partId);
      await this.saveBookPartOrder(bookId, updatedOrder);
    }
  }

  async updateChapterOrders(
    bookId: string,
    chapterOrder: string[],
    partUpdates: Record<string, string[]>,
    partOrder?: string[]
  ) {
    // Update book's chapter_order
    const updateBookQuery = `UPDATE books SET chapter_order = ? WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(updateBookQuery, [JSON.stringify(chapterOrder), bookId]);

      // Update each part's chapter_order and chapter part_id assignments
      for (const [partId, chapterIds] of Object.entries(partUpdates)) {
        if (partId === 'null') {
          // Remove part_id from these chapters
          for (const chapterId of chapterIds) {
            await this.db.run('UPDATE chapters SET part_id = NULL WHERE id = ?', [chapterId]);
          }
        } else {
          // Update part's chapter_order
          await this.db.run('UPDATE book_parts SET chapter_order = ? WHERE id = ?', [
            JSON.stringify(chapterIds),
            partId
          ]);
          // Assign chapters to this part
          for (const chapterId of chapterIds) {
            await this.db.run('UPDATE chapters SET part_id = ? WHERE id = ?', [partId, chapterId]);
          }
        }
      }

      if (partOrder) {
        await this.saveBookPartOrder(bookId, partOrder);
      }
    } else {
      this.db.run(updateBookQuery, [JSON.stringify(chapterOrder), bookId]);

      // Update each part's chapter_order and chapter part_id assignments
      for (const [partId, chapterIds] of Object.entries(partUpdates)) {
        if (partId === 'null') {
          // Remove part_id from these chapters
          for (const chapterId of chapterIds) {
            this.db.run('UPDATE chapters SET part_id = NULL WHERE id = ?', [chapterId]);
          }
        } else {
          // Update part's chapter_order
          this.db.run('UPDATE book_parts SET chapter_order = ? WHERE id = ?', [
            JSON.stringify(chapterIds),
            partId
          ]);
          // Assign chapters to this part
          for (const chapterId of chapterIds) {
            this.db.run('UPDATE chapters SET part_id = ? WHERE id = ?', [partId, chapterId]);
          }
        }
      }

      if (partOrder) {
        await this.saveBookPartOrder(bookId, partOrder);
      }

      this.requestPersistence();
    }
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
        version: 2,
        books,
        chapters: allChapters,
        book_parts: getAllFromTable('book_parts'),
        chapter_summaries: getAllFromTable('chapter_summaries'),
        part_summaries: getAllFromTable('part_summaries'),
        wiki_pages: getAllFromTable('wiki_pages'),
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
          await this.saveChapter(toImportedChapter(chapter));
        }
      }

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
      version: 2,
      books: [],
      chapters: [],
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

  // Chapter Summary methods
  async saveSummary(summary: {
    chapter_id: string;
    summary: string;
    pov: string | null;
    characters: string[];
    beats: string[];
    spoilers_ok: boolean;
  }) {
    const id = `summary-${summary.chapter_id}-${Date.now()}`;
    const now = new Date().toISOString();
    const query = `INSERT OR REPLACE INTO chapter_summaries (id, chapter_id, summary, pov, characters, beats, spoilers_ok, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      id,
      summary.chapter_id,
      summary.summary,
      summary.pov,
      JSON.stringify(summary.characters),
      JSON.stringify(summary.beats),
      summary.spoilers_ok ? 1 : 0,
      now,
      now
    ];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.requestPersistence();
    }
  }

  async getSummary(chapterId: string): Promise<ChapterSummary | null> {
    const query = `SELECT * FROM chapter_summaries WHERE chapter_id = ? LIMIT 1`;

    if (this.isNative) {
      const result = await this.db.query(query, [chapterId]);
      return result.values?.[0] ? toNativeSummary(result.values[0]) : null;
    } else {
      const result = this.db.exec(query, [chapterId]);
      if (result.length === 0 || result[0].values.length === 0) return null;

      return toWebSummary(result[0].values[0]);
    }
  }

  async savePartSummary(summary: {
    part_id: string;
    summary: string;
    characters: string[];
    beats: string[];
  }) {
    const id = `part-summary-${summary.part_id}`;
    const now = new Date().toISOString();
    const existing = await this.getPartSummary(summary.part_id);
    const createdAt = existing?.created_at ?? now;
    const query = `INSERT OR REPLACE INTO part_summaries (id, part_id, summary, characters, beats, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      id,
      summary.part_id,
      summary.summary,
      JSON.stringify(summary.characters),
      JSON.stringify(summary.beats),
      createdAt,
      now
    ];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.requestPersistence();
    }
  }

  async getPartSummary(partId: string): Promise<PartSummary | null> {
    const query = `SELECT * FROM part_summaries WHERE part_id = ? LIMIT 1`;

    if (this.isNative) {
      const result = await this.db.query(query, [partId]);
      return result.values?.[0] ? toNativePartSummary(result.values[0]) : null;
    } else {
      const result = this.db.exec(query, [partId]);
      if (result.length === 0 || result[0].values.length === 0) return null;

      return toWebPartSummary(result[0].values[0]);
    }
  }

  async deletePartSummary(partId: string) {
    const query = `DELETE FROM part_summaries WHERE part_id = ?`;

    if (this.isNative) {
      await this.db.run(query, [partId]);
    } else {
      this.db.run(query, [partId]);
      this.requestPersistence();
    }
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
    const id = `review-${review.chapter_id}-${Date.now()}`;
    const now = new Date().toISOString();
    const query = `INSERT INTO chapter_reviews (id, chapter_id, review_text, prompt_used, profile_id, profile_name, tone_key, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      id,
      review.chapter_id,
      review.review_text,
      review.prompt_used,
      review.profile_id,
      review.profile_name,
      review.tone_key,
      now,
      now
    ];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.requestPersistence();
    }
  }

  async getReviews(chapterId: string): Promise<ChapterReview[]> {
    const query = `SELECT * FROM chapter_reviews WHERE chapter_id = ? ORDER BY created_at DESC`;

    if (this.isNative) {
      const result = await this.db.query(query, [chapterId]);
      return (result.values || []).map((row) => toNativeReview(row));
    } else {
      const result = this.db.exec(query, [chapterId]);
      if (result.length === 0) return [];

      return result[0].values.map((row: unknown[]) => toWebReview(row));
    }
  }

  async deleteReview(reviewId: string) {
    const query = `DELETE FROM chapter_reviews WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(query, [reviewId]);
    } else {
      this.db.run(query, [reviewId]);
      this.requestPersistence();
    }
  }

  // Chapter Notes methods
  async saveNotes(chapterId: string, notes: string): Promise<void> {
    const id = `notes-${chapterId}`;
    const now = new Date().toISOString();

    // Check if notes already exist for this chapter
    const existing = await this.getNotes(chapterId);
    const createdAt = existing?.created_at ?? now;

    const query = `INSERT OR REPLACE INTO chapter_notes (id, chapter_id, notes, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?)`;

    const params = [id, chapterId, notes, createdAt, now];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.requestPersistence();
    }
  }

  async getNotes(chapterId: string): Promise<ChapterNote | null> {
    const query = `SELECT * FROM chapter_notes WHERE chapter_id = ? LIMIT 1`;

    if (this.isNative) {
      const result = await this.db.query(query, [chapterId]);
      return result.values?.[0] ? toNativeNote(result.values[0]) : null;
    } else {
      const result = this.db.exec(query, [chapterId]);
      if (result.length === 0 || result[0].values.length === 0) return null;

      return toWebNote(result[0].values[0]);
    }
  }

  async deleteNotes(chapterId: string): Promise<void> {
    const query = `DELETE FROM chapter_notes WHERE chapter_id = ?`;

    if (this.isNative) {
      await this.db.run(query, [chapterId]);
    } else {
      this.db.run(query, [chapterId]);
      this.requestPersistence();
    }
  }

  // Custom Reviewer Profile methods
  async getCustomProfiles(): Promise<CustomReviewerProfile[]> {
    const query = `SELECT * FROM custom_reviewer_profiles ORDER BY created_at DESC`;

    if (this.isNative) {
      const result = await this.db.query(query);
      return (result.values || []).map((row) => toNativeCustomProfile(row));
    } else {
      const result = this.db.exec(query);
      if (result.length === 0) return [];

      return result[0].values.map((row: unknown[]) => toWebCustomProfile(row));
    }
  }

  async createCustomProfile(profile: {
    name: string;
    description: string;
  }) {
    const id = Date.now();
    const now = new Date().toISOString();
    const query = `INSERT INTO custom_reviewer_profiles (id, name, description, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?)`;

    const params = [id, profile.name, profile.description, now, now];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.requestPersistence();
    }

    return id;
  }

  async updateCustomProfile(profileId: number, updates: {
    name?: string;
    description?: string;
  }) {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: unknown[] = [];

    if (updates.name !== undefined) {
      sets.push('name = ?');
      params.push(updates.name);
    }
    if (updates.description !== undefined) {
      sets.push('description = ?');
      params.push(updates.description);
    }

    sets.push('updated_at = ?');
    params.push(now);
    params.push(profileId);

    const query = `UPDATE custom_reviewer_profiles SET ${sets.join(', ')} WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.requestPersistence();
    }
  }

  async deleteCustomProfile(profileId: number) {
    // First delete any reviews using this profile
    const deleteReviewsQuery = `DELETE FROM chapter_reviews WHERE profile_id = ?`;
    const deleteProfileQuery = `DELETE FROM custom_reviewer_profiles WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(deleteReviewsQuery, [profileId]);
      await this.db.run(deleteProfileQuery, [profileId]);
    } else {
      this.db.run(deleteReviewsQuery, [profileId]);
      this.db.run(deleteProfileQuery, [profileId]);
      this.requestPersistence();
    }
  }

  // Wiki Page methods
  async createWikiPage(page: {
    book_id: string;
    page_name: string;
    content: string;
    summary: string;
    page_type?: string;
    created_by_ai?: boolean;
    is_pinned?: boolean;
  }) {
    const id = `wiki-${page.book_id}-${Date.now()}`;
    const now = new Date().toISOString();
    const query = `INSERT INTO wiki_pages (id, book_id, page_name, page_type, content, summary, created_by_ai, created_at, updated_at, is_pinned)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      id,
      page.book_id,
      page.page_name,
      page.page_type || 'character',
      page.content,
      page.summary,
      page.created_by_ai ? 1 : 0,
      now,
      now,
      page.is_pinned ? 1 : 0
    ];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.requestPersistence();
    }

    return id;
  }

  async updateWikiPage(pageId: string, updates: {
    content?: string;
    summary?: string;
    page_name?: string;
    tags?: string;
    is_pinned?: boolean;
  }) {
    const now = new Date().toISOString();
    const sets: string[] = [];
    const params: unknown[] = [];

    if (updates.content !== undefined) {
      sets.push('content = ?');
      params.push(updates.content);
    }
    if (updates.summary !== undefined) {
      sets.push('summary = ?');
      params.push(updates.summary);
    }
    if (updates.page_name !== undefined) {
      sets.push('page_name = ?');
      params.push(updates.page_name);
    }
    if (updates.tags !== undefined) {
      sets.push('tags = ?');
      params.push(updates.tags);
    }
    if (updates.is_pinned !== undefined) {
      sets.push('is_pinned = ?');
      params.push(updates.is_pinned ? 1 : 0);
    }

    sets.push('updated_at = ?');
    params.push(now);
    params.push(pageId);

    const query = `UPDATE wiki_pages SET ${sets.join(', ')} WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.requestPersistence();
    }
  }

  async getWikiPageById(id: string): Promise<WikiPage | null> {
    const query = `SELECT * FROM wiki_pages WHERE id = ? LIMIT 1`;

    if (this.isNative) {
      const result = await this.db.query(query, [id]);
      return result.values?.[0] ? toNativeWikiPage(result.values[0]) : null;
    } else {
      const result = this.db.exec(query, [id]);
      if (result.length === 0 || result[0].values.length === 0) return null;

      return toWebWikiPage(result[0].values[0] as unknown[]);
    }
  }

  async getWikiPage(bookId: string, pageName: string): Promise<WikiPage | null> {
    const query = `SELECT * FROM wiki_pages WHERE book_id = ? AND page_name = ? LIMIT 1`;

    if (this.isNative) {
      const result = await this.db.query(query, [bookId, pageName]);
      return result.values?.[0] ? toNativeWikiPage(result.values[0]) : null;
    } else {
      const result = this.db.exec(query, [bookId, pageName]);
      if (result.length === 0 || result[0].values.length === 0) return null;

      return toWebWikiPage(result[0].values[0] as unknown[]);
    }
  }

  async getWikiPages(bookId: string): Promise<WikiPage[]> {
    const query = `SELECT * FROM wiki_pages WHERE book_id = ? ORDER BY page_name`;

    if (this.isNative) {
      const result = await this.db.query(query, [bookId]);
      return (result.values || []).map((row) => toNativeWikiPage(row));
    } else {
      const result = this.db.exec(query, [bookId]);
      if (result.length === 0) return [];

      return result[0].values.map((row: unknown[]) => toWebWikiPage(row));
    }
  }

  async deleteWikiPage(pageId: string): Promise<void> {
    // Delete related wiki updates first
    const deleteUpdatesQuery = `DELETE FROM wiki_updates WHERE wiki_page_id = ?`;
    // Delete related chapter mentions
    const deleteMentionsQuery = `DELETE FROM chapter_wiki_mentions WHERE wiki_page_id = ?`;
    // Delete image tag relationships
    const deleteImageTagsQuery = `DELETE FROM image_wiki_tags WHERE wiki_page_id = ?`;
    // Delete the wiki page itself
    const deletePageQuery = `DELETE FROM wiki_pages WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(deleteUpdatesQuery, [pageId]);
      await this.db.run(deleteMentionsQuery, [pageId]);
      await this.db.run(deleteImageTagsQuery, [pageId]);
      await this.db.run(deletePageQuery, [pageId]);
    } else {
      this.db.run(deleteUpdatesQuery, [pageId]);
      this.db.run(deleteMentionsQuery, [pageId]);
      this.db.run(deleteImageTagsQuery, [pageId]);
      this.db.run(deletePageQuery, [pageId]);
      this.requestPersistence();
    }
  }

  async trackWikiUpdate(update: {
    wiki_page_id: string;
    chapter_id: string;
    update_type: string;
    change_summary?: string;
    contradiction_notes?: string;
  }) {
    const id = `update-${update.wiki_page_id}-${Date.now()}`;
    const now = new Date().toISOString();
    const query = `INSERT INTO wiki_updates (id, wiki_page_id, chapter_id, update_type, change_summary, contradiction_notes, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`;

    const params = [
      id,
      update.wiki_page_id,
      update.chapter_id,
      update.update_type,
      update.change_summary || null,
      update.contradiction_notes || null,
      now
    ];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.requestPersistence();
    }
  }

  async getChapterWikiMentions(chapterId: string): Promise<ChapterWikiMention[]> {
    await this.ensureChapterWikiMentionsSchema();
    const { hasLinkSource, hasUpdatedAt } = await this.getChapterWikiMentionsCapabilities();

    const query = `SELECT id, chapter_id, wiki_page_id,
                   ${hasLinkSource ? 'link_source' : "NULL AS link_source"},
                   created_at,
                   ${hasUpdatedAt ? 'updated_at' : "NULL AS updated_at"}
                   FROM chapter_wiki_mentions
                   WHERE chapter_id = ?
                   ORDER BY created_at ASC`;

    if (this.isNative) {
      const result = await this.db.query(query, [chapterId]);
      return (result.values || []).map((row) => toNativeChapterWikiMention(row));
    } else {
      const result = this.db.exec(query, [chapterId]);
      if (result.length === 0) return [];

      return result[0].values.map((row: unknown[]) => toWebChapterWikiMention(row));
    }
  }

  async getChapterWikiLinks(chapterId: string): Promise<ChapterWikiLink[]> {
    await this.ensureChapterWikiMentionsSchema();
    const { hasLinkSource, hasUpdatedAt } = await this.getChapterWikiMentionsCapabilities();

    const query = `SELECT w.id AS wiki_page_id, w.page_name, w.page_type,
                   ${hasLinkSource ? 'm.link_source' : "NULL AS link_source"},
                   m.created_at,
                   ${hasUpdatedAt ? 'm.updated_at' : "NULL AS updated_at"}
                   FROM chapter_wiki_mentions m
                   INNER JOIN wiki_pages w ON w.id = m.wiki_page_id
                   WHERE m.chapter_id = ?
                   ORDER BY w.page_name COLLATE NOCASE ASC`;

    if (this.isNative) {
      const result = await this.db.query(query, [chapterId]);
      return (result.values || []).map((row) => toNativeChapterWikiLink(row));
    } else {
      const result = this.db.exec(query, [chapterId]);
      if (result.length === 0) return [];

      return result[0].values.map((row: unknown[]) => toWebChapterWikiLink(row));
    }
  }

  async getWikiPageChapterLinks(wikiPageId: string): Promise<WikiPageChapterLink[]> {
    await this.ensureChapterWikiMentionsSchema();
    const { hasLinkSource, hasUpdatedAt } = await this.getChapterWikiMentionsCapabilities();

    const query = `SELECT c.id AS chapter_id, c.title, c.part_id,
                   ${hasLinkSource ? 'm.link_source' : "NULL AS link_source"},
                   m.created_at,
                   ${hasUpdatedAt ? 'm.updated_at' : "NULL AS updated_at"}
                   FROM chapter_wiki_mentions m
                   INNER JOIN chapters c ON c.id = m.chapter_id
                   WHERE m.wiki_page_id = ?
                   ORDER BY c.created_at ASC`;

    if (this.isNative) {
      const result = await this.db.query(query, [wikiPageId]);
      return (result.values || []).map((row) => toNativeWikiPageChapterLink(row));
    } else {
      const result = this.db.exec(query, [wikiPageId]);
      if (result.length === 0) return [];

      return result[0].values.map((row: unknown[]) => toWebWikiPageChapterLink(row));
    }
  }

  async addChapterWikiMention(
    chapterId: string,
    wikiPageId: string,
    linkSource: ChapterWikiLinkSource = 'manual',
  ) {
    await this.ensureChapterWikiMentionsSchema();
    const { hasLinkSource, hasUpdatedAt } = await this.getChapterWikiMentionsCapabilities();

    const id = `mention-${chapterId}-${wikiPageId}`;
    const now = new Date().toISOString();
    const columns = ['id', 'chapter_id', 'wiki_page_id'];
    const values = ['?', '?', '?'];
    const params: unknown[] = [id, chapterId, wikiPageId];

    if (hasLinkSource) {
      columns.push('link_source');
      values.push('?');
      params.push(linkSource);
    }

    columns.push('created_at');
    values.push(`COALESCE((SELECT created_at FROM chapter_wiki_mentions WHERE id = ?), ?)`);
    params.push(id, now);

    if (hasUpdatedAt) {
      columns.push('updated_at');
      values.push('?');
      params.push(now);
    }

    const query = `INSERT OR REPLACE INTO chapter_wiki_mentions (${columns.join(', ')})
                   VALUES (${values.join(', ')})`;

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.requestPersistence();
    }

    dispatchChapterWikiLinksChanged({
      chapterIds: [chapterId],
      wikiPageIds: [wikiPageId],
    });
  }

  async setChapterWikiLinks(
    chapterId: string,
    wikiPageIds: string[],
    linkSource: ChapterWikiLinkSource = 'manual',
  ): Promise<void> {
    await this.ensureChapterWikiMentionsSchema();
    const { hasLinkSource, hasUpdatedAt } = await this.getChapterWikiMentionsCapabilities();

    const uniqueWikiPageIds = Array.from(new Set(wikiPageIds));
    const existingLinks = await this.getChapterWikiMentions(chapterId);
    const existingByWikiPageId = new Map(existingLinks.map((link) => [link.wiki_page_id, link]));
    const nextWikiPageIdSet = new Set(uniqueWikiPageIds);
    const affectedWikiPageIds = new Set([
      ...existingLinks.map((link) => link.wiki_page_id),
      ...uniqueWikiPageIds,
    ]);
    const now = new Date().toISOString();

    const run = async (sql: string, params: unknown[] = []) => {
      if (this.isNative) {
        await this.db.run(sql, params);
      } else {
        this.db.run(sql, params);
      }
    };

    for (const existingLink of existingLinks) {
      if (!nextWikiPageIdSet.has(existingLink.wiki_page_id)) {
        await run(`DELETE FROM chapter_wiki_mentions WHERE id = ?`, [existingLink.id]);
      }
    }

    for (const wikiPageId of uniqueWikiPageIds) {
      const existingLink = existingByWikiPageId.get(wikiPageId);
      const id = `mention-${chapterId}-${wikiPageId}`;
      const columns = ['id', 'chapter_id', 'wiki_page_id'];
      const values = ['?', '?', '?'];
      const params: unknown[] = [id, chapterId, wikiPageId];

      if (hasLinkSource) {
        columns.push('link_source');
        values.push('?');
        params.push(linkSource);
      }

      columns.push('created_at');
      values.push('?');
      params.push(existingLink?.created_at ?? now);

      if (hasUpdatedAt) {
        columns.push('updated_at');
        values.push('?');
        params.push(now);
      }

      await run(
        `INSERT OR REPLACE INTO chapter_wiki_mentions (${columns.join(', ')})
         VALUES (${values.join(', ')})`,
        params,
      );
    }

    if (!this.isNative) {
      this.requestPersistence();
    }

    dispatchChapterWikiLinksChanged({
      chapterIds: [chapterId],
      wikiPageIds: Array.from(affectedWikiPageIds),
    });
  }

  async ensureChapterWikiLinks(
    chapterId: string,
    wikiPageIds: string[],
    linkSource: ChapterWikiLinkSource = 'manual',
  ): Promise<void> {
    await this.ensureChapterWikiMentionsSchema();
    const { hasLinkSource, hasUpdatedAt } = await this.getChapterWikiMentionsCapabilities();

    const uniqueWikiPageIds = Array.from(new Set(wikiPageIds));
    if (uniqueWikiPageIds.length === 0) {
      return;
    }

    const existingLinks = await this.getChapterWikiMentions(chapterId);
    const existingByWikiPageId = new Map(existingLinks.map((link) => [link.wiki_page_id, link]));
    const insertedWikiPageIds: string[] = [];
    const now = new Date().toISOString();

    const run = async (sql: string, params: unknown[] = []) => {
      if (this.isNative) {
        await this.db.run(sql, params);
      } else {
        this.db.run(sql, params);
      }
    };

    for (const wikiPageId of uniqueWikiPageIds) {
      if (existingByWikiPageId.has(wikiPageId)) {
        continue;
      }

      const id = `mention-${chapterId}-${wikiPageId}`;
      const columns = ['id', 'chapter_id', 'wiki_page_id'];
      const values = ['?', '?', '?'];
      const params: unknown[] = [id, chapterId, wikiPageId];

      if (hasLinkSource) {
        columns.push('link_source');
        values.push('?');
        params.push(linkSource);
      }

      columns.push('created_at');
      values.push('?');
      params.push(now);

      if (hasUpdatedAt) {
        columns.push('updated_at');
        values.push('?');
        params.push(now);
      }

      await run(
        `INSERT OR REPLACE INTO chapter_wiki_mentions (${columns.join(', ')})
         VALUES (${values.join(', ')})`,
        params,
      );
      insertedWikiPageIds.push(wikiPageId);
    }

    if (!this.isNative && insertedWikiPageIds.length > 0) {
      this.requestPersistence();
    }

    if (insertedWikiPageIds.length > 0) {
      dispatchChapterWikiLinksChanged({
        chapterIds: [chapterId],
        wikiPageIds: insertedWikiPageIds,
      });
    }
  }

  async setWikiPageChapterLinks(
    wikiPageId: string,
    chapterIds: string[],
    linkSource: ChapterWikiLinkSource = 'manual',
  ): Promise<void> {
    await this.ensureChapterWikiMentionsSchema();
    const { hasLinkSource, hasUpdatedAt } = await this.getChapterWikiMentionsCapabilities();

    const uniqueChapterIds = Array.from(new Set(chapterIds));
    const existingLinks = await this.getWikiPageChapterLinks(wikiPageId);
    const existingByChapterId = new Map(existingLinks.map((link) => [link.chapter_id, link]));
    const nextChapterIdSet = new Set(uniqueChapterIds);
    const affectedChapterIds = new Set([
      ...existingLinks.map((link) => link.chapter_id),
      ...uniqueChapterIds,
    ]);
    const now = new Date().toISOString();

    const run = async (sql: string, params: unknown[] = []) => {
      if (this.isNative) {
        await this.db.run(sql, params);
      } else {
        this.db.run(sql, params);
      }
    };

    for (const existingLink of existingLinks) {
      if (!nextChapterIdSet.has(existingLink.chapter_id)) {
        await run(
          `DELETE FROM chapter_wiki_mentions WHERE chapter_id = ? AND wiki_page_id = ?`,
          [existingLink.chapter_id, wikiPageId],
        );
      }
    }

    for (const chapterId of uniqueChapterIds) {
      const existingLink = existingByChapterId.get(chapterId);
      const id = `mention-${chapterId}-${wikiPageId}`;
      const columns = ['id', 'chapter_id', 'wiki_page_id'];
      const values = ['?', '?', '?'];
      const params: unknown[] = [id, chapterId, wikiPageId];

      if (hasLinkSource) {
        columns.push('link_source');
        values.push('?');
        params.push(linkSource);
      }

      columns.push('created_at');
      values.push('?');
      params.push(existingLink?.created_at ?? now);

      if (hasUpdatedAt) {
        columns.push('updated_at');
        values.push('?');
        params.push(now);
      }

      await run(
        `INSERT OR REPLACE INTO chapter_wiki_mentions (${columns.join(', ')})
         VALUES (${values.join(', ')})`,
        params,
      );
    }

    if (!this.isNative) {
      this.requestPersistence();
    }

    dispatchChapterWikiLinksChanged({
      chapterIds: Array.from(affectedChapterIds),
      wikiPageIds: [wikiPageId],
    });
  }

  // Search and Replace methods
  async searchBook(bookId: string, searchTerm: string): Promise<{
    chapters: SearchChapterResult[];
    wikiPages: SearchWikiPageResult[];
  }> {
    const searchLower = searchTerm.toLowerCase();
    const chapters: SearchChapterResult[] = [];
    const wikiPages: SearchWikiPageResult[] = [];

    // Search in chapters
    const chaptersQuery = `SELECT id, title, text, word_count FROM chapters WHERE book_id = ?`;

    if (this.isNative) {
      const result = await this.db.query(chaptersQuery, [bookId]);
      result.values?.forEach((row: Record<string, unknown> | unknown[], index: number) => {
        // Handle both object and array formats from native SQLite
        const title = String((Array.isArray(row) ? row[1] : row.title) ?? '');
        const text = String((Array.isArray(row) ? row[2] : row.text) ?? '');
        const id = String(Array.isArray(row) ? row[0] : row.id);
        const wordCount = Number(Array.isArray(row) ? row[3] : row.word_count);
        if (
          (title && title.toLowerCase().includes(searchLower)) ||
          text.toLowerCase().includes(searchLower)
        ) {
          chapters.push({
            id: id,
            title: title,
            text: text,
            word_count: wordCount,
            position: index
          });
        }
      });
    } else {
      const stmt = this.db.prepare(chaptersQuery);
      stmt.bind([bookId]);
      let position = 0;
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const title = (row.title as string) || '';
        const text = (row.text as string) || '';
        if (
          (title && title.toLowerCase().includes(searchLower)) ||
          text.toLowerCase().includes(searchLower)
        ) {
          chapters.push({
            id: String(row.id),
            title: title,
            text: text,
            word_count: Number(row.word_count ?? 0),
            position: position
          });
        }
        position++;
      }
      stmt.free();
    }

    // Search in wiki pages
    const wikiQuery = `SELECT id, page_name, content, summary, page_type FROM wiki_pages WHERE book_id = ?`;

    if (this.isNative) {
      const result = await this.db.query(wikiQuery, [bookId]);
      result.values?.forEach((row: Record<string, unknown> | unknown[]) => {
        // Handle both object and array formats from native SQLite
        const id = String(Array.isArray(row) ? row[0] : row.id);
        const pageName = String((Array.isArray(row) ? row[1] : row.page_name) ?? '');
        const content = String((Array.isArray(row) ? row[2] : row.content) ?? '');
        const summary = String((Array.isArray(row) ? row[3] : row.summary) ?? '');
        const pageType = String((Array.isArray(row) ? row[4] : row.page_type) ?? '');
        if (pageName.toLowerCase().includes(searchLower) ||
            content.toLowerCase().includes(searchLower) ||
            summary.toLowerCase().includes(searchLower)) {
          wikiPages.push({
            id: id,
            page_name: pageName,
            content: content,
            summary: summary,
            page_type: pageType
          });
        }
      });
    } else {
      const stmt = this.db.prepare(wikiQuery);
      stmt.bind([bookId]);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const pageName = (row.page_name as string) || '';
        const content = (row.content as string) || '';
        const summary = (row.summary as string) || '';
        if (pageName.toLowerCase().includes(searchLower) ||
            content.toLowerCase().includes(searchLower) ||
            summary.toLowerCase().includes(searchLower)) {
          wikiPages.push({
            id: String(row.id),
            page_name: pageName,
            content: content,
            summary: summary,
            page_type: String(row.page_type ?? '')
          });
        }
      }
      stmt.free();
    }

    return { chapters, wikiPages };
  }

  async saveImageAsset(asset: ImageAsset) {
    const query = `INSERT OR REPLACE INTO image_assets
      (id, book_id, chapter_id, asset_type, file_name, file_path, mime_type, image_data, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = [
      asset.id,
      asset.book_id,
      asset.chapter_id ?? null,
      asset.asset_type,
      asset.file_name,
      asset.file_path,
      asset.mime_type ?? null,
      asset.image_data ?? null,
      asset.notes ?? '',
      asset.created_at,
      asset.updated_at,
    ];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.requestPersistence();
    }
  }

  async deleteImageAsset(imageId: string) {
    const unlinkCoverQuery = `UPDATE books SET cover_image_id = NULL WHERE cover_image_id = ?`;
    const unlinkPartCoverQuery = `UPDATE book_parts SET cover_image_id = NULL WHERE cover_image_id = ?`;
    const unlinkChapterCoverQuery = `UPDATE chapters SET cover_image_id = NULL WHERE cover_image_id = ?`;
    const deleteTagsQuery = `DELETE FROM image_wiki_tags WHERE image_id = ?`;
    const deleteQuery = `DELETE FROM image_assets WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(unlinkCoverQuery, [imageId]);
      await this.db.run(unlinkPartCoverQuery, [imageId]);
      await this.db.run(unlinkChapterCoverQuery, [imageId]);
      await this.db.run(deleteTagsQuery, [imageId]);
      await this.db.run(deleteQuery, [imageId]);
    } else {
      this.db.run(unlinkCoverQuery, [imageId]);
      this.db.run(unlinkPartCoverQuery, [imageId]);
      this.db.run(unlinkChapterCoverQuery, [imageId]);
      this.db.run(deleteTagsQuery, [imageId]);
      this.db.run(deleteQuery, [imageId]);
      this.requestPersistence();
    }
  }

  async updateImageAssetNotes(imageId: string, notes: string): Promise<void> {
    const query = `UPDATE image_assets SET notes = ?, updated_at = ? WHERE id = ?`;
    const params = [notes, new Date().toISOString(), imageId];

    if (this.isNative) {
      await this.db.run(query, params);
    } else {
      this.db.run(query, params);
      this.requestPersistence();
    }
  }

  async getImageWikiTags(imageId: string): Promise<ImageWikiTag[]> {
    const query = `
      SELECT iwt.image_id, iwt.wiki_page_id, wp.page_name, wp.page_type, iwt.created_at
      FROM image_wiki_tags iwt
      INNER JOIN wiki_pages wp ON wp.id = iwt.wiki_page_id
      WHERE iwt.image_id = ?
      ORDER BY wp.page_name
    `;

    if (this.isNative) {
      const result = await this.db.query(query, [imageId]);
      return ((result.values || []) as Record<string, unknown>[]).map((row) => ({
        image_id: String(row.image_id),
        wiki_page_id: String(row.wiki_page_id),
        page_name: String(row.page_name),
        page_type: String(row.page_type),
        created_at: String(row.created_at),
      }));
    }

    const result = this.db.exec(query, [imageId]);
    if (result.length === 0) return [];

    return result[0].values.map((row: unknown[]) => ({
      image_id: String(row[0]),
      wiki_page_id: String(row[1]),
      page_name: String(row[2]),
      page_type: String(row[3]),
      created_at: String(row[4]),
    }));
  }

  async setImageWikiTags(imageId: string, wikiPageIds: string[]): Promise<void> {
    const deleteQuery = `DELETE FROM image_wiki_tags WHERE image_id = ?`;
    const insertQuery = `INSERT OR IGNORE INTO image_wiki_tags (image_id, wiki_page_id, created_at) VALUES (?, ?, ?)`;
    const now = new Date().toISOString();
    const uniqueWikiPageIds = [...new Set(wikiPageIds)];

    if (this.isNative) {
      await this.db.run(deleteQuery, [imageId]);
      for (const wikiPageId of uniqueWikiPageIds) {
        await this.db.run(insertQuery, [imageId, wikiPageId, now]);
      }
    } else {
      this.db.run(deleteQuery, [imageId]);
      for (const wikiPageId of uniqueWikiPageIds) {
        this.db.run(insertQuery, [imageId, wikiPageId, now]);
      }
      this.requestPersistence();
    }
  }

  async getWikiPageImages(wikiPageId: string): Promise<ImageAsset[]> {
    const query = `
      SELECT ${IMAGE_ASSET_COLUMNS.map((column) => `ia.${column}`).join(', ')}
      FROM image_wiki_tags iwt
      INNER JOIN image_assets ia ON ia.id = iwt.image_id
      WHERE iwt.wiki_page_id = ?
      ORDER BY ia.created_at DESC
    `;

    if (this.isNative) {
      const result = await this.db.query(query, [wikiPageId]);
      return (result.values || []).map(imageAssetFromNativeRow);
    }

    const result = this.db.exec(query, [wikiPageId]);
    if (result.length === 0) return [];
    return result[0].values.map(imageAssetFromSqlRow);
  }

  async getChapterImages(chapterId: string): Promise<ImageAsset[]> {
    const query = `SELECT ${IMAGE_ASSET_COLUMNS.join(', ')} FROM image_assets WHERE chapter_id = ? ORDER BY created_at DESC`;

    if (this.isNative) {
      const result = await this.db.query(query, [chapterId]);
      return (result.values || []).map(imageAssetFromNativeRow);
    } else {
      const result = this.db.exec(query, [chapterId]);
      if (result.length === 0) return [];
      return result[0].values.map(imageAssetFromSqlRow);
    }
  }

  async getPartImages(partId: string): Promise<ImageAsset[]> {
    const query = `
      SELECT ${IMAGE_ASSET_COLUMNS.map((column) => `ia.${column}`).join(', ')}
      FROM image_assets ia
      INNER JOIN chapters c ON c.id = ia.chapter_id
      WHERE c.part_id = ?
      ORDER BY ia.created_at DESC
    `;

    if (this.isNative) {
      const result = await this.db.query(query, [partId]);
      return (result.values || []).map(imageAssetFromNativeRow);
    } else {
      const result = this.db.exec(query, [partId]);
      if (result.length === 0) return [];
      return result[0].values.map(imageAssetFromSqlRow);
    }
  }

  async getBookImages(bookId: string): Promise<ImageAsset[]> {
    const query = `SELECT ${IMAGE_ASSET_COLUMNS.join(', ')} FROM image_assets WHERE book_id = ? ORDER BY created_at DESC`;

    if (this.isNative) {
      const result = await this.db.query(query, [bookId]);
      return (result.values || []).map(imageAssetFromNativeRow);
    } else {
      const result = this.db.exec(query, [bookId]);
      if (result.length === 0) return [];
      return result[0].values.map(imageAssetFromSqlRow);
    }
  }

  async getBookCoverImage(bookId: string): Promise<ImageAsset | null> {
    const query = `
      SELECT ${IMAGE_ASSET_COLUMNS.map((column) => `ia.${column}`).join(', ')}
      FROM books b
      LEFT JOIN image_assets ia ON ia.id = b.cover_image_id
      WHERE b.id = ?
      LIMIT 1
    `;

    if (this.isNative) {
      const result = await this.db.query(query, [bookId]);
      const row = result.values && result.values[0];
      if (!row || !row.id) return null;
      return imageAssetFromNativeRow(row);
    } else {
      const result = this.db.exec(query, [bookId]);
      if (result.length === 0 || result[0].values.length === 0) return null;
      const row = result[0].values[0];
      if (!row[0]) return null;
      return imageAssetFromSqlRow(row);
    }
  }

  async setBookCoverImage(bookId: string, imageId: string | null) {
    const query = `UPDATE books SET cover_image_id = ? WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(query, [imageId, bookId]);
    } else {
      this.db.run(query, [imageId, bookId]);
      this.requestPersistence();
    }
  }

  async getPartCoverImage(partId: string): Promise<ImageAsset | null> {
    const query = `
      SELECT ${IMAGE_ASSET_COLUMNS.map((column) => `ia.${column}`).join(', ')}
      FROM book_parts bp
      LEFT JOIN image_assets ia ON ia.id = bp.cover_image_id
      WHERE bp.id = ?
      LIMIT 1
    `;

    if (this.isNative) {
      const result = await this.db.query(query, [partId]);
      const row = result.values && result.values[0];
      if (!row || !row.id) return null;
      return imageAssetFromNativeRow(row);
    } else {
      const result = this.db.exec(query, [partId]);
      if (result.length === 0 || result[0].values.length === 0) return null;
      const row = result[0].values[0];
      if (!row[0]) return null;
      return imageAssetFromSqlRow(row);
    }
  }

  async setChapterCoverImageId(chapterId: string, imageId: string | null): Promise<void> {
    const query = `UPDATE chapters SET cover_image_id = ? WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(query, [imageId, chapterId]);
    } else {
      this.db.run(query, [imageId, chapterId]);
      this.requestPersistence();
    }
  }

  async getChapterCoverImage(chapterId: string): Promise<ImageAsset | null> {
    const query = `
      SELECT ${IMAGE_ASSET_COLUMNS.map((column) => `ia.${column}`).join(', ')}
      FROM chapters c
      LEFT JOIN image_assets ia ON ia.id = c.cover_image_id
      WHERE c.id = ?
      LIMIT 1
    `;

    if (this.isNative) {
      const result = await this.db.query(query, [chapterId]);
      const row = result.values && result.values[0];
      if (!row || !row.id) return null;
      return imageAssetFromNativeRow(row);
    } else {
      const result = this.db.exec(query, [chapterId]);
      if (result.length === 0 || result[0].values.length === 0) return null;
      const row = result[0].values[0];
      if (!row[0]) return null;
      return imageAssetFromSqlRow(row);
    }
  }

  async setWikiPageCoverImageId(wikiPageId: string, imageId: string | null): Promise<void> {
    const query = `UPDATE wiki_pages SET cover_image_id = ?, updated_at = ? WHERE id = ?`;
    const updatedAt = new Date().toISOString();

    if (this.isNative) {
      await this.db.run(query, [imageId, updatedAt, wikiPageId]);
    } else {
      this.db.run(query, [imageId, updatedAt, wikiPageId]);
      this.requestPersistence();
    }
  }

  async getWikiPageCoverImage(wikiPageId: string): Promise<ImageAsset | null> {
    const query = `
      SELECT ${IMAGE_ASSET_COLUMNS.map((column) => `ia.${column}`).join(', ')}
      FROM wiki_pages wp
      LEFT JOIN image_assets ia ON ia.id = wp.cover_image_id
      WHERE wp.id = ?
      LIMIT 1
    `;

    if (this.isNative) {
      const result = await this.db.query(query, [wikiPageId]);
      const row = result.values && result.values[0];
      if (!row || !row.id) return null;
      return imageAssetFromNativeRow(row);
    } else {
      const result = this.db.exec(query, [wikiPageId]);
      if (result.length === 0 || result[0].values.length === 0) return null;
      const row = result[0].values[0];
      if (!row[0]) return null;
      return imageAssetFromSqlRow(row);
    }
  }

  async replaceInChapter(chapterId: string, searchTerm: string, replaceTerm: string): Promise<void> {
    // Get current chapter
    const getQuery = `SELECT title, text FROM chapters WHERE id = ?`;
    let currentTitle: string | null = null;
    let currentText = '';

    if (this.isNative) {
      const result = await this.db.query(getQuery, [chapterId]);
      if (result.values && result.values.length > 0) {
        const titleValue = readQueryRowValue(result.values[0], 0, 'title');
        const textValue = readQueryRowValue(result.values[0], 1, 'text');
        currentTitle = typeof titleValue === 'string' ? titleValue : null;
        currentText = String(textValue ?? '');
      }
    } else {
      const stmt = this.db.prepare(getQuery);
      stmt.bind([chapterId]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        currentTitle = (row.title as string) ?? null;
        currentText = (row.text as string) || '';
      }
      stmt.free();
    }

    // Perform replacement (case-insensitive but preserves the case pattern of replacement)
    // This will match all case variations of the search term
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const replaceWithCasePreservation = (text: string) => text.replace(regex, (match) => {
      // Preserve the case pattern of the matched text
      if (match === match.toUpperCase() && match.length > 1) {
        // All caps -> make replacement all caps
        return replaceTerm.toUpperCase();
      } else if (match[0] === match[0].toUpperCase()) {
        // First letter capitalized -> capitalize replacement
        return replaceTerm.charAt(0).toUpperCase() + replaceTerm.slice(1);
      } else {
        // Lowercase -> use replacement as-is
        return replaceTerm;
      }
    });
    const newText = replaceWithCasePreservation(currentText);
    const newTitle = currentTitle !== null ? replaceWithCasePreservation(currentTitle) : null;

    // Update chapter
    const updateQuery = `UPDATE chapters SET title = ?, text = ?, word_count = ? WHERE id = ?`;
    const wordCount = newText.trim().split(/\s+/).length;

    if (this.isNative) {
      await this.db.run(updateQuery, [newTitle, newText, wordCount, chapterId]);
    } else {
      this.db.run(updateQuery, [newTitle, newText, wordCount, chapterId]);
      this.requestPersistence();
    }
  }

  async replaceInWikiPage(wikiPageId: string, searchTerm: string, replaceTerm: string): Promise<void> {
    // Get current wiki page
    const getQuery = `SELECT page_name, content, summary FROM wiki_pages WHERE id = ?`;
    let pageName = '';
    let content = '';
    let summary = '';

    if (this.isNative) {
      const result = await this.db.query(getQuery, [wikiPageId]);
      if (result.values && result.values.length > 0) {
        pageName = String(readQueryRowValue(result.values[0], 0, 'page_name') ?? '');
        content = String(readQueryRowValue(result.values[0], 1, 'content') ?? '');
        summary = String(readQueryRowValue(result.values[0], 2, 'summary') ?? '');
      }
    } else {
      const stmt = this.db.prepare(getQuery);
      stmt.bind([wikiPageId]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        pageName = (row.page_name as string) || '';
        content = (row.content as string) || '';
        summary = (row.summary as string) || '';
      }
      stmt.free();
    }

    // Perform replacements (case-insensitive but preserves the case pattern)
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const replaceWithCasePreservation = (text: string) => {
      return text.replace(regex, (match) => {
        // Preserve the case pattern of the matched text
        if (match === match.toUpperCase() && match.length > 1) {
          // All caps -> make replacement all caps
          return replaceTerm.toUpperCase();
        } else if (match[0] === match[0].toUpperCase()) {
          // First letter capitalized -> capitalize replacement
          return replaceTerm.charAt(0).toUpperCase() + replaceTerm.slice(1);
        } else {
          // Lowercase -> use replacement as-is
          return replaceTerm;
        }
      });
    };

    const newPageName = replaceWithCasePreservation(pageName);
    const newContent = replaceWithCasePreservation(content);
    const newSummary = replaceWithCasePreservation(summary);

    // Update wiki page
    const now = new Date().toISOString();
    const updateQuery = `UPDATE wiki_pages SET page_name = ?, content = ?, summary = ?, updated_at = ? WHERE id = ?`;

    if (this.isNative) {
      await this.db.run(updateQuery, [newPageName, newContent, newSummary, now, wikiPageId]);
    } else {
      this.db.run(updateQuery, [newPageName, newContent, newSummary, now, wikiPageId]);
      this.requestPersistence();
    }
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

  async close() {
    if (this.isNative && this.db) {
      await this.db.close();
    } else {
      await this.flushPersistence();
    }
  }
}

export const db = new AppDatabase();
