import type { ImageAsset } from '@/lib/database'
import type { DatabaseImportData } from '@/lib/databaseImportExport'
import { IMAGE_CONTENT_HASH_ALGORITHM } from '@/lib/imageContentHash'
import { createLogicalDatabaseDump, type LogicalRow } from './logicalDump'
import type { CanonicalLibraryModel } from './model'
import { canonicalLibraryModelSchema } from './schemas'
import { sha256Hex } from './semanticHash'

export type AssetByteReader = (asset: ImageAsset) => Promise<Uint8Array>

export interface CanonicalSnapshotOptions {
  readAssetBytes?: AssetByteReader
  contentMode?: 'full' | 'text-only'
  /** Keep full-library entities while omitting already-fingerprinted local image bytes. */
  retainAssetBytes?: boolean
  /** Omit for a full-library snapshot; provide one or more exact book IDs for a selection. */
  bookIds?: readonly string[]
}

function stringValue(row: LogicalRow, key: string, fallback = ''): string {
  const value = row[key]
  return typeof value === 'string' ? value : fallback
}

function nullableString(row: LogicalRow, key: string): string | null {
  return typeof row[key] === 'string' ? row[key] as string : null
}

function numberValue(row: LogicalRow, key: string): number {
  return Number(row[key] ?? 0)
}

function booleanValue(row: LogicalRow, key: string): boolean {
  return Boolean(row[key])
}

function arrayField(row: LogicalRow, key: string, label = key): unknown[] {
  const value = row[key]
  if (value === null || value === undefined) return []
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error(`Database field ${label} does not contain a valid JSON array.`)
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Database field ${label} must contain an array.`)
  }
  return parsed
}

function stringArray(row: LogicalRow, key: string, label = key): string[] {
  const parsed = arrayField(row, key, label)
  if (parsed.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Database field ${label} must contain only strings.`)
  }
  return [...parsed] as string[]
}

/** Older summaries stored character entries as `{ name }` objects. */
function summaryCharacters(
  row: LogicalRow,
  table: 'chapter_summaries' | 'part_summaries',
): string[] {
  const recordId = stringValue(row, 'id', '(unknown id)')
  const label = `${table}.characters for record ${recordId}`
  return arrayField(row, 'characters', label).map((entry) => {
    if (typeof entry === 'string') return entry
    if (
      entry !== null
      && typeof entry === 'object'
      && 'name' in entry
      && typeof entry.name === 'string'
    ) return entry.name
    throw new Error(
      `Database field ${label} must contain only strings or legacy character objects with a string name.`,
    )
  })
}

function groupRows(rows: LogicalRow[], key: string): Map<string, LogicalRow[]> {
  const grouped = new Map<string, LogicalRow[]>()
  for (const row of rows) {
    const value = stringValue(row, key)
    grouped.set(value, [...(grouped.get(value) ?? []), row])
  }
  return grouped
}

function rowId(row: LogicalRow, key = 'id'): string {
  return stringValue(row, key)
}

function rowsWithId(rows: LogicalRow[], ids: ReadonlySet<string>, key = 'id'): LogicalRow[] {
  return rows.filter((row) => ids.has(rowId(row, key)))
}

