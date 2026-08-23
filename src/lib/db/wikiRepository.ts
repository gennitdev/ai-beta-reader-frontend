/**
 * Repository for the wiki domain: wiki pages, wiki updates, and the
 * chapter<->wiki-page mention/link graph.
 *
 * Extracted from AppDatabase following the pattern established in
 * metadataRepository.ts — every function takes an explicit {@link DatabaseContext}
 * rather than relying on `this`. The chapter_wiki_mentions table is migrated
 * lazily, so the mention/link queries first detect which optional columns exist
 * via {@link getChapterWikiMentionsCapabilities}.
 */

import type { WikiPageType } from '@/types/bookView'
import {
  assertWikiIdentityAvailable,
  normalizeWikiAliases,
  parseWikiAliases,
  resolveWikiPageByName,
} from '@/lib/wikiAliases'
import { dispatchChapterWikiLinksChanged } from '@/utils/chapterWikiLinkEvents'
import type { DatabaseContext, QueryRow } from './connection'
import { readQueryRowValue } from './rowUtils'
import { getTableColumnNames } from './schema'
import { runInTransaction } from './transaction'
import type {
  WikiPage,
  ChapterWikiMention,
  ChapterWikiLink,
  WikiPageChapterLink,
  ChapterWikiLinkSource,
} from '../database'

// --- Row mappers (backend-specific) -----------------------------------------

function toWebWikiPage(row: unknown[]): WikiPage {
  const rawPageType = typeof row[3] === 'string' ? row[3] : 'character'
  const pageType: WikiPageType = ['character', 'location', 'concept', 'other'].includes(rawPageType)
    ? rawPageType as WikiPageType
    : 'character'
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
  }
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
      ])
}

function toChapterWikiMentionLinkSource(value: unknown): ChapterWikiLinkSource | null {
  return value === 'ai_summary' || value === 'manual' ? value : null
}

function toWebChapterWikiMention(row: unknown[]): ChapterWikiMention {
  return {
    id: String(row[0]),
    chapter_id: String(row[1]),
    wiki_page_id: String(row[2]),
    link_source: toChapterWikiMentionLinkSource(row[3]),
    created_at: String(row[4]),
    updated_at: typeof row[5] === 'string' ? row[5] : null,
  }
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
  }
}

function toWebChapterWikiLink(row: unknown[]): ChapterWikiLink {
  const rawPageType = typeof row[2] === 'string' ? row[2] : 'character'
  const pageType: WikiPageType = ['character', 'location', 'concept', 'other'].includes(rawPageType)
    ? (rawPageType as WikiPageType)
    : 'character'

  return {
    wiki_page_id: String(row[0]),
    page_name: String(row[1]),
    page_type: pageType,
    link_source: toChapterWikiMentionLinkSource(row[3]),
    created_at: String(row[4]),
    updated_at: typeof row[5] === 'string' ? row[5] : null,
  }
}

function toNativeChapterWikiLink(row: QueryRow): ChapterWikiLink {
  const rawPageType = readQueryRowValue(row, 2, 'page_type')
  const pageType: WikiPageType =
    typeof rawPageType === 'string' && ['character', 'location', 'concept', 'other'].includes(rawPageType)
      ? (rawPageType as WikiPageType)
      : 'character'

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
  }
}

function toWebWikiPageChapterLink(row: unknown[]): WikiPageChapterLink {
  return {
    chapter_id: String(row[0]),
    chapter_title: typeof row[1] === 'string' ? row[1] : null,
    part_id: typeof row[2] === 'string' ? row[2] : null,
    link_source: toChapterWikiMentionLinkSource(row[3]),
    created_at: String(row[4]),
    updated_at: typeof row[5] === 'string' ? row[5] : null,
  }
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
  }
}

// --- Lazy schema migration for chapter_wiki_mentions ------------------------

/**
 * Add the optional `link_source`/`updated_at` columns and supporting indexes to
 * `chapter_wiki_mentions` if they are missing. Safe to call repeatedly. Also
 * invoked from AppDatabase.init().
 */
