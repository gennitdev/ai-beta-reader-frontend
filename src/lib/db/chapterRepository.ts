/**
 * Repository for books, chapters, and chapter revision history.
 *
 * These are grouped together because they are tightly coupled: saving a chapter
 * writes a revision snapshot and an activity entry and maintains the book's
 * `chapter_order`; restoring a revision re-saves the chapter. Every function
 * takes an explicit {@link DatabaseContext}.
 */

import { countRevisionChanges } from '@/lib/revisionDiff'
import type { DatabaseContext, QueryRow } from './connection'
import { readQueryRowValue } from './rowUtils'
import { runInTransaction } from './transaction'
import type { Book, Chapter, ChapterRevision, ChapterRevisionActivity } from '../database'

// --- Row mappers ------------------------------------------------------------

function toNativeBook(row: Record<string, unknown>): Book {
  return {
    id: String(row.id),
    title: String(row.title),
    chapter_order: typeof row.chapter_order === 'string' ? row.chapter_order : '[]',
    part_order: typeof row.part_order === 'string' ? row.part_order : '[]',
    cover_image_id: typeof row.cover_image_id === 'string' ? row.cover_image_id : null,
    created_at: String(row.created_at),
  }
}

function toWebBook(row: unknown[]): Book {
  return {
    id: String(row[0]),
    title: String(row[1]),
    chapter_order: typeof row[2] === 'string' ? row[2] : '[]',
    part_order: typeof row[3] === 'string' ? row[3] : '[]',
    cover_image_id: typeof row[4] === 'string' ? row[4] : null,
    created_at: String(row[5]),
  }
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
  }
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
  }
}

function toWebChapterRevision(row: unknown[]): ChapterRevision {
  return {
    id: String(row[0]),
    chapter_id: String(row[1]),
    book_id: String(row[2]),
    title: typeof row[3] === 'string' ? row[3] : null,
    text: String(row[4] ?? ''),
    word_count: Number(row[5] ?? 0),
    words_added: Number(row[6] ?? 0),
    words_removed: Number(row[7] ?? 0),
    revision_kind: row[8] === 'baseline' ? 'baseline' : 'save',
    created_at: String(row[9]),
    discarded_at: typeof row[10] === 'string' ? row[10] : null,
  }
}

function toNativeChapterRevision(row: QueryRow): ChapterRevision {
  return {
    id: String(readQueryRowValue(row, 0, 'id')),
    chapter_id: String(readQueryRowValue(row, 1, 'chapter_id')),
    book_id: String(readQueryRowValue(row, 2, 'book_id')),
    title: typeof readQueryRowValue(row, 3, 'title') === 'string' ? readQueryRowValue(row, 3, 'title') as string : null,
    text: String(readQueryRowValue(row, 4, 'text') ?? ''),
    word_count: Number(readQueryRowValue(row, 5, 'word_count') ?? 0),
    words_added: Number(readQueryRowValue(row, 6, 'words_added') ?? 0),
    words_removed: Number(readQueryRowValue(row, 7, 'words_removed') ?? 0),
    revision_kind: readQueryRowValue(row, 8, 'revision_kind') === 'baseline' ? 'baseline' : 'save',
    created_at: String(readQueryRowValue(row, 9, 'created_at')),
    discarded_at: typeof readQueryRowValue(row, 10, 'discarded_at') === 'string'
      ? readQueryRowValue(row, 10, 'discarded_at') as string : null,
  }
}

function countChangedWords(previousText: string, nextText: string): { added: number; removed: number } {
  return countRevisionChanges(previousText, nextText)
}

// --- Books ------------------------------------------------------------------

