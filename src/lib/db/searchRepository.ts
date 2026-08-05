/**
 * Repository for full-text search and find-and-replace across a book's chapters
 * and wiki pages, plus the simpler case-preserving single-target replace.
 *
 * Follows the split pattern — every function takes a {@link DatabaseContext}.
 * The web/desktop path uses prepared statements (ctx.connection.prepare) to
 * stream large result sets.
 */

import {
  assertFindReplaceFieldsCurrent,
  createFindReplaceDocument,
  replaceFindReplaceFields,
  type FindReplaceDocument,
  type FindReplaceSearchRequest,
  type ReplaceFindReplaceMatchesRequest,
  type ReplaceFindReplaceMatchesResult,
  type RestoreFindReplaceFieldsRequest,
} from '@/lib/findReplace'
import { dispatchChapterWikiLinksChanged } from '@/utils/chapterWikiLinkEvents'
import type { DatabaseContext } from './connection'
import { readQueryRowValue } from './rowUtils'

export interface SearchChapterResult {
  id: string
  title: string
  text: string
  word_count: number
  position: number
}

export interface SearchWikiPageResult {
  id: string
  page_name: string
  content: string
  summary: string
  page_type: string
}

export async function searchBook(ctx: DatabaseContext, bookId: string, searchTerm: string): Promise<{
  chapters: SearchChapterResult[]
  wikiPages: SearchWikiPageResult[]
}> {
  const searchLower = searchTerm.toLowerCase()
  const chapters: SearchChapterResult[] = []
  const wikiPages: SearchWikiPageResult[] = []

  // Search in chapters
  const chaptersQuery = `SELECT id, title, text, word_count FROM chapters WHERE book_id = ?`

  if (ctx.isNative) {
    const result = await ctx.connection.query(chaptersQuery, [bookId])
    result.values?.forEach((row: Record<string, unknown> | unknown[], index: number) => {
      // Handle both object and array formats from native SQLite
      const title = String((Array.isArray(row) ? row[1] : row.title) ?? '')
      const text = String((Array.isArray(row) ? row[2] : row.text) ?? '')
      const id = String(Array.isArray(row) ? row[0] : row.id)
      const wordCount = Number(Array.isArray(row) ? row[3] : row.word_count)
      if (
        (title && title.toLowerCase().includes(searchLower)) ||
        text.toLowerCase().includes(searchLower)
      ) {
        chapters.push({
          id: id,
          title: title,
          text: text,
          word_count: wordCount,
          position: index,
        })
      }
    })
  } else {
    const stmt = ctx.connection.prepare(chaptersQuery)
    stmt.bind([bookId])
    let position = 0
    while (stmt.step()) {
      const row = stmt.getAsObject()
      const title = (row.title as string) || ''
      const text = (row.text as string) || ''
      if (
        (title && title.toLowerCase().includes(searchLower)) ||
        text.toLowerCase().includes(searchLower)
      ) {
        chapters.push({
          id: String(row.id),
          title: title,
          text: text,
          word_count: Number(row.word_count ?? 0),
          position: position,
        })
      }
      position++
    }
    stmt.free()
  }

  // Search in wiki pages
  const wikiQuery = `SELECT id, page_name, content, summary, page_type FROM wiki_pages WHERE book_id = ?`

  if (ctx.isNative) {
    const result = await ctx.connection.query(wikiQuery, [bookId])
    result.values?.forEach((row: Record<string, unknown> | unknown[]) => {
      // Handle both object and array formats from native SQLite
      const id = String(Array.isArray(row) ? row[0] : row.id)
      const pageName = String((Array.isArray(row) ? row[1] : row.page_name) ?? '')
      const content = String((Array.isArray(row) ? row[2] : row.content) ?? '')
      const summary = String((Array.isArray(row) ? row[3] : row.summary) ?? '')
      const pageType = String((Array.isArray(row) ? row[4] : row.page_type) ?? '')
      if (pageName.toLowerCase().includes(searchLower) ||
          content.toLowerCase().includes(searchLower) ||
          summary.toLowerCase().includes(searchLower)) {
        wikiPages.push({
          id: id,
          page_name: pageName,
          content: content,
          summary: summary,
          page_type: pageType,
        })
      }
    })
  } else {
    const stmt = ctx.connection.prepare(wikiQuery)
    stmt.bind([bookId])
    while (stmt.step()) {
      const row = stmt.getAsObject()
      const pageName = (row.page_name as string) || ''
      const content = (row.content as string) || ''
      const summary = (row.summary as string) || ''
      if (pageName.toLowerCase().includes(searchLower) ||
          content.toLowerCase().includes(searchLower) ||
          summary.toLowerCase().includes(searchLower)) {
        wikiPages.push({
          id: String(row.id),
          page_name: pageName,
          content: content,
          summary: summary,
          page_type: String(row.page_type ?? ''),
        })
      }
    }
    stmt.free()
  }

  return { chapters, wikiPages }
}