function scopeSelectionTables(
  tables: ReturnType<typeof createLogicalDatabaseDump>['tables'],
  requestedBookIds: readonly string[],
): ReturnType<typeof createLogicalDatabaseDump>['tables'] {
  if (requestedBookIds.length === 0) throw new Error('Select at least one book to export.')
  const bookIds = new Set(requestedBookIds)
  if (bookIds.size !== requestedBookIds.length) {
    throw new Error('Selected book IDs must not contain duplicates.')
  }
  const availableBookIds = new Set(tables.books.map((row) => rowId(row)))
  const missingBookIds = [...bookIds].filter((id) => !availableBookIds.has(id)).sort()
  if (missingBookIds.length) {
    throw new Error(`Selected books are no longer available: ${missingBookIds.join(', ')}.`)
  }

  const books = tables.books.filter((row) => bookIds.has(rowId(row)))
  const chapters = tables.chapters.filter((row) => bookIds.has(rowId(row, 'book_id')))
  const chapterIds = new Set(chapters.map((row) => rowId(row)))
  const bookParts = tables.book_parts.filter((row) => bookIds.has(rowId(row, 'book_id')))
  const partIds = new Set(bookParts.map((row) => rowId(row)))
  const wikiPages = tables.wiki_pages.filter((row) => bookIds.has(rowId(row, 'book_id')))
  const wikiPageIds = new Set(wikiPages.map((row) => rowId(row)))
  const imageAssets = tables.image_assets.filter((row) => bookIds.has(rowId(row, 'book_id')))
  const imageIds = new Set(imageAssets.map((row) => rowId(row)))
  const chapterReviews = tables.chapter_reviews.filter((row) => chapterIds.has(rowId(row, 'chapter_id')))
  const profileIds = new Set(chapterReviews.map((row) => rowId(row, 'profile_stable_id')).filter(Boolean))

  return {
    ...tables,
    books,
    chapters,
    book_parts: bookParts,
    chapter_revisions: tables.chapter_revisions.filter((row) => (
      bookIds.has(rowId(row, 'book_id')) && chapterIds.has(rowId(row, 'chapter_id'))
    )),
    chapter_activity: tables.chapter_activity.filter((row) => (
      bookIds.has(rowId(row, 'book_id')) && chapterIds.has(rowId(row, 'chapter_id'))
    )),
    chapter_summaries: rowsWithId(tables.chapter_summaries, chapterIds, 'chapter_id'),
    part_summaries: rowsWithId(tables.part_summaries, partIds, 'part_id'),
    wiki_pages: wikiPages,
    book_characters: tables.book_characters.filter((row) => bookIds.has(rowId(row, 'book_id'))),
    chapter_reviews: chapterReviews,
    custom_reviewer_profiles: rowsWithId(tables.custom_reviewer_profiles, profileIds, 'stable_id'),
    ai_profiles: rowsWithId(tables.ai_profiles, profileIds, 'stable_id'),
    wiki_updates: tables.wiki_updates.filter((row) => (
      wikiPageIds.has(rowId(row, 'wiki_page_id'))
      && (!rowId(row, 'chapter_id') || chapterIds.has(rowId(row, 'chapter_id')))
    )),
    chapter_wiki_mentions: tables.chapter_wiki_mentions.filter((row) => (
      chapterIds.has(rowId(row, 'chapter_id')) && wikiPageIds.has(rowId(row, 'wiki_page_id'))
    )),
    image_assets: imageAssets,
    image_wiki_tags: tables.image_wiki_tags.filter((row) => (
      imageIds.has(rowId(row, 'image_id')) && wikiPageIds.has(rowId(row, 'wiki_page_id'))
    )),
    chapter_notes: rowsWithId(tables.chapter_notes, chapterIds, 'chapter_id'),
    wiki_review_state: tables.wiki_review_state.filter((row) => (
      wikiPageIds.has(rowId(row, 'wiki_page_id')) && chapterIds.has(rowId(row, 'chapter_id'))
    )),
  }
}

/**
 * Legacy databases can contain more than one summary for the same parent.
 * Choose the same logical current row as the metadata repository so a backup
 * remains deterministic without mutating the user's live database.
 */
function selectCurrentRows(rows: LogicalRow[], parentKey: string): LogicalRow[] {
  const selected = new Map<string, LogicalRow>()
  for (const row of rows) {
    const parentId = stringValue(row, parentKey)
    const current = selected.get(parentId)
    if (!current || compareSummaryRecency(row, current) > 0) selected.set(parentId, row)
  }
  return [...selected.values()]
}

function compareSummaryRecency(left: LogicalRow, right: LogicalRow): number {
  return stringValue(left, 'updated_at').localeCompare(stringValue(right, 'updated_at'))
    || stringValue(left, 'created_at').localeCompare(stringValue(right, 'created_at'))
    || stringValue(left, 'id').localeCompare(stringValue(right, 'id'))
}