export async function saveBook(ctx: DatabaseContext, book: Book): Promise<void> {
  const query = `INSERT OR REPLACE INTO books (id, title, chapter_order, part_order, cover_image_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  const chapterOrder = book.chapter_order || '[]'
  const partOrder = book.part_order || '[]'
  const coverImageId = book.cover_image_id ?? null

  if (ctx.isNative) {
    await ctx.connection.run(query, [
      book.id,
      book.title,
      chapterOrder,
      partOrder,
      coverImageId,
      book.created_at,
    ])
  } else {
    ctx.connection.run(query, [book.id, book.title, chapterOrder, partOrder, coverImageId, book.created_at])
    ctx.requestPersistence()
  }
}

export async function getBooks(ctx: DatabaseContext): Promise<Book[]> {
  const query = `SELECT id, title, chapter_order, part_order, cover_image_id, created_at FROM books ORDER BY created_at DESC`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query)
    if (!result.values) return []

    return result.values.map((row: Record<string, unknown>) => toNativeBook(row))
  } else {
    const result = ctx.connection.exec(query)
    if (result.length === 0) return []

    return result[0].values.map((row: unknown[]) => toWebBook(row))
  }
}

// --- Chapters ---------------------------------------------------------------

export async function saveChapter(
  ctx: DatabaseContext,
  chapter: Chapter,
  options: { createRevision?: boolean; forceRevision?: boolean } = {},
): Promise<string | null> {
  const createRevision = options.createRevision !== false
  let createdRevisionId: string | null = null
  const existingQuery = `SELECT id, book_id, part_id, title, text, word_count, created_at
                         FROM chapters WHERE id = ? LIMIT 1`
  let existing: Chapter | null = null
  if (createRevision) {
    if (ctx.isNative) {
      const result = await ctx.connection.query(existingQuery, [chapter.id])
      existing = result.values?.[0] ? toNativeChapter(result.values[0]) : null
    } else {
      const result = ctx.connection.exec(existingQuery, [chapter.id])
      existing = result[0]?.values?.[0] ? toWebChapter(result[0].values[0]) : null
    }
  }

  const changed = options.forceRevision === true || !existing || existing.title !== chapter.title || existing.text !== chapter.text
  const query = `INSERT INTO chapters (id, book_id, part_id, title, text, word_count, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                   book_id = excluded.book_id,
                   part_id = excluded.part_id,
                   title = excluded.title,
                   text = excluded.text,
                   word_count = excluded.word_count`

  if (ctx.isNative) {
    await ctx.connection.run(query, [
      chapter.id,
      chapter.book_id,
      chapter.part_id || null,
      chapter.title,
      chapter.text,
      chapter.word_count,
      chapter.created_at,
    ])
  } else {
    ctx.connection.run(query, [
      chapter.id,
      chapter.book_id,
      chapter.part_id || null,
      chapter.title,
      chapter.text,
      chapter.word_count,
      chapter.created_at,
    ])
    ctx.requestPersistence()
  }

  if (createRevision && changed) {
    const revisionCountQuery = `SELECT COUNT(*) AS count FROM chapter_revisions WHERE chapter_id = ?`
    let revisionCount = 0
    if (ctx.isNative) {
      const result = await ctx.connection.query(revisionCountQuery, [chapter.id])
      revisionCount = Number(result.values?.[0]?.count ?? 0)
    } else {
      const result = ctx.connection.exec(revisionCountQuery, [chapter.id])
      revisionCount = Number(result[0]?.values?.[0]?.[0] ?? 0)
    }

    const insertRevision = async (snapshot: Chapter, kind: 'save' | 'baseline', createdAt: string, added: number, removed: number) => {
      const revisionId = `${snapshot.id}-${kind}-${Date.now()}`
      const revisionQuery = `INSERT INTO chapter_revisions
        (id, chapter_id, book_id, title, text, word_count, words_added, words_removed, revision_kind, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      const params = [revisionId, snapshot.id, snapshot.book_id, snapshot.title ?? null, snapshot.text,
        snapshot.word_count, added, removed, kind, createdAt]
      if (ctx.isNative) await ctx.connection.run(revisionQuery, params)
      else ctx.connection.run(revisionQuery, params)
      return revisionId
    }

    if (existing && revisionCount === 0) {
      await insertRevision(existing, 'baseline', existing.created_at, 0, 0)
    }
    const wordChanges = countChangedWords(existing?.text ?? '', chapter.text)
    const savedAt = new Date().toISOString()
    const revisionId = await insertRevision(chapter, 'save', savedAt, wordChanges.added, wordChanges.removed)
    createdRevisionId = revisionId
    await insertChapterActivity(ctx, {
      id: revisionId,
      bookId: chapter.book_id,
      chapterId: chapter.id,
      chapterTitle: chapter.title ?? null,
      activityType: 'save',
      wordsAdded: wordChanges.added,
      wordsRemoved: wordChanges.removed,
      wordCountDeleted: 0,
      createdAt: savedAt,
    })
    if (!ctx.isNative) ctx.requestPersistence()
  }

  // Add chapter to book's chapter_order if not already present
  await addChapterToBookOrder(ctx, chapter.book_id, chapter.id)
  return createdRevisionId
}

