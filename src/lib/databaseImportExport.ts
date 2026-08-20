export const DATABASE_EXPORT_VERSION = 6

export const IMAGE_ASSET_COLUMNS = [
  'id',
  'book_id',
  'chapter_id',
  'asset_type',
  'file_name',
  'file_path',
  'mime_type',
  'image_data',
  'notes',
  'created_at',
  'updated_at',
]

export const WIKI_PAGE_COLUMNS = [
  'id',
  'book_id',
  'page_name',
  'page_type',
  'content',
  'summary',
  'aliases',
  'tags',
  'is_major',
  'created_by_ai',
  'created_at',
  'updated_at',
  'is_pinned',
  'cover_image_id',
]

export type ImportRow = Record<string, unknown> | unknown[]

export interface DatabaseImportData {
  version: number
  books: ImportRow[]
  chapters: ImportRow[]
  chapter_revisions: ImportRow[]
  chapter_activity: ImportRow[]
  book_parts: ImportRow[]
  chapter_summaries: ImportRow[]
  part_summaries: ImportRow[]
  wiki_pages: ImportRow[]
  book_characters: ImportRow[]
  chapter_reviews: ImportRow[]
  custom_reviewer_profiles: ImportRow[]
  ai_profiles: ImportRow[]
  wiki_updates: ImportRow[]
  chapter_wiki_mentions: ImportRow[]
  image_assets: ImportRow[]
  image_wiki_tags: ImportRow[]
  chapter_notes: ImportRow[]
  wiki_review_state: ImportRow[]
}

interface CapacitorTableSchemaColumn {
  column?: string
}

interface CapacitorExportTable {
  name?: string
  schema?: CapacitorTableSchemaColumn[]
  values?: unknown[][]
}