export async function ensureChapterWikiMentionsSchema(ctx: DatabaseContext): Promise<void> {
  const columns = await getTableColumnNames(ctx, 'chapter_wiki_mentions')
  const statements: string[] = []

  if (!columns.has('link_source')) {
    statements.push(`ALTER TABLE chapter_wiki_mentions ADD COLUMN link_source TEXT DEFAULT 'manual'`)
  }

  if (!columns.has('updated_at')) {
    statements.push(`ALTER TABLE chapter_wiki_mentions ADD COLUMN updated_at TIMESTAMP`)
    statements.push(`UPDATE chapter_wiki_mentions SET updated_at = created_at WHERE updated_at IS NULL`)
  }

  statements.push(`CREATE INDEX IF NOT EXISTS idx_chapter_wiki_mentions_chapter ON chapter_wiki_mentions(chapter_id)`)
  statements.push(`CREATE INDEX IF NOT EXISTS idx_chapter_wiki_mentions_wiki_page ON chapter_wiki_mentions(wiki_page_id)`)

  for (const statement of statements) {
    try {
      if (ctx.isNative) {
        await ctx.connection.execute(statement)
      } else {
        ctx.connection.run(statement)
      }
    } catch (error) {
      console.warn('[AppDatabase] Failed to ensure chapter_wiki_mentions schema:', statement, error)
    }
  }

  if (!ctx.isNative) {
    ctx.requestPersistence()
  }
}

async function getChapterWikiMentionsCapabilities(ctx: DatabaseContext): Promise<{
  hasLinkSource: boolean
  hasUpdatedAt: boolean
}> {
  const columns = await getTableColumnNames(ctx, 'chapter_wiki_mentions')
  return {
    hasLinkSource: columns.has('link_source'),
    hasUpdatedAt: columns.has('updated_at'),
  }
}

// --- Wiki pages -------------------------------------------------------------