async function insertChapterActivity(ctx: DatabaseContext, activity: {
  id: string
  bookId: string
  chapterId: string
  chapterTitle: string | null
  activityType: 'save' | 'delete'
  wordsAdded: number
  wordsRemoved: number
  wordCountDeleted: number
  createdAt: string
}): Promise<void> {
  const query = `INSERT OR IGNORE INTO chapter_activity
    (id, book_id, chapter_id, chapter_title, activity_type, words_added, words_removed, word_count_deleted, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  const params = [activity.id, activity.bookId, activity.chapterId, activity.chapterTitle,
    activity.activityType, activity.wordsAdded, activity.wordsRemoved, activity.wordCountDeleted,
    activity.createdAt]
  if (ctx.isNative) await ctx.connection.run(query, params)
  else ctx.connection.run(query, params)
}

export async function getChapters(ctx: DatabaseContext, bookId: string): Promise<Chapter[]> {
  const query = `SELECT id, book_id, part_id, title, text, word_count, created_at
                 FROM chapters WHERE book_id = ? ORDER BY created_at`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [bookId])
    return (result.values || []).map((row) => toNativeChapter(row))
  } else {
    const result = ctx.connection.exec(query, [bookId])
    if (result.length === 0) return []

    return result[0].values.map((row: unknown[]) => toWebChapter(row))
  }
}

async function deleteChapterRows(ctx: DatabaseContext, chapterId: string, bookId: string): Promise<void> {
  // Lookup part assignment before deletion
  let partId: string | null = null
  let deletedTitle: string | null = null
  let deletedWordCount = 0
  const getPartQuery = `SELECT part_id, title, word_count FROM chapters WHERE id = ? LIMIT 1`

  if (ctx.isNative) {
    const result = await ctx.connection.query(getPartQuery, [chapterId])
    if (result.values && result.values[0]) {
      const value = readQueryRowValue(result.values[0], 0, 'part_id')
      partId = typeof value === 'string' ? value : null
      const titleValue = readQueryRowValue(result.values[0], 1, 'title')
      deletedTitle = typeof titleValue === 'string' ? titleValue : null
      deletedWordCount = Number(readQueryRowValue(result.values[0], 2, 'word_count') ?? 0)
    }
  } else {
    const result = ctx.connection.exec(getPartQuery, [chapterId])
    if (result.length > 0 && result[0].values && result[0].values[0]) {
      const row = result[0].values[0]
      partId = (row[0] as string) || null
      deletedTitle = typeof row[1] === 'string' ? row[1] : null
      deletedWordCount = Number(row[2] ?? 0)
    }
  }

  await insertChapterActivity(ctx, {
    id: `${chapterId}-delete-${Date.now()}`,
    bookId,
    chapterId,
    chapterTitle: deletedTitle,
    activityType: 'delete',
    wordsAdded: 0,
    wordsRemoved: 0,
    wordCountDeleted: deletedWordCount,
    createdAt: new Date().toISOString(),
  })

  // Remove dependent records
  const cleanupStatements = [
    { query: "DELETE FROM chapter_summaries WHERE chapter_id = ?", params: [chapterId] },
    { query: "DELETE FROM chapter_reviews WHERE chapter_id = ?", params: [chapterId] },
    { query: "DELETE FROM chapter_wiki_mentions WHERE chapter_id = ?", params: [chapterId] },
    { query: "DELETE FROM wiki_updates WHERE chapter_id = ?", params: [chapterId] },
    { query: "DELETE FROM image_assets WHERE chapter_id = ?", params: [chapterId] },
    { query: "DELETE FROM chapter_notes WHERE chapter_id = ?", params: [chapterId] },
    { query: "DELETE FROM chapter_revisions WHERE chapter_id = ?", params: [chapterId] },
  ]

  for (const statement of cleanupStatements) {
    if (ctx.isNative) {
      await ctx.connection.run(statement.query, statement.params)
    } else {
      ctx.connection.run(statement.query, statement.params)
    }
  }

  // Delete the chapter itself
  const deleteChapterQuery = `DELETE FROM chapters WHERE id = ?`
  if (ctx.isNative) {
    await ctx.connection.run(deleteChapterQuery, [chapterId])
  } else {
    ctx.connection.run(deleteChapterQuery, [chapterId])
  }

  // Update book chapter order
  const getBookOrderQuery = `SELECT chapter_order FROM books WHERE id = ?`
  let bookOrder: string[] = []

  if (ctx.isNative) {
    const result = await ctx.connection.query(getBookOrderQuery, [bookId])
    if (result.values && result.values[0]) {
      const orderValue = readQueryRowValue(result.values[0], 0, 'chapter_order')
      const orderStr = typeof orderValue === 'string' ? orderValue : '[]'
      bookOrder = JSON.parse(orderStr)
    }
  } else {
    const result = ctx.connection.exec(getBookOrderQuery, [bookId])
    if (result.length > 0 && result[0].values && result[0].values[0]) {
      const orderStr = (result[0].values[0][0] as string) || "[]"
      bookOrder = JSON.parse(orderStr)
    }
  }

  const updatedBookOrder = bookOrder.filter((id) => id !== chapterId)
  const updateBookOrderQuery = `UPDATE books SET chapter_order = ? WHERE id = ?`

  if (ctx.isNative) {
    await ctx.connection.run(updateBookOrderQuery, [JSON.stringify(updatedBookOrder), bookId])
  } else {
    ctx.connection.run(updateBookOrderQuery, [JSON.stringify(updatedBookOrder), bookId])
  }

  // Update part order if needed
  if (partId) {
    const getPartOrderQuery = `SELECT chapter_order FROM book_parts WHERE id = ?`
    let partOrder: string[] = []

    if (ctx.isNative) {
      const result = await ctx.connection.query(getPartOrderQuery, [partId])
      if (result.values && result.values[0]) {
        const orderValue = readQueryRowValue(result.values[0], 0, 'chapter_order')
        const orderStr = typeof orderValue === 'string' ? orderValue : '[]'
        partOrder = JSON.parse(orderStr)
      }
    } else {
      const result = ctx.connection.exec(getPartOrderQuery, [partId])
      if (result.length > 0 && result[0].values && result[0].values[0]) {
        const orderStr = (result[0].values[0][0] as string) || "[]"
        partOrder = JSON.parse(orderStr)
      }
    }

    const updatedPartOrder = partOrder.filter((id) => id !== chapterId)
    const updatePartOrderQuery = `UPDATE book_parts SET chapter_order = ? WHERE id = ?`

    if (ctx.isNative) {
      await ctx.connection.run(updatePartOrderQuery, [JSON.stringify(updatedPartOrder), partId])
    } else {
      ctx.connection.run(updatePartOrderQuery, [JSON.stringify(updatedPartOrder), partId])
    }
  }

}

export async function deleteChapter(ctx: DatabaseContext, chapterId: string, bookId: string): Promise<void> {
  await runInTransaction(ctx, async (txCtx) => deleteChapterRows(txCtx, chapterId, bookId))
  if (!ctx.isNative) {
    ctx.requestPersistence()
    await ctx.flushPersistence()
  }
}

/** Append a chapter id to its book's `chapter_order` if not already present. */
async function addChapterToBookOrder(ctx: DatabaseContext, bookId: string, chapterId: string): Promise<void> {
  // Get current chapter order
  const query = `SELECT chapter_order FROM books WHERE id = ?`
  let currentOrder: string[] = []

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [bookId])
    if (result.values && result.values[0]) {
      const orderValue = readQueryRowValue(result.values[0], 0, 'chapter_order')
      const orderStr = typeof orderValue === 'string' ? orderValue : '[]'
      currentOrder = JSON.parse(orderStr)
    }
  } else {
    const result = ctx.connection.exec(query, [bookId])
    if (result.length > 0 && result[0].values[0]) {
      const orderStr = result[0].values[0][0] || '[]'
      currentOrder = JSON.parse(orderStr as string)
    }
  }

  // Only add if not already present
  if (!currentOrder.includes(chapterId)) {
    currentOrder.push(chapterId)
    const updateQuery = `UPDATE books SET chapter_order = ? WHERE id = ?`

    if (ctx.isNative) {
      await ctx.connection.run(updateQuery, [JSON.stringify(currentOrder), bookId])
    } else {
      ctx.connection.run(updateQuery, [JSON.stringify(currentOrder), bookId])
      ctx.requestPersistence()
    }
  }
}

// --- Revisions --------------------------------------------------------------

export async function getChapterRevisions(ctx: DatabaseContext, chapterId: string): Promise<ChapterRevision[]> {
  const query = `SELECT id, chapter_id, book_id, title, text, word_count, words_added, words_removed,
                        revision_kind, created_at, discarded_at
                 FROM chapter_revisions WHERE chapter_id = ? ORDER BY created_at DESC, rowid DESC`
  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [chapterId])
    return (result.values ?? []).map(toNativeChapterRevision)
  }
  const result = ctx.connection.exec(query, [chapterId])
  return result[0]?.values.map(toWebChapterRevision) ?? []
}

export async function discardChapterRevision(ctx: DatabaseContext, revisionId: string): Promise<ChapterRevision> {
  const revisionQuery = `SELECT id, chapter_id, book_id, title, text, word_count, words_added, words_removed,
                                revision_kind, created_at, discarded_at
                         FROM chapter_revisions WHERE id = ? LIMIT 1`
  let target: ChapterRevision | null = null
  if (ctx.isNative) {
    const result = await ctx.connection.query(revisionQuery, [revisionId])
    target = result.values?.[0] ? toNativeChapterRevision(result.values[0]) : null
  } else {
    const result = ctx.connection.exec(revisionQuery, [revisionId])
    target = result[0]?.values?.[0] ? toWebChapterRevision(result[0].values[0]) : null
  }

  if (!target) throw new Error('Chapter version not found')
  if (target.discarded_at) throw new Error('Chapter version has already been discarded')
  if (target.revision_kind === 'baseline') throw new Error('The original version cannot be discarded')

  const latestQuery = `SELECT id FROM chapter_revisions
                       WHERE chapter_id = ? AND discarded_at IS NULL
                       ORDER BY created_at DESC, rowid DESC LIMIT 1`
  let latestRevisionId: string | null = null
  if (ctx.isNative) {
    const result = await ctx.connection.query(latestQuery, [target.chapter_id])
    latestRevisionId = result.values?.[0]
      ? String(readQueryRowValue(result.values[0], 0, 'id')) : null
  } else {
    const result = ctx.connection.exec(latestQuery, [target.chapter_id])
    latestRevisionId = result[0]?.values?.[0] ? String(result[0].values[0][0]) : null
  }
  if (latestRevisionId === revisionId) throw new Error('The current saved version cannot be discarded')

  const discardedAt = new Date().toISOString()
  const discardRevisionQuery = `UPDATE chapter_revisions
                                SET text = '', discarded_at = ?
                                WHERE id = ? AND discarded_at IS NULL`
  const discardActivityQuery = `UPDATE chapter_activity SET revision_discarded = 1 WHERE id = ?`
  if (ctx.isNative) {
    await ctx.connection.run(discardRevisionQuery, [discardedAt, revisionId])
    await ctx.connection.run(discardActivityQuery, [revisionId])
  } else {
    ctx.connection.run(discardRevisionQuery, [discardedAt, revisionId])
    ctx.connection.run(discardActivityQuery, [revisionId])
    ctx.requestPersistence()
  }

  return { ...target, text: '', discarded_at: discardedAt }
}

export async function restoreChapterRevision(ctx: DatabaseContext, revisionId: string): Promise<ChapterRevision> {
  const revisionQuery = `SELECT id, chapter_id, book_id, title, text, word_count, words_added, words_removed,
                                revision_kind, created_at, discarded_at
                         FROM chapter_revisions WHERE id = ? AND discarded_at IS NULL LIMIT 1`
  const chapterQuery = `SELECT id, book_id, part_id, title, text, word_count, created_at
                        FROM chapters WHERE id = ? LIMIT 1`

  let target: ChapterRevision | null = null
  if (ctx.isNative) {
    const result = await ctx.connection.query(revisionQuery, [revisionId])
    target = result.values?.[0] ? toNativeChapterRevision(result.values[0]) : null
  } else {
    const result = ctx.connection.exec(revisionQuery, [revisionId])
    target = result[0]?.values?.[0] ? toWebChapterRevision(result[0].values[0]) : null
  }
  if (!target) throw new Error('Chapter version not found')

  let current: Chapter | null = null
  if (ctx.isNative) {
    const result = await ctx.connection.query(chapterQuery, [target.chapter_id])
    current = result.values?.[0] ? toNativeChapter(result.values[0]) : null
  } else {
    const result = ctx.connection.exec(chapterQuery, [target.chapter_id])
    current = result[0]?.values?.[0] ? toWebChapter(result[0].values[0]) : null
  }
  if (!current) throw new Error('Chapter not found')

  const restoredId = await saveChapter(ctx, {
    ...current,
    title: target.title ?? undefined,
    text: target.text,
    word_count: target.word_count,
  }, { forceRevision: true })
  if (!restoredId) throw new Error('Failed to create restored chapter version')

  const restored = (await getChapterRevisions(ctx, target.chapter_id))
    .find((item) => item.id === restoredId)
  if (!restored) throw new Error('Restored chapter version not found')
  return restored
}

export async function getBookRevisionActivity(ctx: DatabaseContext, bookId: string): Promise<ChapterRevisionActivity[]> {
  const query = `SELECT a.id, a.chapter_id, a.chapter_title, a.activity_type, a.words_added,
                        a.words_removed, a.word_count_deleted, a.created_at,
                        CASE WHEN r.id IS NULL OR r.discarded_at IS NOT NULL THEN 0 ELSE 1 END AS revision_available,
                        a.revision_discarded
                 FROM chapter_activity a
                 LEFT JOIN chapter_revisions r ON r.id = a.id
                 WHERE a.book_id = ? ORDER BY a.created_at ASC, a.rowid ASC`
  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [bookId])
    return (result.values ?? []).map((row) => ({
      id: String(readQueryRowValue(row, 0, 'id')),
      chapter_id: String(readQueryRowValue(row, 1, 'chapter_id')),
      chapter_title: typeof readQueryRowValue(row, 2, 'chapter_title') === 'string'
        ? readQueryRowValue(row, 2, 'chapter_title') as string : null,
      activity_type: readQueryRowValue(row, 3, 'activity_type') === 'delete' ? 'delete' : 'save',
      words_added: Number(readQueryRowValue(row, 4, 'words_added') ?? 0),
      words_removed: Number(readQueryRowValue(row, 5, 'words_removed') ?? 0),
      word_count_deleted: Number(readQueryRowValue(row, 6, 'word_count_deleted') ?? 0),
      revision_available: Boolean(readQueryRowValue(row, 8, 'revision_available')),
      revision_discarded: Boolean(readQueryRowValue(row, 9, 'revision_discarded')),
      created_at: String(readQueryRowValue(row, 7, 'created_at')),
    }))
  }
  const result = ctx.connection.exec(query, [bookId])
  return result[0]?.values.map((row) => ({
    id: String(row[0]),
    chapter_id: String(row[1]),
    chapter_title: typeof row[2] === 'string' ? row[2] : null,
    activity_type: row[3] === 'delete' ? 'delete' : 'save',
    words_added: Number(row[4] ?? 0),
    words_removed: Number(row[5] ?? 0),
    word_count_deleted: Number(row[6] ?? 0),
    revision_available: Boolean(row[8]),
    revision_discarded: Boolean(row[9]),
    created_at: String(row[7]),
  })) ?? []
}