export interface CapacitorExportShape {
  tables?: CapacitorExportTable[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readRows(
  source: Record<string, unknown>,
  key: keyof DatabaseImportData,
): ImportRow[] {
  const value = source[key]
  return Array.isArray(value)
    ? value.filter((row): row is ImportRow => isRecord(row) || Array.isArray(row))
    : []
}

export function convertCapacitorExport(exportData: CapacitorExportShape): DatabaseImportData {
  const tables = Array.isArray(exportData.tables) ? exportData.tables : []
  const schemaMap = new Map<string, string[]>()
  const valueMap = new Map<string, unknown[][]>()

  tables.forEach((table) => {
    const columns =
      Array.isArray(table.schema) && table.schema.length
        ? table.schema
            .map((col) => col?.column)
            .filter(
              (column): column is string =>
                Boolean(column && /^[A-Za-z_][A-Za-z0-9_]*$/.test(column)),
            )
        : []

    if (!table.name) return
    schemaMap.set(table.name, columns)
    valueMap.set(table.name, Array.isArray(table.values) ? table.values : [])
  })

  const rowsToObjects = (tableName: string): Record<string, unknown>[] => {
    const columns = schemaMap.get(tableName) ?? []
    const rows = valueMap.get(tableName) ?? []

    return rows.map((row) => {
      const entry: Record<string, unknown> = {}
      columns.forEach((column, index) => {
        entry[column] = row?.[index] ?? null
      })
      return entry
    })
  }

  return {
    version: DATABASE_EXPORT_VERSION,
    books: rowsToObjects('books'),
    chapters: rowsToObjects('chapters'),
    chapter_revisions: rowsToObjects('chapter_revisions'),
    chapter_activity: rowsToObjects('chapter_activity'),
    book_parts: rowsToObjects('book_parts'),
    chapter_summaries: rowsToObjects('chapter_summaries'),
    part_summaries: rowsToObjects('part_summaries'),
    wiki_pages: rowsToObjects('wiki_pages'),
    book_characters: rowsToObjects('book_characters'),
    chapter_reviews: rowsToObjects('chapter_reviews'),
    custom_reviewer_profiles: rowsToObjects('custom_reviewer_profiles'),
    ai_profiles: rowsToObjects('ai_profiles'),
    wiki_updates: rowsToObjects('wiki_updates'),
    chapter_wiki_mentions: rowsToObjects('chapter_wiki_mentions'),
    image_assets: rowsToObjects('image_assets'),
    image_wiki_tags: rowsToObjects('image_wiki_tags'),
    chapter_notes: rowsToObjects('chapter_notes'),
    wiki_review_state: rowsToObjects('wiki_review_state'),
  }
}

export function normalizeDatabaseImportData(raw: unknown): DatabaseImportData {
  if (isRecord(raw) && isRecord(raw.export) && Array.isArray(raw.export.tables)) {
    return convertCapacitorExport(raw.export as CapacitorExportShape)
  }

  if (isRecord(raw) && Array.isArray(raw.tables)) {
    return convertCapacitorExport(raw as CapacitorExportShape)
  }

  const normalized = isRecord(raw) ? raw : {}

  return {
    version: typeof normalized.version === 'number' ? normalized.version : 4,
    books: readRows(normalized, 'books'),
    chapters: readRows(normalized, 'chapters'),
    chapter_revisions: readRows(normalized, 'chapter_revisions'),
    chapter_activity: readRows(normalized, 'chapter_activity'),
    book_parts: readRows(normalized, 'book_parts'),
    chapter_summaries: readRows(normalized, 'chapter_summaries'),
    part_summaries: readRows(normalized, 'part_summaries'),
    wiki_pages: readRows(normalized, 'wiki_pages'),
    book_characters: readRows(normalized, 'book_characters'),
    chapter_reviews: readRows(normalized, 'chapter_reviews'),
    custom_reviewer_profiles: readRows(normalized, 'custom_reviewer_profiles'),
    ai_profiles: readRows(normalized, 'ai_profiles'),
    wiki_updates: readRows(normalized, 'wiki_updates'),
    chapter_wiki_mentions: readRows(normalized, 'chapter_wiki_mentions'),
    image_assets: readRows(normalized, 'image_assets'),
    image_wiki_tags: readRows(normalized, 'image_wiki_tags'),
    chapter_notes: readRows(normalized, 'chapter_notes'),
    wiki_review_state: readRows(normalized, 'wiki_review_state'),
  }
}

/**
 * Parse an app database backup without turning arbitrary JSON into an empty
 * database. Normalization remains intentionally permissive for the legacy
 * Capacitor and Neon adapters, but destructive restore/import paths must call
 * this stricter entry point before clearing any live data.
 */
export function parseDatabaseImportData(raw: unknown): DatabaseImportData {
  if (!isRecord(raw) || Array.isArray(raw)) {
    throw new Error('Backup payload must be a JSON object.')
  }

  const capacitorTables: unknown[] | null = isRecord(raw.export) && Array.isArray(raw.export.tables)
    ? raw.export.tables
    : Array.isArray(raw.tables)
      ? raw.tables
      : null

  if (capacitorTables) {
    const tableNames = new Set(
      capacitorTables
        .filter(isRecord)
        .map((table) => table.name)
        .filter((name): name is string => typeof name === 'string'),
    )
    if (!tableNames.has('books') || !tableNames.has('chapters')) {
      throw new Error('Backup payload is missing the books or chapters table.')
    }
  } else {
    if (!Array.isArray(raw.books) || !Array.isArray(raw.chapters)) {
      throw new Error('Backup payload is missing the books or chapters collection.')
    }

    if (
      raw.version !== undefined
      && (!Number.isInteger(raw.version) || Number(raw.version) < 1)
    ) {
      throw new Error('Backup payload has an invalid database version.')
    }
    if (typeof raw.version === 'number' && raw.version > DATABASE_EXPORT_VERSION) {
      throw new Error(
        `Backup database version ${raw.version} is newer than supported version ${DATABASE_EXPORT_VERSION}.`,
      )
    }
  }

  return normalizeDatabaseImportData(raw)
}

export function normalizeImageAssetImportRows(rows: unknown[] | undefined) {
  if (!rows) return []

  return rows.map((row) => {
    if (!Array.isArray(row)) {
      const rowRecord = (row ?? {}) as Record<string, unknown>
      return {
        ...rowRecord,
        notes: rowRecord.notes ?? '',
      }
    }

    if (row.length === 10) {
      return {
        id: row[0],
        book_id: row[1],
        chapter_id: row[2],
        asset_type: row[3],
        file_name: row[4],
        file_path: row[5],
        mime_type: row[6],
        image_data: row[9] ?? null,
        notes: '',
        created_at: row[7],
        updated_at: row[8],
      }
    }

    return IMAGE_ASSET_COLUMNS.reduce((entry, column, index) => {
      entry[column] = row[index] ?? null
      return entry
    }, {} as Record<string, unknown>)
  })
}