export async function createWikiPage(ctx: DatabaseContext, page: {
  book_id: string
  page_name: string
  content: string
  summary: string
  page_type?: string
  created_by_ai?: boolean
  is_pinned?: boolean
  aliases?: string[]
}): Promise<string> {
  const id = `wiki-${page.book_id}-${Date.now()}`
  const now = new Date().toISOString()
  const aliases = normalizeWikiAliases(page.aliases ?? [], page.page_name)
  assertWikiIdentityAvailable(await getWikiPages(ctx, page.book_id), {
    pageName: page.page_name,
    aliases,
  })
  const query = `INSERT INTO wiki_pages (id, book_id, page_name, page_type, content, summary, aliases, created_by_ai, created_at, updated_at, is_pinned)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

  const params = [
    id,
    page.book_id,
    page.page_name,
    page.page_type || 'character',
    page.content,
    page.summary,
    JSON.stringify(aliases),
    page.created_by_ai ? 1 : 0,
    now,
    now,
    page.is_pinned ? 1 : 0,
  ]

  if (ctx.isNative) {
    await ctx.connection.run(query, params)
  } else {
    ctx.connection.run(query, params)
    ctx.requestPersistence()
  }

  return id
}

export async function updateWikiPage(ctx: DatabaseContext, pageId: string, updates: {
  content?: string
  summary?: string
  page_name?: string
  tags?: string
  is_pinned?: boolean
  aliases?: string[]
}): Promise<void> {
  const now = new Date().toISOString()
  const sets: string[] = []
  const params: unknown[] = []

  if (updates.page_name !== undefined || updates.aliases !== undefined) {
    const currentPage = await getWikiPageById(ctx, pageId)
    if (!currentPage) throw new Error('Wiki page not found')
    const pageName = updates.page_name?.trim() || currentPage.page_name
    const aliases = normalizeWikiAliases(
      updates.aliases ?? parseWikiAliases(currentPage.aliases),
      pageName,
    )
    assertWikiIdentityAvailable(await getWikiPages(ctx, currentPage.book_id), {
      pageId,
      pageName,
      aliases,
    })
    if (updates.aliases !== undefined) updates.aliases = aliases
  }

  if (updates.content !== undefined) {
    sets.push('content = ?')
    params.push(updates.content)
  }
  if (updates.summary !== undefined) {
    sets.push('summary = ?')
    params.push(updates.summary)
  }
  if (updates.page_name !== undefined) {
    sets.push('page_name = ?')
    params.push(updates.page_name)
  }
  if (updates.tags !== undefined) {
    sets.push('tags = ?')
    params.push(updates.tags)
  }
  if (updates.aliases !== undefined) {
    sets.push('aliases = ?')
    params.push(JSON.stringify(updates.aliases))
  }
  if (updates.is_pinned !== undefined) {
    sets.push('is_pinned = ?')
    params.push(updates.is_pinned ? 1 : 0)
  }

  sets.push('updated_at = ?')
  params.push(now)
  params.push(pageId)

  const query = `UPDATE wiki_pages SET ${sets.join(', ')} WHERE id = ?`

  if (ctx.isNative) {
    await ctx.connection.run(query, params)
  } else {
    ctx.connection.run(query, params)
    ctx.requestPersistence()
  }
}

export async function getWikiPageById(ctx: DatabaseContext, id: string): Promise<WikiPage | null> {
  const query = `SELECT * FROM wiki_pages WHERE id = ? LIMIT 1`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [id])
    return result.values?.[0] ? toNativeWikiPage(result.values[0]) : null
  } else {
    const result = ctx.connection.exec(query, [id])
    if (result.length === 0 || result[0].values.length === 0) return null

    return toWebWikiPage(result[0].values[0] as unknown[])
  }
}

export async function getWikiPage(ctx: DatabaseContext, bookId: string, pageName: string, pageType?: string): Promise<WikiPage | null> {
  return resolveWikiPageByName(await getWikiPages(ctx, bookId), pageName, pageType)
}

export async function getWikiPages(ctx: DatabaseContext, bookId: string): Promise<WikiPage[]> {
  const query = `SELECT * FROM wiki_pages WHERE book_id = ? ORDER BY page_name`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [bookId])
    return (result.values || []).map((row) => toNativeWikiPage(row))
  } else {
    const result = ctx.connection.exec(query, [bookId])
    if (result.length === 0) return []

    return result[0].values.map((row: unknown[]) => toWebWikiPage(row))
  }
}

export async function deleteWikiPage(ctx: DatabaseContext, pageId: string): Promise<void> {
  const deleteReviewStateQuery = `DELETE FROM wiki_review_state WHERE wiki_page_id = ?`
  // Delete related wiki updates first
  const deleteUpdatesQuery = `DELETE FROM wiki_updates WHERE wiki_page_id = ?`
  // Delete related chapter mentions
  const deleteMentionsQuery = `DELETE FROM chapter_wiki_mentions WHERE wiki_page_id = ?`
  // Delete image tag relationships
  const deleteImageTagsQuery = `DELETE FROM image_wiki_tags WHERE wiki_page_id = ?`
  // Delete the wiki page itself
  const deletePageQuery = `DELETE FROM wiki_pages WHERE id = ?`

  await runInTransaction(ctx, async (txCtx) => {
    if (txCtx.isNative) {
      await txCtx.connection.run(deleteReviewStateQuery, [pageId])
      await txCtx.connection.run(deleteUpdatesQuery, [pageId])
      await txCtx.connection.run(deleteMentionsQuery, [pageId])
      await txCtx.connection.run(deleteImageTagsQuery, [pageId])
      await txCtx.connection.run(deletePageQuery, [pageId])
    } else {
      txCtx.connection.run(deleteReviewStateQuery, [pageId])
      txCtx.connection.run(deleteUpdatesQuery, [pageId])
      txCtx.connection.run(deleteMentionsQuery, [pageId])
      txCtx.connection.run(deleteImageTagsQuery, [pageId])
      txCtx.connection.run(deletePageQuery, [pageId])
    }
  })
  if (!ctx.isNative) {
    ctx.requestPersistence()
    await ctx.flushPersistence()
  }
}

export async function trackWikiUpdate(ctx: DatabaseContext, update: {
  wiki_page_id: string
  chapter_id: string
  update_type: string
  change_summary?: string
  contradiction_notes?: string
}): Promise<void> {
  const id = `update-${update.wiki_page_id}-${Date.now()}`
  const now = new Date().toISOString()
  const query = `INSERT INTO wiki_updates (id, wiki_page_id, chapter_id, update_type, change_summary, contradiction_notes, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`

  const params = [
    id,
    update.wiki_page_id,
    update.chapter_id,
    update.update_type,
    update.change_summary || null,
    update.contradiction_notes || null,
    now,
  ]

  if (ctx.isNative) {
    await ctx.connection.run(query, params)
  } else {
    ctx.connection.run(query, params)
    ctx.requestPersistence()
  }
}

// --- Chapter <-> wiki mentions/links ----------------------------------------

export async function getChapterWikiMentions(ctx: DatabaseContext, chapterId: string): Promise<ChapterWikiMention[]> {
  await ensureChapterWikiMentionsSchema(ctx)
  const { hasLinkSource, hasUpdatedAt } = await getChapterWikiMentionsCapabilities(ctx)

  const query = `SELECT id, chapter_id, wiki_page_id,
                 ${hasLinkSource ? 'link_source' : "NULL AS link_source"},
                 created_at,
                 ${hasUpdatedAt ? 'updated_at' : "NULL AS updated_at"}
                 FROM chapter_wiki_mentions
                 WHERE chapter_id = ?
                 ORDER BY created_at ASC`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [chapterId])
    return (result.values || []).map((row) => toNativeChapterWikiMention(row))
  } else {
    const result = ctx.connection.exec(query, [chapterId])
    if (result.length === 0) return []

    return result[0].values.map((row: unknown[]) => toWebChapterWikiMention(row))
  }
}

export async function getChapterWikiLinks(ctx: DatabaseContext, chapterId: string): Promise<ChapterWikiLink[]> {
  await ensureChapterWikiMentionsSchema(ctx)
  const { hasLinkSource, hasUpdatedAt } = await getChapterWikiMentionsCapabilities(ctx)

  const query = `SELECT w.id AS wiki_page_id, w.page_name, w.page_type,
                 ${hasLinkSource ? 'm.link_source' : "NULL AS link_source"},
                 m.created_at,
                 ${hasUpdatedAt ? 'm.updated_at' : "NULL AS updated_at"}
                 FROM chapter_wiki_mentions m
                 INNER JOIN wiki_pages w ON w.id = m.wiki_page_id
                 WHERE m.chapter_id = ?
                 ORDER BY w.page_name COLLATE NOCASE ASC`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [chapterId])
    return (result.values || []).map((row) => toNativeChapterWikiLink(row))
  } else {
    const result = ctx.connection.exec(query, [chapterId])
    if (result.length === 0) return []

    return result[0].values.map((row: unknown[]) => toWebChapterWikiLink(row))
  }
}

export async function getWikiPageChapterLinks(ctx: DatabaseContext, wikiPageId: string): Promise<WikiPageChapterLink[]> {
  await ensureChapterWikiMentionsSchema(ctx)
  const { hasLinkSource, hasUpdatedAt } = await getChapterWikiMentionsCapabilities(ctx)

  const query = `SELECT c.id AS chapter_id, c.title, c.part_id,
                 ${hasLinkSource ? 'm.link_source' : "NULL AS link_source"},
                 m.created_at,
                 ${hasUpdatedAt ? 'm.updated_at' : "NULL AS updated_at"}
                 FROM chapter_wiki_mentions m
                 INNER JOIN chapters c ON c.id = m.chapter_id
                 WHERE m.wiki_page_id = ?
                 ORDER BY c.created_at ASC`

  if (ctx.isNative) {
    const result = await ctx.connection.query(query, [wikiPageId])
    return (result.values || []).map((row) => toNativeWikiPageChapterLink(row))
  } else {
    const result = ctx.connection.exec(query, [wikiPageId])
    if (result.length === 0) return []

    return result[0].values.map((row: unknown[]) => toWebWikiPageChapterLink(row))
  }
}

export async function addChapterWikiMention(
  ctx: DatabaseContext,
  chapterId: string,
  wikiPageId: string,
  linkSource: ChapterWikiLinkSource = 'manual',
): Promise<void> {
  await ensureChapterWikiMentionsSchema(ctx)
  const { hasLinkSource, hasUpdatedAt } = await getChapterWikiMentionsCapabilities(ctx)

  const id = `mention-${chapterId}-${wikiPageId}`
  const now = new Date().toISOString()
  const columns = ['id', 'chapter_id', 'wiki_page_id']
  const values = ['?', '?', '?']
  const params: unknown[] = [id, chapterId, wikiPageId]

  if (hasLinkSource) {
    columns.push('link_source')
    values.push('?')
    params.push(linkSource)
  }

  columns.push('created_at')
  values.push(`COALESCE((SELECT created_at FROM chapter_wiki_mentions WHERE id = ?), ?)`)
  params.push(id, now)

  if (hasUpdatedAt) {
    columns.push('updated_at')
    values.push('?')
    params.push(now)
  }

  const query = `INSERT OR REPLACE INTO chapter_wiki_mentions (${columns.join(', ')})
                 VALUES (${values.join(', ')})`

  if (ctx.isNative) {
    await ctx.connection.run(query, params)
  } else {
    ctx.connection.run(query, params)
    ctx.requestPersistence()
  }

  dispatchChapterWikiLinksChanged({
    chapterIds: [chapterId],
    wikiPageIds: [wikiPageId],
  })
}

export async function setChapterWikiLinks(
  ctx: DatabaseContext,
  chapterId: string,
  wikiPageIds: string[],
  linkSource: ChapterWikiLinkSource = 'manual',
): Promise<void> {
  await ensureChapterWikiMentionsSchema(ctx)
  const { hasLinkSource, hasUpdatedAt } = await getChapterWikiMentionsCapabilities(ctx)

  const uniqueWikiPageIds = Array.from(new Set(wikiPageIds))
  const existingLinks = await getChapterWikiMentions(ctx, chapterId)
  const existingByWikiPageId = new Map(existingLinks.map((link) => [link.wiki_page_id, link]))
  const nextWikiPageIdSet = new Set(uniqueWikiPageIds)
  const affectedWikiPageIds = new Set([
    ...existingLinks.map((link) => link.wiki_page_id),
    ...uniqueWikiPageIds,
  ])
  const now = new Date().toISOString()

  const run = async (sql: string, params: unknown[] = []) => {
    if (ctx.isNative) {
      await ctx.connection.run(sql, params)
    } else {
      ctx.connection.run(sql, params)
    }
  }

  for (const existingLink of existingLinks) {
    if (!nextWikiPageIdSet.has(existingLink.wiki_page_id)) {
      await run(`DELETE FROM chapter_wiki_mentions WHERE id = ?`, [existingLink.id])
    }
  }

  for (const wikiPageId of uniqueWikiPageIds) {
    const existingLink = existingByWikiPageId.get(wikiPageId)
    const id = `mention-${chapterId}-${wikiPageId}`
    const columns = ['id', 'chapter_id', 'wiki_page_id']
    const values = ['?', '?', '?']
    const params: unknown[] = [id, chapterId, wikiPageId]

    if (hasLinkSource) {
      columns.push('link_source')
      values.push('?')
      params.push(linkSource)
    }

    columns.push('created_at')
    values.push('?')
    params.push(existingLink?.created_at ?? now)

    if (hasUpdatedAt) {
      columns.push('updated_at')
      values.push('?')
      params.push(now)
    }

    await run(
      `INSERT OR REPLACE INTO chapter_wiki_mentions (${columns.join(', ')})
       VALUES (${values.join(', ')})`,
      params,
    )
  }

  if (!ctx.isNative) {
    ctx.requestPersistence()
  }

  dispatchChapterWikiLinksChanged({
    chapterIds: [chapterId],
    wikiPageIds: Array.from(affectedWikiPageIds),
  })
}

export async function ensureChapterWikiLinks(
  ctx: DatabaseContext,
  chapterId: string,
  wikiPageIds: string[],
  linkSource: ChapterWikiLinkSource = 'manual',
): Promise<void> {
  await ensureChapterWikiMentionsSchema(ctx)
  const { hasLinkSource, hasUpdatedAt } = await getChapterWikiMentionsCapabilities(ctx)

  const uniqueWikiPageIds = Array.from(new Set(wikiPageIds))
  if (uniqueWikiPageIds.length === 0) {
    return
  }

  const existingLinks = await getChapterWikiMentions(ctx, chapterId)
  const existingByWikiPageId = new Map(existingLinks.map((link) => [link.wiki_page_id, link]))
  const insertedWikiPageIds: string[] = []
  const now = new Date().toISOString()

  const run = async (sql: string, params: unknown[] = []) => {
    if (ctx.isNative) {
      await ctx.connection.run(sql, params)
    } else {
      ctx.connection.run(sql, params)
    }
  }

  for (const wikiPageId of uniqueWikiPageIds) {
    if (existingByWikiPageId.has(wikiPageId)) {
      continue
    }

    const id = `mention-${chapterId}-${wikiPageId}`
    const columns = ['id', 'chapter_id', 'wiki_page_id']
    const values = ['?', '?', '?']
    const params: unknown[] = [id, chapterId, wikiPageId]

    if (hasLinkSource) {
      columns.push('link_source')
      values.push('?')
      params.push(linkSource)
    }

    columns.push('created_at')
    values.push('?')
    params.push(now)

    if (hasUpdatedAt) {
      columns.push('updated_at')
      values.push('?')
      params.push(now)
    }

    await run(
      `INSERT OR REPLACE INTO chapter_wiki_mentions (${columns.join(', ')})
       VALUES (${values.join(', ')})`,
      params,
    )
    insertedWikiPageIds.push(wikiPageId)
  }

  if (!ctx.isNative && insertedWikiPageIds.length > 0) {
    ctx.requestPersistence()
  }

  if (insertedWikiPageIds.length > 0) {
    dispatchChapterWikiLinksChanged({
      chapterIds: [chapterId],
      wikiPageIds: insertedWikiPageIds,
    })
  }
}

export async function setWikiPageChapterLinks(
  ctx: DatabaseContext,
  wikiPageId: string,
  chapterIds: string[],
  linkSource: ChapterWikiLinkSource = 'manual',
): Promise<void> {
  await ensureChapterWikiMentionsSchema(ctx)
  const { hasLinkSource, hasUpdatedAt } = await getChapterWikiMentionsCapabilities(ctx)

  const uniqueChapterIds = Array.from(new Set(chapterIds))
  const existingLinks = await getWikiPageChapterLinks(ctx, wikiPageId)
  const existingByChapterId = new Map(existingLinks.map((link) => [link.chapter_id, link]))
  const nextChapterIdSet = new Set(uniqueChapterIds)
  const affectedChapterIds = new Set([
    ...existingLinks.map((link) => link.chapter_id),
    ...uniqueChapterIds,
  ])
  const now = new Date().toISOString()

  const run = async (sql: string, params: unknown[] = []) => {
    if (ctx.isNative) {
      await ctx.connection.run(sql, params)
    } else {
      ctx.connection.run(sql, params)
    }
  }

  for (const existingLink of existingLinks) {
    if (!nextChapterIdSet.has(existingLink.chapter_id)) {
      await run(
        `DELETE FROM chapter_wiki_mentions WHERE chapter_id = ? AND wiki_page_id = ?`,
        [existingLink.chapter_id, wikiPageId],
      )
    }
  }

  for (const chapterId of uniqueChapterIds) {
    const existingLink = existingByChapterId.get(chapterId)
    const id = `mention-${chapterId}-${wikiPageId}`
    const columns = ['id', 'chapter_id', 'wiki_page_id']
    const values = ['?', '?', '?']
    const params: unknown[] = [id, chapterId, wikiPageId]

    if (hasLinkSource) {
      columns.push('link_source')
      values.push('?')
      params.push(linkSource)
    }

    columns.push('created_at')
    values.push('?')
    params.push(existingLink?.created_at ?? now)

    if (hasUpdatedAt) {
      columns.push('updated_at')
      values.push('?')
      params.push(now)
    }

    await run(
      `INSERT OR REPLACE INTO chapter_wiki_mentions (${columns.join(', ')})
       VALUES (${values.join(', ')})`,
      params,
    )
  }

  if (!ctx.isNative) {
    ctx.requestPersistence()
  }

  dispatchChapterWikiLinksChanged({
    chapterIds: Array.from(affectedChapterIds),
    wikiPageIds: [wikiPageId],
  })
}