export async function findReplaceMatches(ctx: DatabaseContext, request: FindReplaceSearchRequest): Promise<FindReplaceDocument[]> {
  const { bookId, searchTerm, scope = 'book', targetId } = request
  if (!searchTerm) return []
  if (scope !== 'book' && !targetId) {
    throw new Error(`A target ID is required for ${scope}-scoped search`)
  }

  const documents: FindReplaceDocument[] = []

  if (scope !== 'wikiPage') {
    const chapterQuery = `
      SELECT id, title, text, word_count
      FROM chapters
      WHERE book_id = ?${scope === 'chapter' ? ' AND id = ?' : ''}
    `
    const chapterParams = scope === 'chapter' ? [bookId, targetId] : [bookId]

    if (ctx.isNative) {
      const result = await ctx.connection.query(chapterQuery, chapterParams)
      result.values?.forEach((row: Record<string, unknown>) => {
        const id = String(readQueryRowValue(row, 0, 'id') ?? '')
        const title = String(readQueryRowValue(row, 1, 'title') ?? '')
        const text = String(readQueryRowValue(row, 2, 'text') ?? '')
        const wordCount = Number(readQueryRowValue(row, 3, 'word_count') ?? 0)
        const document = createFindReplaceDocument({
          targetType: 'chapter',
          targetId: id,
          displayName: title || 'Untitled chapter',
          wordCount,
          fields: { title, text },
          searchTerm,
        })
        if (document.matches.length > 0) documents.push(document)
      })
    } else {
      const stmt = ctx.connection.prepare(chapterQuery)
      stmt.bind(chapterParams)
      while (stmt.step()) {
        const row = stmt.getAsObject()
        const id = String(row.id ?? '')
        const title = String(row.title ?? '')
        const text = String(row.text ?? '')
        const document = createFindReplaceDocument({
          targetType: 'chapter',
          targetId: id,
          displayName: title || 'Untitled chapter',
          wordCount: Number(row.word_count ?? 0),
          fields: { title, text },
          searchTerm,
        })
        if (document.matches.length > 0) documents.push(document)
      }
      stmt.free()
    }
  }

  if (scope !== 'chapter') {
    const wikiQuery = `
      SELECT id, page_name, content, summary, page_type
      FROM wiki_pages
      WHERE book_id = ?${scope === 'wikiPage' ? ' AND id = ?' : ''}
    `
    const wikiParams = scope === 'wikiPage' ? [bookId, targetId] : [bookId]

    if (ctx.isNative) {
      const result = await ctx.connection.query(wikiQuery, wikiParams)
      result.values?.forEach((row: Record<string, unknown>) => {
        const id = String(readQueryRowValue(row, 0, 'id') ?? '')
        const pageName = String(readQueryRowValue(row, 1, 'page_name') ?? '')
        const content = String(readQueryRowValue(row, 2, 'content') ?? '')
        const summary = String(readQueryRowValue(row, 3, 'summary') ?? '')
        const pageType = String(readQueryRowValue(row, 4, 'page_type') ?? '')
        const document = createFindReplaceDocument({
          targetType: 'wikiPage',
          targetId: id,
          displayName: pageName || 'Untitled wiki page',
          pageType,
          fields: { page_name: pageName, summary, content },
          searchTerm,
        })
        if (document.matches.length > 0) documents.push(document)
      })
    } else {
      const stmt = ctx.connection.prepare(wikiQuery)
      stmt.bind(wikiParams)
      while (stmt.step()) {
        const row = stmt.getAsObject()
        const id = String(row.id ?? '')
        const pageName = String(row.page_name ?? '')
        const document = createFindReplaceDocument({
          targetType: 'wikiPage',
          targetId: id,
          displayName: pageName || 'Untitled wiki page',
          pageType: String(row.page_type ?? ''),
          fields: {
            page_name: pageName,
            summary: String(row.summary ?? ''),
            content: String(row.content ?? ''),
          },
          searchTerm,
        })
        if (document.matches.length > 0) documents.push(document)
      }
      stmt.free()
    }
  }

  return documents
}

