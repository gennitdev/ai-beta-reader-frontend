/**
 * Repository for full-database export and import (local backup/restore and the
 * one-off Neon migration).
 *
 * Follows the split pattern — every function takes a {@link DatabaseContext}.
 * Import brackets its work with `ctx.setImporting(true/false)` so the hundreds
 * of intermediate row writes don't each trigger a snapshot; a single flush
 * happens at the end.
 */

import { logger } from '@/lib/logger'
import {
  DATABASE_EXPORT_VERSION,
  IMAGE_ASSET_COLUMNS,
  WIKI_PAGE_COLUMNS,
  normalizeDatabaseImportData,
  normalizeImageAssetImportRows,
  type DatabaseImportData,
  type ImportRow,
} from '@/lib/databaseImportExport'
import type { DatabaseContext } from './connection'
import * as chapterRepo from './chapterRepository'
import type { Book, Chapter } from '../database'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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
    }
  }

  return {
    id: String(row.id),
    title: String(row.title),
    chapter_order: typeof row.chapter_order === 'string' ? row.chapter_order : '[]',
    part_order: typeof row.part_order === 'string' ? row.part_order : '[]',
    cover_image_id: typeof row.cover_image_id === 'string' ? row.cover_image_id : null,
    created_at: String(row.created_at),
  }
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
    }
  }

  return {
    id: String(row.id),
    book_id: String(row.book_id),
    part_id: typeof row.part_id === 'string' ? row.part_id : null,
    title: typeof row.title === 'string' ? row.title : undefined,
    text: String(row.text ?? ''),
    word_count: Number(row.word_count ?? 0),
    created_at: String(row.created_at),
  }
}

/** Ordered column names for a table (used to map positional import rows). */
async function getTableColumns(ctx: DatabaseContext, tableName: string): Promise<string[]> {
  if (ctx.isNative) {
    const result = await ctx.connection.query(`PRAGMA table_info(${tableName})`)
    const rows = result?.values ?? []
    return rows
      .map((row: unknown) => {
        if (isRecord(row) && typeof row.name === 'string') return row.name
        if (Array.isArray(row)) return typeof row[1] === 'string' ? row[1] : null
        return null
      })
      .filter((name: unknown): name is string => typeof name === 'string')
  }

  const result = ctx.connection.exec(`PRAGMA table_info(${tableName})`)
  if (result.length > 0) {
    const nameIndex = result[0].columns.indexOf('name')
    return result[0].values
      .map((row: unknown[]) => row[nameIndex])
      .filter((name: unknown): name is string => typeof name === 'string')
  }
  return []
}

export async function exportDatabase(ctx: DatabaseContext): Promise<Uint8Array> {
  await ctx.flushPersistence()

  if (ctx.isNative) {
    const jsonExport = await ctx.connection.exportToJson('full')
    const normalized = normalizeDatabaseImportData(jsonExport)
    return new TextEncoder().encode(JSON.stringify(normalized))
  } else {
    // Export all tables as JSON
    const books = await chapterRepo.getBooks(ctx)
    const allChapters: Chapter[] = []

    for (const book of books) {
      const chapters = await chapterRepo.getChapters(ctx, book.id)
      allChapters.push(...chapters)
    }

    // Get all data from other tables
    const getAllFromTable = (tableName: string) => {
      const result = ctx.connection.exec(`SELECT * FROM ${tableName}`)
      return result.length > 0 ? result[0].values : []
    }
    const getAllObjectsFromTable = (tableName: string, columns: string[]) => {
      const result = ctx.connection.exec(`SELECT ${columns.join(', ')} FROM ${tableName}`)
      if (result.length === 0) return []

      return result[0].values.map((row: unknown[]) =>
        columns.reduce((entry, column, index) => {
          entry[column] = row[index] ?? null
          return entry
        }, {} as Record<string, unknown>),
      )
    }

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
      chapter_notes: getAllFromTable('chapter_notes'),
    }

    return new TextEncoder().encode(JSON.stringify(exportData))
  }
}

