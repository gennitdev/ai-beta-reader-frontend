import type {
  BookDeletionPreview,
  BookDeletionResult,
  PendingImageDeletion,
} from '../database'
import type { DatabaseContext, QueryRow } from './connection'
import { runInTransaction } from './transaction'

function readRowValue(row: QueryRow | unknown[], index: number, key: string): unknown {
  return Array.isArray(row) ? row[index] : row[key]
}

function previewFromRow(row: QueryRow | unknown[]): BookDeletionPreview {
  return {
    bookId: String(readRowValue(row, 0, 'id')),
    title: String(readRowValue(row, 1, 'title')),
    chapterCount: Number(readRowValue(row, 2, 'chapter_count') ?? 0),
    partCount: Number(readRowValue(row, 3, 'part_count') ?? 0),
    wikiPageCount: Number(readRowValue(row, 4, 'wiki_page_count') ?? 0),
    imageCount: Number(readRowValue(row, 5, 'image_count') ?? 0),
  }
}

function pendingFromRow(row: QueryRow | unknown[]): PendingImageDeletion {
  return {
    imageId: String(readRowValue(row, 0, 'image_id')),
    filePath: String(readRowValue(row, 1, 'file_path') ?? ''),
    mimeType: typeof readRowValue(row, 2, 'mime_type') === 'string'
      ? String(readRowValue(row, 2, 'mime_type')) : null,
    createdAt: String(readRowValue(row, 3, 'created_at')),
    attemptCount: Number(readRowValue(row, 4, 'attempt_count') ?? 0),
    lastError: typeof readRowValue(row, 5, 'last_error') === 'string'
      ? String(readRowValue(row, 5, 'last_error')) : null,
  }
}

async function runStatement(
  ctx: DatabaseContext,
  query: string,
  params: unknown[],
): Promise<void> {
  if (ctx.isNative) await ctx.connection.run(query, params)
  else ctx.connection.run(query, params)
}

export async function getBookDeletionPreview(
  ctx: DatabaseContext,
  bookId: string,
): Promise<BookDeletionPreview | null> {
  const query = `SELECT b.id, b.title,
    (SELECT COUNT(*) FROM chapters WHERE book_id = b.id) AS chapter_count,
    (SELECT COUNT(*) FROM book_parts WHERE book_id = b.id) AS part_count,
    (SELECT COUNT(*) FROM wiki_pages WHERE book_id = b.id) AS wiki_page_count,
    (SELECT COUNT(*) FROM image_assets
      WHERE book_id = b.id OR chapter_id IN (SELECT id FROM chapters WHERE book_id = b.id)
    ) AS image_count
    FROM books b WHERE b.id = ? LIMIT 1`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [bookId])
    return result.values?.[0] ? previewFromRow(result.values[0]) : null
  }
  const result = ctx.connection.exec(query, [bookId])
  return result[0]?.values[0] ? previewFromRow(result[0].values[0]) : null
}

async function getBookPendingImages(
  ctx: DatabaseContext,
  bookId: string,
): Promise<PendingImageDeletion[]> {
  const query = `SELECT id AS image_id, file_path, mime_type, created_at, 0 AS attempt_count,
                        NULL AS last_error
                 FROM image_assets
                 WHERE book_id = ? OR chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)
                 ORDER BY created_at, id`
  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [bookId, bookId])
    return (result.values ?? []).map(pendingFromRow)
  }
  const result = ctx.connection.exec(query, [bookId, bookId])
  return result[0]?.values.map(pendingFromRow) ?? []
}