export async function replaceFindReplaceMatches(
  ctx: DatabaseContext,
  request: ReplaceFindReplaceMatchesRequest,
): Promise<ReplaceFindReplaceMatchesResult> {
  if (request.matches.length === 0) {
    return { replacedCount: 0, fields: { ...request.expectedFields } }
  }

  if (request.targetType === 'chapter') {
    const getQuery = `SELECT title, text FROM chapters WHERE id = ?`
    let title: string | null = null
    let text = ''

    if (ctx.isNative) {
      const result = await ctx.connection.query(getQuery, [request.targetId])
      const row = result.values?.[0]
      if (!row) throw new Error('Chapter not found')
      const titleValue = readQueryRowValue(row, 0, 'title')
      title = typeof titleValue === 'string' ? titleValue : null
      text = String(readQueryRowValue(row, 1, 'text') ?? '')
    } else {
      const stmt = ctx.connection.prepare(getQuery)
      stmt.bind([request.targetId])
      if (!stmt.step()) {
        stmt.free()
        throw new Error('Chapter not found')
      }
      const row = stmt.getAsObject()
      title = (row.title as string) ?? null
      text = String(row.text ?? '')
      stmt.free()
    }

    const result = replaceFindReplaceFields(
      { title: title ?? '', text },
      request.expectedFields,
      request.matches,
      request.replacement,
    )
    const updatedTitle = title === null ? null : (result.fields.title ?? title)
    const updatedText = result.fields.text ?? text
    const trimmedText = updatedText.trim()
    const wordCount = trimmedText ? trimmedText.split(/\s+/).length : 0
    const updateQuery = `UPDATE chapters SET title = ?, text = ?, word_count = ? WHERE id = ?`
    const params = [updatedTitle, updatedText, wordCount, request.targetId]

    if (ctx.isNative) {
      await ctx.connection.run(updateQuery, params)
    } else {
      ctx.connection.run(updateQuery, params)
      ctx.requestPersistence()
    }

    dispatchChapterWikiLinksChanged({ chapterIds: [request.targetId], wikiPageIds: [] })
    return result
  }

  const getQuery = `SELECT page_name, content, summary FROM wiki_pages WHERE id = ?`
  let pageName = ''
  let content = ''
  let summary = ''

  if (ctx.isNative) {
    const result = await ctx.connection.query(getQuery, [request.targetId])
    const row = result.values?.[0]
    if (!row) throw new Error('Wiki page not found')
    pageName = String(readQueryRowValue(row, 0, 'page_name') ?? '')
    content = String(readQueryRowValue(row, 1, 'content') ?? '')
    summary = String(readQueryRowValue(row, 2, 'summary') ?? '')
  } else {
    const stmt = ctx.connection.prepare(getQuery)
    stmt.bind([request.targetId])
    if (!stmt.step()) {
      stmt.free()
      throw new Error('Wiki page not found')
    }
    const row = stmt.getAsObject()
    pageName = String(row.page_name ?? '')
    content = String(row.content ?? '')
    summary = String(row.summary ?? '')
    stmt.free()
  }

  const result = replaceFindReplaceFields(
    { page_name: pageName, summary, content },
    request.expectedFields,
    request.matches,
    request.replacement,
  )
  const now = new Date().toISOString()
  const updateQuery = `
    UPDATE wiki_pages
    SET page_name = ?, content = ?, summary = ?, updated_at = ?
    WHERE id = ?
  `
  const params = [
    result.fields.page_name ?? pageName,
    result.fields.content ?? content,
    result.fields.summary ?? summary,
    now,
    request.targetId,
  ]

  if (ctx.isNative) {
    await ctx.connection.run(updateQuery, params)
  } else {
    ctx.connection.run(updateQuery, params)
    ctx.requestPersistence()
  }

  dispatchChapterWikiLinksChanged({ chapterIds: [], wikiPageIds: [request.targetId] })
  return result
}