export async function importDatabase(ctx: DatabaseContext, data: Uint8Array): Promise<void> {
  const jsonString = new TextDecoder().decode(data)
  const importData = normalizeDatabaseImportData(JSON.parse(jsonString))
  logger.log('[Database] importDatabase: image_assets count:', importData.image_assets?.length || 0)
  if (importData.image_assets?.length > 0) {
    logger.log('[Database] importDatabase: First image_asset:', importData.image_assets[0])
    // image_data is at index 9 for arrays (added via ALTER TABLE)
    const hasImageData = importData.image_assets.some((row) => Array.isArray(row) ? row[9] : row.image_data)
    logger.log('[Database] importDatabase: Any have image_data?', hasImageData)
  }

  const run = async (sql: string, params: unknown[] = []) => {
    if (ctx.isNative) {
      await ctx.connection.run(sql, params)
    } else {
      ctx.connection.run(sql, params)
    }
  }

  // Skip intermediate saves during bulk import (saves 170MB+ being written hundreds of times)
  ctx.setImporting(true)

  try {
    // Disable foreign key constraints during import
    // Use execute() on native platforms for PRAGMA commands
    if (ctx.isNative) {
      await ctx.connection.execute('PRAGMA foreign_keys = OFF')
    } else {
      ctx.connection.run('PRAGMA foreign_keys = OFF')
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
      'image_assets',
    ]

    for (const table of tablesToClear) {
      await run(`DELETE FROM ${table}`)
    }

    const importTable = async (tableName: string, rows: ImportRow[]) => {
      if (!rows || rows.length === 0) return

      const expectedColumns = await getTableColumns(ctx, tableName)
      if (!expectedColumns.length) return

      const placeholders = expectedColumns.map(() => '?').join(', ')
      const columnList = expectedColumns.map((col) => `"${col}"`).join(', ')
      const insertSql = `INSERT OR REPLACE INTO ${tableName} (${columnList}) VALUES (${placeholders})`

      for (const row of rows) {
        const rowValues: Record<string, unknown> = Array.isArray(row)
          ? expectedColumns.reduce((acc, column, index) => {
              acc[column] = row[index] ?? null
              return acc
            }, {} as Record<string, unknown>)
          : row ?? {}

        const values = expectedColumns.map((column) => rowValues[column] ?? null)
        await run(insertSql, values)
      }
    }

    if (importData.books) {
      for (const book of importData.books) {
        await chapterRepo.saveBook(ctx, toImportedBook(book))
      }
    }

    await importTable('book_parts', importData.book_parts)

    if (importData.chapters) {
      for (const chapter of importData.chapters) {
        await chapterRepo.saveChapter(ctx, toImportedChapter(chapter), { createRevision: false })
      }
    }

    await importTable('chapter_revisions', importData.chapter_revisions)
    await importTable('chapter_activity', importData.chapter_activity)
    await run(`INSERT OR IGNORE INTO chapter_activity
      (id, book_id, chapter_id, chapter_title, activity_type, words_added, words_removed, word_count_deleted, created_at)
      SELECT id, book_id, chapter_id, title, 'save', words_added, words_removed, 0, created_at
      FROM chapter_revisions WHERE revision_kind = 'save'`)

    await importTable('wiki_pages', importData.wiki_pages)
    await importTable('custom_reviewer_profiles', importData.custom_reviewer_profiles)
    await importTable('ai_profiles', importData.ai_profiles)
    await importTable('chapter_summaries', importData.chapter_summaries)
    await importTable('part_summaries', importData.part_summaries)
    await importTable('chapter_reviews', importData.chapter_reviews)
    await importTable('book_characters', importData.book_characters)
    await importTable('wiki_updates', importData.wiki_updates)
    await importTable('chapter_wiki_mentions', importData.chapter_wiki_mentions)
    await importTable('image_assets', normalizeImageAssetImportRows(importData.image_assets))
    await importTable('image_wiki_tags', importData.image_wiki_tags)
    await importTable('chapter_notes', importData.chapter_notes)

    // Re-enable foreign key constraints after import
    // Use execute() on native platforms for PRAGMA commands
    if (ctx.isNative) {
      await ctx.connection.execute('PRAGMA foreign_keys = ON')
    } else {
      ctx.connection.run('PRAGMA foreign_keys = ON')
    }
  } finally {
    ctx.setImporting(false)
  }

  // Save once at the end after all imports are complete
  if (!ctx.isNative) {
    logger.log('[Database] importDatabase: Saving to IndexedDB...')
    ctx.requestPersistence()
    await ctx.flushPersistence()
    logger.log('[Database] importDatabase: Save complete')
  }
}

export async function importFromNeonExport(ctx: DatabaseContext, jsonData: unknown): Promise<void> {
  // Transform Neon PostgreSQL export to match our schema
  // Neon exports tables as arrays of objects with column names
  const sourceData = isRecord(jsonData) ? jsonData : {}
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
    chapter_notes: [],
  }

  // Map Neon table exports to our format
  if (Array.isArray(sourceData.books)) {
    transformedData.books = sourceData.books.filter(isRecord).map((b) => ({
      id: b.id,
      title: b.title,
      created_at: b.created_at,
    }))
  }

  if (Array.isArray(sourceData.chapters)) {
    transformedData.chapters = sourceData.chapters.filter(isRecord).map((c) => ({
      id: c.id,
      book_id: c.book_id,
      title: c.title,
      text: c.text,
      word_count: c.word_count,
      created_at: c.created_at,
    }))
  }

  // Just pass through other tables as-is
  transformedData.book_parts = Array.isArray(sourceData.book_parts) ? sourceData.book_parts.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : []
  transformedData.chapter_summaries = Array.isArray(sourceData.chapter_summaries) ? sourceData.chapter_summaries.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : []
  transformedData.part_summaries = Array.isArray(sourceData.part_summaries) ? sourceData.part_summaries.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : []
  transformedData.wiki_pages = Array.isArray(sourceData.wiki_pages) ? sourceData.wiki_pages.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : []
  transformedData.book_characters = Array.isArray(sourceData.book_characters) ? sourceData.book_characters.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : []
  transformedData.chapter_reviews = Array.isArray(sourceData.chapter_reviews) ? sourceData.chapter_reviews.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : []
  transformedData.custom_reviewer_profiles = Array.isArray(sourceData.custom_reviewer_profiles) ? sourceData.custom_reviewer_profiles.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : []
  transformedData.ai_profiles = Array.isArray(sourceData.ai_profiles) ? sourceData.ai_profiles.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : []
  transformedData.wiki_updates = Array.isArray(sourceData.wiki_updates) ? sourceData.wiki_updates.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : []
  transformedData.chapter_wiki_mentions = Array.isArray(sourceData.chapter_wiki_mentions) ? sourceData.chapter_wiki_mentions.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : []
  transformedData.image_assets = Array.isArray(sourceData.image_assets) ? sourceData.image_assets.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : []
  transformedData.image_wiki_tags = Array.isArray(sourceData.image_wiki_tags) ? sourceData.image_wiki_tags.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : []
  transformedData.chapter_notes = Array.isArray(sourceData.chapter_notes) ? sourceData.chapter_notes.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row)) : []

  // Use the standard import function
  const jsonString = JSON.stringify(transformedData)
  await importDatabase(ctx, new TextEncoder().encode(jsonString))
}
