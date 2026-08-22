/**
 * Repository for image assets: the assets themselves, their wiki-page tags, and
 * the book/part/chapter/wiki cover-image relationships.
 *
 * Follows the split pattern — every function takes a {@link DatabaseContext}.
 * Image writes flush persistence eagerly (not just debounced) because image
 * data is large and users expect it durable immediately.
 */

import { IMAGE_ASSET_COLUMNS } from '@/lib/databaseImportExport'
import type { DatabaseContext } from './connection'
import { runInTransaction } from './transaction'
import type { ImageAsset, ImageAssetType, ImageWikiTag } from '../database'
import type { ImageContentIntegrity } from '@/lib/imageContentHash'

// --- Row mappers ------------------------------------------------------------

export function imageAssetFromSqlRow(row: unknown[]): ImageAsset {
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
    content_hash: row[11] == null ? null : String(row[11]),
    content_hash_algorithm: row[12] == null ? null : String(row[12]),
    content_byte_length: row[13] == null ? null : Number(row[13]),
  }
}

export function imageAssetFromNativeRow(row: Record<string, unknown>): ImageAsset {
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
    content_hash: row.content_hash == null ? null : String(row.content_hash),
    content_hash_algorithm: row.content_hash_algorithm == null ? null : String(row.content_hash_algorithm),
    content_byte_length: row.content_byte_length == null ? null : Number(row.content_byte_length),
  }
}

/** SELECT list for image_assets, optionally prefixed with a table alias. */
function imageColumns(alias?: string): string {
  return alias
    ? IMAGE_ASSET_COLUMNS.map((column) => `${alias}.${column}`).join(', ')
    : IMAGE_ASSET_COLUMNS.join(', ')
}

// --- Image assets -----------------------------------------------------------

