import type { DatabaseImportData, ImportRow } from '@/lib/databaseImportExport'

export const LOGICAL_DATABASE_DUMP_VERSION = 1 as const

export const LOGICAL_TABLE_COLUMNS = {
  books: ['id', 'title', 'chapter_order', 'part_order', 'cover_image_id', 'created_at', 'updated_at'],
  chapters: ['id', 'book_id', 'part_id', 'title', 'text', 'word_count', 'cover_image_id', 'created_at', 'updated_at'],
  chapter_revisions: ['id', 'chapter_id', 'book_id', 'title', 'text', 'word_count', 'words_added', 'words_removed', 'revision_kind', 'created_at', 'discarded_at'],
  chapter_activity: ['id', 'book_id', 'chapter_id', 'chapter_title', 'activity_type', 'words_added', 'words_removed', 'word_count_deleted', 'revision_discarded', 'created_at'],
  book_parts: ['id', 'book_id', 'name', 'chapter_order', 'cover_image_id', 'created_at', 'updated_at'],
  chapter_summaries: ['id', 'chapter_id', 'summary', 'pov', 'characters', 'beats', 'spoilers_ok', 'created_at', 'updated_at', 'generated_by', 'model'],
  part_summaries: ['id', 'part_id', 'summary', 'characters', 'beats', 'created_at', 'updated_at', 'generated_by', 'model'],
  wiki_pages: ['id', 'book_id', 'page_name', 'page_type', 'content', 'summary', 'aliases', 'tags', 'is_major', 'created_by_ai', 'created_at', 'updated_at', 'is_pinned', 'cover_image_id'],
  book_characters: ['id', 'book_id', 'character_name', 'wiki_page_id', 'created_at', 'updated_at'],
  chapter_reviews: ['id', 'chapter_id', 'review_text', 'prompt_used', 'profile_id', 'profile_name', 'tone_key', 'created_at', 'updated_at', 'profile_stable_id'],
  custom_reviewer_profiles: ['id', 'name', 'description', 'created_at', 'updated_at', 'stable_id'],
  ai_profiles: ['id', 'name', 'tone_key', 'system_prompt', 'is_system', 'is_default', 'created_at', 'stable_id', 'updated_at'],
  wiki_updates: ['id', 'wiki_page_id', 'chapter_id', 'update_type', 'change_summary', 'contradiction_notes', 'created_at'],
  chapter_wiki_mentions: ['id', 'chapter_id', 'wiki_page_id', 'link_source', 'created_at', 'updated_at'],
  image_assets: ['id', 'book_id', 'chapter_id', 'asset_type', 'file_name', 'file_path', 'mime_type', 'image_data', 'notes', 'created_at', 'updated_at'],
  image_wiki_tags: ['image_id', 'wiki_page_id', 'created_at'],
  chapter_notes: ['id', 'chapter_id', 'notes', 'created_at', 'updated_at'],
  wiki_review_state: ['wiki_page_id', 'chapter_id', 'chapter_content_sha256', 'reviewed_at', 'reviewed_by'],
} as const satisfies Record<keyof Omit<DatabaseImportData, 'version'>, readonly string[]>

export type LogicalTableName = keyof typeof LOGICAL_TABLE_COLUMNS
export type LogicalRow = Record<string, unknown>

export interface LogicalDatabaseDump {
  logical_dump_version: typeof LOGICAL_DATABASE_DUMP_VERSION
  tables: Record<LogicalTableName, LogicalRow[]>
}

const BOOLEAN_COLUMNS: Partial<Record<LogicalTableName, ReadonlySet<string>>> = {
  chapter_activity: new Set(['revision_discarded']),
  chapter_summaries: new Set(['spoilers_ok']),
  wiki_pages: new Set(['is_major', 'created_by_ai', 'is_pinned']),
  ai_profiles: new Set(['is_system', 'is_default']),
}

const JSON_ARRAY_COLUMNS: Partial<Record<LogicalTableName, ReadonlySet<string>>> = {
  books: new Set(['chapter_order', 'part_order']),
  book_parts: new Set(['chapter_order']),
  chapter_summaries: new Set(['characters', 'beats']),
  part_summaries: new Set(['characters', 'beats']),
  wiki_pages: new Set(['aliases', 'tags']),
}

const TIMESTAMP_COLUMNS = new Set([
  'created_at', 'updated_at', 'discarded_at', 'reviewed_at',
])

function normalizeTimestamp(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const explicitlyZoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
  const parseableValue = explicitlyZoned ? value : `${value.replace(' ', 'T')}Z`
  const timestamp = Date.parse(parseableValue)
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString()
}

function normalizeValue(table: LogicalTableName, column: string, value: unknown): unknown {
  if (value === undefined) return null
  if (value === null) return null
  if (BOOLEAN_COLUMNS[table]?.has(column)) return Boolean(value)
  if (JSON_ARRAY_COLUMNS[table]?.has(column) && typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : value
    } catch {
      return value
    }
  }
  if (TIMESTAMP_COLUMNS.has(column)) return normalizeTimestamp(value)
  return value
}

function normalizeRow(table: LogicalTableName, row: ImportRow): LogicalRow {
  const columns = LOGICAL_TABLE_COLUMNS[table]
  return Object.fromEntries(columns.map((column, index) => {
    const value = Array.isArray(row) ? row[index] : row[column]
    return [column, normalizeValue(table, column, value)]
  }))
}

function rowSortKey(row: LogicalRow): string {
  return ['id', 'wiki_page_id', 'chapter_id', 'image_id']
    .map((key) => String(row[key] ?? ''))
    .join('\u0000')
}

/**
 * Convert either database backend's export shape into a deterministic logical
 * dump. This is the comparison oracle for migrations and future bundle
 * round-trip tests; it intentionally ignores SQL row order and backend boolean
 * or timestamp representation differences.
 */
export function createLogicalDatabaseDump(data: DatabaseImportData): LogicalDatabaseDump {
  const entries = (Object.keys(LOGICAL_TABLE_COLUMNS) as LogicalTableName[]).map((table) => {
    const rows = data[table].map((row) => normalizeRow(table, row))
    rows.sort((left, right) => rowSortKey(left).localeCompare(rowSortKey(right)))
    return [table, rows] as const
  })

  return {
    logical_dump_version: LOGICAL_DATABASE_DUMP_VERSION,
    tables: Object.fromEntries(entries) as Record<LogicalTableName, LogicalRow[]>,
  }
}