export async function restoreFindReplaceFields(ctx: DatabaseContext, request: RestoreFindReplaceFieldsRequest): Promise<void> {
  if (request.targetType === 'chapter') {
    const getQuery = `SELECT title, text FROM chapters WHERE id = ?`
    let currentTitle = ''
    let currentText = ''

    if (ctx.isNative) {
      const result = await ctx.connection.query(getQuery, [request.targetId])
      const row = result.values?.[0]
      if (!row) throw new Error('Chapter not found')
      currentTitle = String(readQueryRowValue(row, 0, 'title') ?? '')
      currentText = String(readQueryRowValue(row, 1, 'text') ?? '')
    } else {
      const stmt = ctx.connection.prepare(getQuery)
      stmt.bind([request.targetId])
      if (!stmt.step()) {
        stmt.free()
        throw new Error('Chapter not found')
      }
      const row = stmt.getAsObject()
      currentTitle = String(row.title ?? '')
      currentText = String(row.text ?? '')
      stmt.free()
    }

    const currentFields = { title: currentTitle, text: currentText }
    assertFindReplaceFieldsCurrent(currentFields, request.expectedFields, 'replacement')

    const restoredTitle = request.fields.title ?? currentTitle
    const restoredText = request.fields.text ?? currentText
    const trimmedText = restoredText.trim()
    const wordCount = trimmedText ? trimmedText.split(/\s+/).length : 0
    const updateQuery = `UPDATE chapters SET title = ?, text = ?, word_count = ? WHERE id = ?`
    const params = [restoredTitle, restoredText, wordCount, request.targetId]

    if (ctx.isNative) {
      await ctx.connection.run(updateQuery, params)
    } else {
      ctx.connection.run(updateQuery, params)
      ctx.requestPersistence()
    }

    dispatchChapterWikiLinksChanged({ chapterIds: [request.targetId], wikiPageIds: [] })
    return
  }

  const getQuery = `SELECT page_name, content, summary FROM wiki_pages WHERE id = ?`
  let currentPageName = ''
  let currentContent = ''
  let currentSummary = ''

  if (ctx.isNative) {
    const result = await ctx.connection.query(getQuery, [request.targetId])
    const row = result.values?.[0]
    if (!row) throw new Error('Wiki page not found')
    currentPageName = String(readQueryRowValue(row, 0, 'page_name') ?? '')
    currentContent = String(readQueryRowValue(row, 1, 'content') ?? '')
    currentSummary = String(readQueryRowValue(row, 2, 'summary') ?? '')
  } else {
    const stmt = ctx.connection.prepare(getQuery)
    stmt.bind([request.targetId])
    if (!stmt.step()) {
      stmt.free()
      throw new Error('Wiki page not found')
    }
    const row = stmt.getAsObject()
    currentPageName = String(row.page_name ?? '')
    currentContent = String(row.content ?? '')
    currentSummary = String(row.summary ?? '')
    stmt.free()
  }

  const currentFields = {
    page_name: currentPageName,
    summary: currentSummary,
    content: currentContent,
  }
  assertFindReplaceFieldsCurrent(currentFields, request.expectedFields, 'replacement')

  const updateQuery = `
    UPDATE wiki_pages
    SET page_name = ?, content = ?, summary = ?, updated_at = ?
    WHERE id = ?
  `
  const params = [
    request.fields.page_name ?? currentPageName,
    request.fields.content ?? currentContent,
    request.fields.summary ?? currentSummary,
    new Date().toISOString(),
    request.targetId,
  ]

  if (ctx.isNative) {
    await ctx.connection.run(updateQuery, params)
  } else {
    ctx.connection.run(updateQuery, params)
    ctx.requestPersistence()
  }

  dispatchChapterWikiLinksChanged({ chapterIds: [], wikiPageIds: [request.targetId] })
}

/** Escape a search term and build a case-insensitive global RegExp. */
function buildReplaceRegex(searchTerm: string): RegExp {
  return new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
}