export async function deleteBook(ctx: DatabaseContext, bookId: string): Promise<BookDeletionResult> {
  let preview: BookDeletionPreview | null = null
  let pendingImages: PendingImageDeletion[] = []

  await runInTransaction(ctx, async (txCtx) => {
    preview = await getBookDeletionPreview(txCtx, bookId)
    if (!preview) throw new Error('Book not found')
    pendingImages = await getBookPendingImages(txCtx, bookId)

    for (const image of pendingImages) {
      await runStatement(txCtx, `INSERT INTO pending_image_deletions
        (image_id, file_path, mime_type, created_at, attempt_count, last_error)
        VALUES (?, ?, ?, ?, 0, NULL)
        ON CONFLICT(image_id) DO UPDATE SET
          file_path = excluded.file_path,
          mime_type = excluded.mime_type`, [
        image.imageId, image.filePath, image.mimeType, new Date().toISOString(),
      ])
    }

    const cleanup: Array<{ query: string; params: unknown[] }> = [
      {
        query: `DELETE FROM image_wiki_tags
                WHERE image_id IN (
                  SELECT id FROM image_assets
                  WHERE book_id = ? OR chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)
                ) OR wiki_page_id IN (SELECT id FROM wiki_pages WHERE book_id = ?)`,
        params: [bookId, bookId, bookId],
      },
      {
        query: `DELETE FROM wiki_review_state
                WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)
                   OR wiki_page_id IN (SELECT id FROM wiki_pages WHERE book_id = ?)`,
        params: [bookId, bookId],
      },
      {
        query: `DELETE FROM wiki_updates
                WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)
                   OR wiki_page_id IN (SELECT id FROM wiki_pages WHERE book_id = ?)`,
        params: [bookId, bookId],
      },
      {
        query: `DELETE FROM chapter_wiki_mentions
                WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)
                   OR wiki_page_id IN (SELECT id FROM wiki_pages WHERE book_id = ?)`,
        params: [bookId, bookId],
      },
      {
        query: `DELETE FROM book_characters
                WHERE book_id = ? OR wiki_page_id IN (SELECT id FROM wiki_pages WHERE book_id = ?)`,
        params: [bookId, bookId],
      },
      {
        query: `DELETE FROM chapter_summaries
                WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)`,
        params: [bookId],
      },
      {
        query: `DELETE FROM chapter_reviews
                WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)`,
        params: [bookId],
      },
      {
        query: `DELETE FROM chapter_notes
                WHERE chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)`,
        params: [bookId],
      },
      {
        query: `DELETE FROM chapter_revisions
                WHERE book_id = ? OR chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)`,
        params: [bookId, bookId],
      },
      {
        query: `DELETE FROM part_summaries
                WHERE part_id IN (SELECT id FROM book_parts WHERE book_id = ?)`,
        params: [bookId],
      },
      { query: `DELETE FROM chapter_activity WHERE book_id = ?`, params: [bookId] },
      {
        query: `DELETE FROM image_assets
                WHERE book_id = ? OR chapter_id IN (SELECT id FROM chapters WHERE book_id = ?)`,
        params: [bookId, bookId],
      },
      { query: `DELETE FROM chapters WHERE book_id = ?`, params: [bookId] },
      { query: `DELETE FROM wiki_pages WHERE book_id = ?`, params: [bookId] },
      { query: `DELETE FROM book_parts WHERE book_id = ?`, params: [bookId] },
      { query: `DELETE FROM books WHERE id = ?`, params: [bookId] },
    ]

    for (const statement of cleanup) {
      await runStatement(txCtx, statement.query, statement.params)
    }
  })

  if (!ctx.isNative) {
    ctx.requestPersistence()
    await ctx.flushPersistence()
  }
  return { preview: preview!, pendingImages }
}

export async function getPendingImageDeletions(ctx: DatabaseContext): Promise<PendingImageDeletion[]> {
  const query = `SELECT image_id, file_path, mime_type, created_at, attempt_count, last_error
                 FROM pending_image_deletions ORDER BY created_at, image_id`
  if (ctx.isNative) {
    const result = await ctx.connection.query(query)
    return (result.values ?? []).map(pendingFromRow)
  }
  const result = ctx.connection.exec(query)
  return result[0]?.values.map(pendingFromRow) ?? []
}

export async function completePendingImageDeletion(
  ctx: DatabaseContext,
  imageId: string,
): Promise<void> {
  await runStatement(ctx, `DELETE FROM pending_image_deletions WHERE image_id = ?`, [imageId])
  if (!ctx.isNative) {
    ctx.requestPersistence()
  }
}

export async function failPendingImageDeletion(
  ctx: DatabaseContext,
  imageId: string,
  errorMessage: string,
): Promise<void> {
  await runStatement(ctx, `UPDATE pending_image_deletions
    SET attempt_count = attempt_count + 1, last_error = ? WHERE image_id = ?`, [
    errorMessage.slice(0, 1000), imageId,
  ])
  if (!ctx.isNative) {
    ctx.requestPersistence()
  }
}