function toImageAsset(row: LogicalRow): ImageAsset {
  return {
    id: stringValue(row, 'id'),
    book_id: stringValue(row, 'book_id'),
    chapter_id: nullableString(row, 'chapter_id'),
    asset_type: stringValue(row, 'asset_type') as ImageAsset['asset_type'],
    file_name: stringValue(row, 'file_name'),
    file_path: stringValue(row, 'file_path'),
    mime_type: nullableString(row, 'mime_type'),
    image_data: nullableString(row, 'image_data'),
    notes: stringValue(row, 'notes'),
    created_at: stringValue(row, 'created_at'),
    updated_at: stringValue(row, 'updated_at'),
  }
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  const match = dataUrl.match(/^data:[^;,]*;base64,(.+)$/)
  if (!match) throw new Error('Image backup contains an invalid data URL.')
  const binary = atob(match[1])
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function readAssetBytes(row: LogicalRow, reader?: AssetByteReader): Promise<Uint8Array> {
  const asset = toImageAsset(row)
  if (reader) return reader(asset)
  if (asset.image_data) return decodeDataUrl(asset.image_data)
  throw new Error(`Image ${asset.id} is missing required bytes.`)
}

/** Convert a named database export into the transport-independent canonical model. */
export async function createCanonicalLibrarySnapshot(
  data: DatabaseImportData,
  options: CanonicalSnapshotOptions = {},
): Promise<CanonicalLibraryModel> {
  const logicalDump = createLogicalDatabaseDump(data)
  const tables = options.bookIds === undefined
    ? logicalDump.tables
    : scopeSelectionTables(logicalDump.tables, options.bookIds)
  const mentionsByChapter = groupRows(tables.chapter_wiki_mentions, 'chapter_id')
  const tagsByImage = groupRows(tables.image_wiki_tags, 'image_id')
  const chapterSummaries = selectCurrentRows(tables.chapter_summaries, 'chapter_id')
  const partSummaries = selectCurrentRows(tables.part_summaries, 'part_id')
  const contentMode = options.contentMode ?? 'full'
  const retainAssetBytes = options.retainAssetBytes ?? contentMode === 'full'

  const assets = await Promise.all(tables.image_assets.map(async (row) => {
    const storedHash = nullableString(row, 'content_hash')
    const storedAlgorithm = nullableString(row, 'content_hash_algorithm')
    const storedByteLength = row.content_byte_length
    const hasStoredIntegrity = (storedAlgorithm === IMAGE_CONTENT_HASH_ALGORITHM || storedAlgorithm === 'sha256')
      && Boolean(storedHash?.match(/^[a-f0-9]{64}$/))
      && typeof storedByteLength === 'number'
      && Number.isInteger(storedByteLength)
      && storedByteLength >= 0
    const loadedBytes = retainAssetBytes || !hasStoredIntegrity
      ? await readAssetBytes(row, options.readAssetBytes)
      : null
    return {
      id: stringValue(row, 'id'),
      book_id: stringValue(row, 'book_id'),
      chapter_id: nullableString(row, 'chapter_id'),
      asset_type: stringValue(row, 'asset_type') as 'cover' | 'chapter' | 'part_cover',
      file_name: stringValue(row, 'file_name'),
      mime_type: nullableString(row, 'mime_type'),
      notes: stringValue(row, 'notes'),
      wiki_page_ids: (tagsByImage.get(stringValue(row, 'id')) ?? [])
        .map((tag) => stringValue(tag, 'wiki_page_id')).sort(),
      created_at: stringValue(row, 'created_at'),
      updated_at: stringValue(row, 'updated_at'),
      sha256: loadedBytes ? await sha256Hex(loadedBytes) : storedHash as string,
      byte_length: loadedBytes ? loadedBytes.byteLength : storedByteLength as number,
      bytes: retainAssetBytes ? loadedBytes : null,
    }
  }))

  const model: CanonicalLibraryModel = {
    format_version: 1,
    bundle_kind: options.bookIds === undefined ? 'library' : 'selection',
    content_mode: contentMode,
    book_ids: tables.books.map((row) => stringValue(row, 'id')).sort(),
    includes: contentMode === 'full'
      ? { image_bytes: true, history: true, audit_records: true }
      : { image_bytes: false, history: false, audit_records: false },
    books: tables.books.map((row) => ({
      id: stringValue(row, 'id'), title: stringValue(row, 'title'),
      chapter_order: stringArray(row, 'chapter_order'), part_order: stringArray(row, 'part_order'),
      cover_image_id: nullableString(row, 'cover_image_id'),
      created_at: stringValue(row, 'created_at'), updated_at: stringValue(row, 'updated_at'),
    })),
    parts: tables.book_parts.map((row) => ({
      id: stringValue(row, 'id'), book_id: stringValue(row, 'book_id'), name: stringValue(row, 'name'),
      cover_image_id: nullableString(row, 'cover_image_id'),
      created_at: stringValue(row, 'created_at'), updated_at: stringValue(row, 'updated_at'),
    })),
    chapters: tables.chapters.map((row) => ({
      id: stringValue(row, 'id'), book_id: stringValue(row, 'book_id'),
      part_id: nullableString(row, 'part_id'), title: nullableString(row, 'title'),
      body: stringValue(row, 'text'), cover_image_id: nullableString(row, 'cover_image_id'),
      created_at: stringValue(row, 'created_at'), updated_at: stringValue(row, 'updated_at'),
      wiki_mentions: (mentionsByChapter.get(stringValue(row, 'id')) ?? []).map((mention) => ({
        id: stringValue(mention, 'id'), wiki_page_id: stringValue(mention, 'wiki_page_id'),
        source: nullableString(mention, 'link_source') as 'ai_summary' | 'manual' | null,
        created_at: stringValue(mention, 'created_at'), updated_at: nullableString(mention, 'updated_at'),
      })),
    })),
    chapter_notes: tables.chapter_notes.map((row) => ({
      id: stringValue(row, 'id'), chapter_id: stringValue(row, 'chapter_id'),
      body: stringValue(row, 'notes'), created_at: stringValue(row, 'created_at'),
      updated_at: stringValue(row, 'updated_at'),
    })),
    chapter_summaries: chapterSummaries.map((row) => ({
      id: stringValue(row, 'id'), chapter_id: stringValue(row, 'chapter_id'),
      body: nullableString(row, 'summary'), pov: nullableString(row, 'pov'),
      characters: summaryCharacters(row, 'chapter_summaries'), beats: stringArray(row, 'beats'),
      spoilers_ok: row.spoilers_ok === null ? null : booleanValue(row, 'spoilers_ok'),
      generated_by: nullableString(row, 'generated_by') as 'ai' | 'user' | null,
      model: nullableString(row, 'model'), created_at: stringValue(row, 'created_at'),
      updated_at: stringValue(row, 'updated_at'),
    })),
    part_summaries: partSummaries.map((row) => ({
      id: stringValue(row, 'id'), part_id: stringValue(row, 'part_id'),
      body: nullableString(row, 'summary'), characters: summaryCharacters(row, 'part_summaries'),
      beats: stringArray(row, 'beats'),
      generated_by: nullableString(row, 'generated_by') as 'ai' | 'user' | null,
      model: nullableString(row, 'model'), created_at: stringValue(row, 'created_at'),
      updated_at: stringValue(row, 'updated_at'),
    })),
    reviews: tables.chapter_reviews.map((row) => ({
      id: stringValue(row, 'id'), chapter_id: stringValue(row, 'chapter_id'),
      body: stringValue(row, 'review_text'), prompt_used: nullableString(row, 'prompt_used'),
      profile_ref: nullableString(row, 'profile_stable_id'), profile_name: nullableString(row, 'profile_name'),
      tone_key: nullableString(row, 'tone_key'), created_at: stringValue(row, 'created_at'),
      updated_at: stringValue(row, 'updated_at'),
    })),
    wiki_pages: tables.wiki_pages.map((row) => ({
      id: stringValue(row, 'id'), book_id: stringValue(row, 'book_id'),
      page_name: stringValue(row, 'page_name'),
      page_type: stringValue(row, 'page_type') as 'character' | 'location' | 'concept' | 'other',
      body: stringValue(row, 'content'), summary: stringValue(row, 'summary'),
      aliases: stringArray(row, 'aliases'), tags: stringArray(row, 'tags'),
      is_major: booleanValue(row, 'is_major'), created_by_ai: booleanValue(row, 'created_by_ai'),
      is_pinned: booleanValue(row, 'is_pinned'), cover_image_id: nullableString(row, 'cover_image_id'),
      created_at: stringValue(row, 'created_at'), updated_at: stringValue(row, 'updated_at'),
    })),
    book_characters: tables.book_characters.map((row) => ({
      id: stringValue(row, 'id'), book_id: stringValue(row, 'book_id'),
      character_name: stringValue(row, 'character_name'), wiki_page_id: nullableString(row, 'wiki_page_id'),
      created_at: stringValue(row, 'created_at'), updated_at: stringValue(row, 'updated_at'),
    })),
    profiles: [
      ...tables.custom_reviewer_profiles.map((row) => ({
        id: stringValue(row, 'stable_id'), profile_kind: 'custom' as const,
        legacy_id: numberValue(row, 'id'), name: stringValue(row, 'name'),
        description: nullableString(row, 'description'), tone_key: null, system_prompt: null,
        is_default: false, created_at: stringValue(row, 'created_at'),
        updated_at: stringValue(row, 'updated_at'),
      })),
      ...tables.ai_profiles.map((row) => ({
        id: stringValue(row, 'stable_id'),
        profile_kind: booleanValue(row, 'is_system') ? 'system' as const : 'ai' as const,
        legacy_id: numberValue(row, 'id'), name: stringValue(row, 'name'), description: null,
        tone_key: nullableString(row, 'tone_key'), system_prompt: nullableString(row, 'system_prompt'),
        is_default: booleanValue(row, 'is_default'), created_at: stringValue(row, 'created_at'),
        updated_at: stringValue(row, 'updated_at'),
      })),
    ],
    assets,
    chapter_revisions: contentMode === 'text-only' ? [] : tables.chapter_revisions.map((row) => ({
      id: stringValue(row, 'id'), chapter_id: stringValue(row, 'chapter_id'),
      book_id: stringValue(row, 'book_id'), title: nullableString(row, 'title'),
      text: stringValue(row, 'text'), word_count: numberValue(row, 'word_count'),
      words_added: numberValue(row, 'words_added'), words_removed: numberValue(row, 'words_removed'),
      revision_kind: stringValue(row, 'revision_kind') as 'save' | 'baseline',
      created_at: stringValue(row, 'created_at'), discarded_at: nullableString(row, 'discarded_at'),
    })),
    chapter_activity: contentMode === 'text-only' ? [] : tables.chapter_activity.map((row) => ({
      id: stringValue(row, 'id'), book_id: stringValue(row, 'book_id'),
      chapter_id: stringValue(row, 'chapter_id'), chapter_title: nullableString(row, 'chapter_title'),
      activity_type: stringValue(row, 'activity_type') as 'save' | 'delete',
      words_added: numberValue(row, 'words_added'), words_removed: numberValue(row, 'words_removed'),
      word_count_deleted: numberValue(row, 'word_count_deleted'),
      revision_discarded: booleanValue(row, 'revision_discarded'),
      created_at: stringValue(row, 'created_at'),
    })),
    wiki_updates: contentMode === 'text-only' ? [] : tables.wiki_updates.map((row) => ({
      id: stringValue(row, 'id'), wiki_page_id: stringValue(row, 'wiki_page_id'),
      chapter_id: nullableString(row, 'chapter_id'), update_type: nullableString(row, 'update_type'),
      change_summary: nullableString(row, 'change_summary'),
      contradiction_notes: nullableString(row, 'contradiction_notes'),
      created_at: stringValue(row, 'created_at'),
    })),
    wiki_review_state: contentMode === 'text-only' ? [] : tables.wiki_review_state.map((row) => ({
      wiki_page_id: stringValue(row, 'wiki_page_id'), chapter_id: stringValue(row, 'chapter_id'),
      chapter_content_sha256: stringValue(row, 'chapter_content_sha256'),
      reviewed_at: stringValue(row, 'reviewed_at'), reviewed_by: stringValue(row, 'reviewed_by'),
    })),
  }

  return canonicalLibraryModelSchema.parse(model)
}