/** Replace matches while preserving the case pattern of each matched span. */
function replaceWithCasePreservation(text: string, regex: RegExp, replaceTerm: string): string {
  return text.replace(regex, (match) => {
    if (match === match.toUpperCase() && match.length > 1) {
      // All caps -> make replacement all caps
      return replaceTerm.toUpperCase()
    } else if (match[0] === match[0].toUpperCase()) {
      // First letter capitalized -> capitalize replacement
      return replaceTerm.charAt(0).toUpperCase() + replaceTerm.slice(1)
    } else {
      // Lowercase -> use replacement as-is
      return replaceTerm
    }
  })
}

export async function replaceInChapter(ctx: DatabaseContext, chapterId: string, searchTerm: string, replaceTerm: string): Promise<void> {
  // Get current chapter
  const getQuery = `SELECT title, text FROM chapters WHERE id = ?`
  let currentTitle: string | null = null
  let currentText = ''

  if (ctx.isNative) {
    const result = await ctx.connection.query(getQuery, [chapterId])
    if (result.values && result.values.length > 0) {
      const titleValue = readQueryRowValue(result.values[0], 0, 'title')
      const textValue = readQueryRowValue(result.values[0], 1, 'text')
      currentTitle = typeof titleValue === 'string' ? titleValue : null
      currentText = String(textValue ?? '')
    }
  } else {
    const stmt = ctx.connection.prepare(getQuery)
    stmt.bind([chapterId])
    if (stmt.step()) {
      const row = stmt.getAsObject()
      currentTitle = (row.title as string) ?? null
      currentText = (row.text as string) || ''
    }
    stmt.free()
  }

  // Perform replacement (case-insensitive but preserves the case pattern of replacement)
  const regex = buildReplaceRegex(searchTerm)
  const newText = replaceWithCasePreservation(currentText, regex, replaceTerm)
  const newTitle = currentTitle !== null ? replaceWithCasePreservation(currentTitle, regex, replaceTerm) : null

  // Update chapter
  const updateQuery = `UPDATE chapters SET title = ?, text = ?, word_count = ? WHERE id = ?`
  const wordCount = newText.trim().split(/\s+/).length

  if (ctx.isNative) {
    await ctx.connection.run(updateQuery, [newTitle, newText, wordCount, chapterId])
  } else {
    ctx.connection.run(updateQuery, [newTitle, newText, wordCount, chapterId])
    ctx.requestPersistence()
  }
}

export async function replaceInWikiPage(ctx: DatabaseContext, wikiPageId: string, searchTerm: string, replaceTerm: string): Promise<void> {
  // Get current wiki page
  const getQuery = `SELECT page_name, content, summary FROM wiki_pages WHERE id = ?`
  let pageName = ''
  let content = ''
  let summary = ''

  if (ctx.isNative) {
    const result = await ctx.connection.query(getQuery, [wikiPageId])
    if (result.values && result.values.length > 0) {
      pageName = String(readQueryRowValue(result.values[0], 0, 'page_name') ?? '')
      content = String(readQueryRowValue(result.values[0], 1, 'content') ?? '')
      summary = String(readQueryRowValue(result.values[0], 2, 'summary') ?? '')
    }
  } else {
    const stmt = ctx.connection.prepare(getQuery)
    stmt.bind([wikiPageId])
    if (stmt.step()) {
      const row = stmt.getAsObject()
      pageName = (row.page_name as string) || ''
      content = (row.content as string) || ''
      summary = (row.summary as string) || ''
    }
    stmt.free()
  }

  // Perform replacements (case-insensitive but preserves the case pattern)
  const regex = buildReplaceRegex(searchTerm)
  const newPageName = replaceWithCasePreservation(pageName, regex, replaceTerm)
  const newContent = replaceWithCasePreservation(content, regex, replaceTerm)
  const newSummary = replaceWithCasePreservation(summary, regex, replaceTerm)

  // Update wiki page
  const now = new Date().toISOString()
  const updateQuery = `UPDATE wiki_pages SET page_name = ?, content = ?, summary = ?, updated_at = ? WHERE id = ?`

  if (ctx.isNative) {
    await ctx.connection.run(updateQuery, [newPageName, newContent, newSummary, now, wikiPageId])
  } else {
    ctx.connection.run(updateQuery, [newPageName, newContent, newSummary, now, wikiPageId])
    ctx.requestPersistence()
  }
}
