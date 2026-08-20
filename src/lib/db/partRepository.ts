/**
 * Repository for book parts (volumes): CRUD plus the part/chapter ordering that
 * lives partly on the book row (`part_order`) and partly on each part
 * (`chapter_order`).
 *
 * Follows the split pattern — every function takes a {@link DatabaseContext}.
 */

import type { DatabaseContext, QueryRow } from './connection'
import { readQueryRowValue } from './rowUtils'
import { runInTransaction } from './transaction'
import type { BookPart } from '../database'

// --- Row mappers ------------------------------------------------------------

function toNativePart(row: Record<string, unknown>): BookPart {
  return {
    id: String(row.id),
    book_id: String(row.book_id),
    name: String(row.name),
    chapter_order: typeof row.chapter_order === 'string' ? row.chapter_order : '[]',
    cover_image_id: typeof row.cover_image_id === 'string' ? row.cover_image_id : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

function toNativePartFromQueryRow(row: QueryRow): BookPart {
  return Array.isArray(row)
    ? toWebPart(row)
    : toNativePart(row)
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
  }
}

// --- Book-level part ordering (stored on books.part_order) ------------------

async function getBookPartOrder(ctx: DatabaseContext, bookId: string): Promise<string[]> {
  const query = `SELECT part_order FROM books WHERE id = ?`
  let partOrder: string[] = []

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [bookId])
    if (result.values && result.values[0]) {
      const orderValue = readQueryRowValue(result.values[0], 0, 'part_order')
      const orderStr = typeof orderValue === 'string' ? orderValue : '[]'
      try {
        const parsed = JSON.parse(orderStr)
        if (Array.isArray(parsed)) {
          partOrder = parsed
        }
      } catch (error) {
        console.warn('Failed to parse part order for book', bookId, error)
      }
    }
  } else {
    const result = ctx.connection.exec(query, [bookId])
    if (result.length > 0 && result[0].values && result[0].values[0]) {
      const orderStr = (result[0].values[0][0] as string) || '[]'
      try {
        const parsed = JSON.parse(orderStr)
        if (Array.isArray(parsed)) {
          partOrder = parsed
        }
      } catch (error) {
        console.warn('Failed to parse part order for book', bookId, error)
      }
    }
  }

  return partOrder
}

async function saveBookPartOrder(ctx: DatabaseContext, bookId: string, partOrder: string[]): Promise<void> {
  const uniqueOrder = Array.from(new Set(partOrder))
  const query = `UPDATE books SET part_order = ? WHERE id = ?`
  const serialized = JSON.stringify(uniqueOrder)

  if (ctx.isNative) {
    await ctx.connection.run(query, [serialized, bookId])
  } else {
    ctx.connection.run(query, [serialized, bookId])
    ctx.requestPersistence()
  }
}

// --- Parts ------------------------------------------------------------------

export async function createPart(ctx: DatabaseContext, part: { book_id: string; name: string }): Promise<BookPart> {
  const id = `part-${part.book_id}-${Date.now()}`
  const now = new Date().toISOString()
  const query = `INSERT INTO book_parts (id, book_id, name, chapter_order, created_at, updated_at)
                 VALUES (?, ?, ?, '[]', ?, ?)`

  if (ctx.isNative) {
    await ctx.connection.run(query, [id, part.book_id, part.name, now, now])
  } else {
    ctx.connection.run(query, [id, part.book_id, part.name, now, now])
    ctx.requestPersistence()
  }

  const currentOrder = await getBookPartOrder(ctx, part.book_id)
  if (!currentOrder.includes(id)) {
    await saveBookPartOrder(ctx, part.book_id, [...currentOrder, id])
  }

  return {
    id,
    book_id: part.book_id,
    name: part.name,
    chapter_order: '[]',
    cover_image_id: null,
    created_at: now,
    updated_at: now,
  }
}

export async function getParts(ctx: DatabaseContext, bookId: string): Promise<BookPart[]> {
  const query = `SELECT id, book_id, name, chapter_order, cover_image_id, created_at, updated_at FROM book_parts WHERE book_id = ? ORDER BY created_at`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [bookId])
    return (result.values || []).map((row) => toNativePartFromQueryRow(row))
  } else {
    const result = ctx.connection.exec(query, [bookId])
    if (result.length === 0) return []

    return result[0].values.map((row: unknown[]) => toWebPart(row))
  }
}

export async function setPartCoverImageId(ctx: DatabaseContext, partId: string, imageId: string | null): Promise<void> {
  const now = new Date().toISOString()
  const query = `UPDATE book_parts SET cover_image_id = ?, updated_at = ? WHERE id = ?`

  if (ctx.isNative) {
    await ctx.connection.run(query, [imageId, now, partId])
  } else {
    ctx.connection.run(query, [imageId, now, partId])
    ctx.requestPersistence()
    await ctx.flushPersistence()
  }
}