export async function saveImageAsset(ctx: DatabaseContext, asset: ImageAsset): Promise<void> {
  const query = `INSERT OR REPLACE INTO image_assets
    (id, book_id, chapter_id, asset_type, file_name, file_path, mime_type, image_data, notes, created_at, updated_at, content_hash, content_hash_algorithm, content_byte_length)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    asset.content_hash ?? null,
    asset.content_hash_algorithm ?? null,
    asset.content_byte_length ?? null,
  ]

  if (ctx.isNative) {
    await ctx.connection.run(query, params)
  } else {
    ctx.connection.run(query, params)
    ctx.requestPersistence()
    await ctx.flushPersistence()
  }
}

export async function deleteImageAsset(ctx: DatabaseContext, imageId: string): Promise<void> {
  const unlinkCoverQuery = `UPDATE books SET cover_image_id = NULL, updated_at = ? WHERE cover_image_id = ?`
  const unlinkPartCoverQuery = `UPDATE book_parts SET cover_image_id = NULL, updated_at = ? WHERE cover_image_id = ?`
  const unlinkChapterCoverQuery = `UPDATE chapters SET cover_image_id = NULL, updated_at = ? WHERE cover_image_id = ?`
  const deleteTagsQuery = `DELETE FROM image_wiki_tags WHERE image_id = ?`
  const deleteQuery = `DELETE FROM image_assets WHERE id = ?`
  const updatedAt = new Date().toISOString()

  await runInTransaction(ctx, async (txCtx) => {
    if (txCtx.isNative) {
      await txCtx.connection.run(unlinkCoverQuery, [updatedAt, imageId])
      await txCtx.connection.run(unlinkPartCoverQuery, [updatedAt, imageId])
      await txCtx.connection.run(unlinkChapterCoverQuery, [updatedAt, imageId])
      await txCtx.connection.run(deleteTagsQuery, [imageId])
      await txCtx.connection.run(deleteQuery, [imageId])
    } else {
      txCtx.connection.run(unlinkCoverQuery, [updatedAt, imageId])
      txCtx.connection.run(unlinkPartCoverQuery, [updatedAt, imageId])
      txCtx.connection.run(unlinkChapterCoverQuery, [updatedAt, imageId])
      txCtx.connection.run(deleteTagsQuery, [imageId])
      txCtx.connection.run(deleteQuery, [imageId])
    }
  })
  if (!ctx.isNative) {
    ctx.requestPersistence()
    await ctx.flushPersistence()
  }
}

export async function updateImageAssetNotes(ctx: DatabaseContext, imageId: string, notes: string): Promise<void> {
  const query = `UPDATE image_assets SET notes = ?, updated_at = ? WHERE id = ?`
  const params = [notes, new Date().toISOString(), imageId]

  if (ctx.isNative) {
    await ctx.connection.run(query, params)
  } else {
    ctx.connection.run(query, params)
    ctx.requestPersistence()
  }
}

/** Persist derived content metadata without changing the asset's user-visible modified time. */
export async function updateImageAssetIntegrity(
  ctx: DatabaseContext,
  imageId: string,
  integrity: ImageContentIntegrity,
): Promise<void> {
  const query = `UPDATE image_assets
    SET content_hash = ?, content_hash_algorithm = ?, content_byte_length = ?
    WHERE id = ? AND (content_hash IS NULL OR content_hash = '')`
  const params = [
    integrity.content_hash,
    integrity.content_hash_algorithm,
    integrity.content_byte_length,
    imageId,
  ]

  if (ctx.isNative) {
    await ctx.connection.run(query, params)
  } else {
    ctx.connection.run(query, params)
    ctx.requestPersistence()
    await ctx.flushPersistence()
  }
}

// --- Wiki-page tags ---------------------------------------------------------

export async function getImageWikiTags(ctx: DatabaseContext, imageId: string): Promise<ImageWikiTag[]> {
  const query = `
    SELECT iwt.image_id, iwt.wiki_page_id, wp.page_name, wp.page_type, iwt.created_at
    FROM image_wiki_tags iwt
    INNER JOIN wiki_pages wp ON wp.id = iwt.wiki_page_id
    WHERE iwt.image_id = ?
    ORDER BY wp.page_name
  `

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [imageId])
    return ((result.values || []) as Record<string, unknown>[]).map((row) => ({
      image_id: String(row.image_id),
      wiki_page_id: String(row.wiki_page_id),
      page_name: String(row.page_name),
      page_type: String(row.page_type),
      created_at: String(row.created_at),
    }))
  }

  const result = ctx.connection.exec(query, [imageId])
  if (result.length === 0) return []

  return result[0].values.map((row: unknown[]) => ({
    image_id: String(row[0]),
    wiki_page_id: String(row[1]),
    page_name: String(row[2]),
    page_type: String(row[3]),
    created_at: String(row[4]),
  }))
}

export async function setImageWikiTags(ctx: DatabaseContext, imageId: string, wikiPageIds: string[]): Promise<void> {
  const deleteQuery = `DELETE FROM image_wiki_tags WHERE image_id = ?`
  const insertQuery = `INSERT OR IGNORE INTO image_wiki_tags (image_id, wiki_page_id, created_at) VALUES (?, ?, ?)`
  const now = new Date().toISOString()
  const uniqueWikiPageIds = [...new Set(wikiPageIds)]

  if (ctx.isNative) {
    await ctx.connection.run(deleteQuery, [imageId])
    for (const wikiPageId of uniqueWikiPageIds) {
      await ctx.connection.run(insertQuery, [imageId, wikiPageId, now])
    }
  } else {
    ctx.connection.run(deleteQuery, [imageId])
    for (const wikiPageId of uniqueWikiPageIds) {
      ctx.connection.run(insertQuery, [imageId, wikiPageId, now])
    }
    ctx.requestPersistence()
  }
}

// --- Image collections ------------------------------------------------------

export async function getWikiPageImages(ctx: DatabaseContext, wikiPageId: string): Promise<ImageAsset[]> {
  const query = `
    SELECT ${imageColumns('ia')}
    FROM image_wiki_tags iwt
    INNER JOIN image_assets ia ON ia.id = iwt.image_id
    WHERE iwt.wiki_page_id = ?
    ORDER BY ia.created_at DESC
  `

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [wikiPageId])
    return (result.values || []).map(imageAssetFromNativeRow)
  }

  const result = ctx.connection.exec(query, [wikiPageId])
  if (result.length === 0) return []
  return result[0].values.map(imageAssetFromSqlRow)
}

export async function getChapterImages(ctx: DatabaseContext, chapterId: string): Promise<ImageAsset[]> {
  const query = `SELECT ${imageColumns()} FROM image_assets WHERE chapter_id = ? ORDER BY created_at DESC`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [chapterId])
    return (result.values || []).map(imageAssetFromNativeRow)
  } else {
    const result = ctx.connection.exec(query, [chapterId])
    if (result.length === 0) return []
    return result[0].values.map(imageAssetFromSqlRow)
  }
}

export async function getPartImages(ctx: DatabaseContext, partId: string): Promise<ImageAsset[]> {
  const query = `
    SELECT ${imageColumns('ia')}
    FROM image_assets ia
    INNER JOIN chapters c ON c.id = ia.chapter_id
    WHERE c.part_id = ?
    ORDER BY ia.created_at DESC
  `

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [partId])
    return (result.values || []).map(imageAssetFromNativeRow)
  } else {
    const result = ctx.connection.exec(query, [partId])
    if (result.length === 0) return []
    return result[0].values.map(imageAssetFromSqlRow)
  }
}

export async function getBookImages(ctx: DatabaseContext, bookId: string): Promise<ImageAsset[]> {
  const query = `SELECT ${imageColumns()} FROM image_assets WHERE book_id = ? ORDER BY created_at DESC`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [bookId])
    return (result.values || []).map(imageAssetFromNativeRow)
  } else {
    const result = ctx.connection.exec(query, [bookId])
    if (result.length === 0) return []
    return result[0].values.map(imageAssetFromSqlRow)
  }
}

// --- Cover images -----------------------------------------------------------

export async function getBookCoverImage(ctx: DatabaseContext, bookId: string): Promise<ImageAsset | null> {
  const query = `
    SELECT ${imageColumns('ia')}
    FROM books b
    LEFT JOIN image_assets ia ON ia.id = b.cover_image_id
    WHERE b.id = ?
    LIMIT 1
  `

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [bookId])
    const row = result.values && result.values[0]
    if (!row || !row.id) return null
    return imageAssetFromNativeRow(row)
  } else {
    const result = ctx.connection.exec(query, [bookId])
    if (result.length === 0 || result[0].values.length === 0) return null
    const row = result[0].values[0]
    if (!row[0]) return null
    return imageAssetFromSqlRow(row)
  }
}

export async function setBookCoverImage(ctx: DatabaseContext, bookId: string, imageId: string | null): Promise<void> {
  const query = `UPDATE books SET cover_image_id = ?, updated_at = ? WHERE id = ?`
  const updatedAt = new Date().toISOString()

  if (ctx.isNative) {
    await ctx.connection.run(query, [imageId, updatedAt, bookId])
  } else {
    ctx.connection.run(query, [imageId, updatedAt, bookId])
    ctx.requestPersistence()
    await ctx.flushPersistence()
  }
}

export async function getPartCoverImage(ctx: DatabaseContext, partId: string): Promise<ImageAsset | null> {
  const query = `
    SELECT ${imageColumns('ia')}
    FROM book_parts bp
    LEFT JOIN image_assets ia ON ia.id = bp.cover_image_id
    WHERE bp.id = ?
    LIMIT 1
  `

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [partId])
    const row = result.values && result.values[0]
    if (!row || !row.id) return null
    return imageAssetFromNativeRow(row)
  } else {
    const result = ctx.connection.exec(query, [partId])
    if (result.length === 0 || result[0].values.length === 0) return null
    const row = result[0].values[0]
    if (!row[0]) return null
    return imageAssetFromSqlRow(row)
  }
}

export async function setChapterCoverImageId(ctx: DatabaseContext, chapterId: string, imageId: string | null): Promise<void> {
  const query = `UPDATE chapters SET cover_image_id = ?, updated_at = ? WHERE id = ?`
  const updatedAt = new Date().toISOString()

  if (ctx.isNative) {
    await ctx.connection.run(query, [imageId, updatedAt, chapterId])
  } else {
    ctx.connection.run(query, [imageId, updatedAt, chapterId])
    ctx.requestPersistence()
    await ctx.flushPersistence()
  }
}

export async function getChapterCoverImage(ctx: DatabaseContext, chapterId: string): Promise<ImageAsset | null> {
  const query = `
    SELECT ${imageColumns('ia')}
    FROM chapters c
    LEFT JOIN image_assets ia ON ia.id = c.cover_image_id
    WHERE c.id = ?
    LIMIT 1
  `

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [chapterId])
    const row = result.values && result.values[0]
    if (!row || !row.id) return null
    return imageAssetFromNativeRow(row)
  } else {
    const result = ctx.connection.exec(query, [chapterId])
    if (result.length === 0 || result[0].values.length === 0) return null
    const row = result[0].values[0]
    if (!row[0]) return null
    return imageAssetFromSqlRow(row)
  }
}

export async function setWikiPageCoverImageId(ctx: DatabaseContext, wikiPageId: string, imageId: string | null): Promise<void> {
  const query = `UPDATE wiki_pages SET cover_image_id = ?, updated_at = ? WHERE id = ?`
  const updatedAt = new Date().toISOString()

  if (ctx.isNative) {
    await ctx.connection.run(query, [imageId, updatedAt, wikiPageId])
  } else {
    ctx.connection.run(query, [imageId, updatedAt, wikiPageId])
    ctx.requestPersistence()
  }
}

export async function getWikiPageCoverImage(ctx: DatabaseContext, wikiPageId: string): Promise<ImageAsset | null> {
  const query = `
    SELECT ${imageColumns('ia')}
    FROM wiki_pages wp
    LEFT JOIN image_assets ia ON ia.id = wp.cover_image_id
    WHERE wp.id = ?
    LIMIT 1
  `

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [wikiPageId])
    const row = result.values && result.values[0]
    if (!row || !row.id) return null
    return imageAssetFromNativeRow(row)
  } else {
    const result = ctx.connection.exec(query, [wikiPageId])
    if (result.length === 0 || result[0].values.length === 0) return null
    const row = result[0].values[0]
    if (!row[0]) return null
    return imageAssetFromSqlRow(row)
  }
}