export async function updatePart(ctx: DatabaseContext, partId: string, name: string): Promise<void> {
  const now = new Date().toISOString()
  const query = `UPDATE book_parts SET name = ?, updated_at = ? WHERE id = ?`

  if (ctx.isNative) {
    await ctx.connection.run(query, [name, now, partId])
  } else {
    ctx.connection.run(query, [name, now, partId])
    ctx.requestPersistence()
  }
}

export async function updatePartOrder(ctx: DatabaseContext, bookId: string, partOrder: string[]): Promise<void> {
  await saveBookPartOrder(ctx, bookId, partOrder)
}

export async function deletePart(ctx: DatabaseContext, partId: string): Promise<void> {
  await runInTransaction(ctx, async (txCtx) => {
    let bookId: string | null = null
    const getBookIdQuery = `SELECT book_id FROM book_parts WHERE id = ? LIMIT 1`

    if (txCtx.isNative) {
      const result = await txCtx.connection.query(getBookIdQuery, [partId])
      if (result.values && result.values[0]) bookId = result.values[0].book_id as string
    } else {
      const result = txCtx.connection.exec(getBookIdQuery, [partId])
      if (result[0]?.values[0]) bookId = (result[0].values[0][0] as string) || null
    }

    const updateChaptersQuery = `UPDATE chapters SET part_id = NULL WHERE part_id = ?`
    const deleteQuery = `DELETE FROM book_parts WHERE id = ?`
    if (txCtx.isNative) {
      await txCtx.connection.run(updateChaptersQuery, [partId])
      await txCtx.connection.run(deleteQuery, [partId])
      await txCtx.connection.run(`DELETE FROM part_summaries WHERE part_id = ?`, [partId])
    } else {
      txCtx.connection.run(updateChaptersQuery, [partId])
      txCtx.connection.run(deleteQuery, [partId])
      txCtx.connection.run(`DELETE FROM part_summaries WHERE part_id = ?`, [partId])
    }

    if (bookId) {
      const currentOrder = await getBookPartOrder(txCtx, bookId)
      await saveBookPartOrder(txCtx, bookId, currentOrder.filter((id) => id !== partId))
    }
  })
  if (!ctx.isNative) {
    ctx.requestPersistence()
    await ctx.flushPersistence()
  }
}

export async function updateChapterOrders(
  ctx: DatabaseContext,
  bookId: string,
  chapterOrder: string[],
  partUpdates: Record<string, string[]>,
  partOrder?: string[],
): Promise<void> {
  // Update book's chapter_order
  const updateBookQuery = `UPDATE books SET chapter_order = ? WHERE id = ?`

  if (ctx.isNative) {
    await ctx.connection.run(updateBookQuery, [JSON.stringify(chapterOrder), bookId])

    // Update each part's chapter_order and chapter part_id assignments
    for (const [partId, chapterIds] of Object.entries(partUpdates)) {
      if (partId === 'null') {
        // Remove part_id from these chapters
        for (const chapterId of chapterIds) {
          await ctx.connection.run('UPDATE chapters SET part_id = NULL WHERE id = ?', [chapterId])
        }
      } else {
        // Update part's chapter_order
        await ctx.connection.run('UPDATE book_parts SET chapter_order = ? WHERE id = ?', [
          JSON.stringify(chapterIds),
          partId,
        ])
        // Assign chapters to this part
        for (const chapterId of chapterIds) {
          await ctx.connection.run('UPDATE chapters SET part_id = ? WHERE id = ?', [partId, chapterId])
        }
      }
    }

    if (partOrder) {
      await saveBookPartOrder(ctx, bookId, partOrder)
    }
  } else {
    ctx.connection.run(updateBookQuery, [JSON.stringify(chapterOrder), bookId])

    // Update each part's chapter_order and chapter part_id assignments
    for (const [partId, chapterIds] of Object.entries(partUpdates)) {
      if (partId === 'null') {
        // Remove part_id from these chapters
        for (const chapterId of chapterIds) {
          ctx.connection.run('UPDATE chapters SET part_id = NULL WHERE id = ?', [chapterId])
        }
      } else {
        // Update part's chapter_order
        ctx.connection.run('UPDATE book_parts SET chapter_order = ? WHERE id = ?', [
          JSON.stringify(chapterIds),
          partId,
        ])
        // Assign chapters to this part
        for (const chapterId of chapterIds) {
          ctx.connection.run('UPDATE chapters SET part_id = ? WHERE id = ?', [partId, chapterId])
        }
      }
    }

    if (partOrder) {
      await saveBookPartOrder(ctx, bookId, partOrder)
    }

    ctx.requestPersistence()
  }
}
