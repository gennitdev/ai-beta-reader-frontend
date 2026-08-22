import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabaseConnection, DatabaseContext } from '@/lib/db/connection'
import * as wikiRepo from '@/lib/db/wikiRepository'

vi.mock('@/utils/chapterWikiLinkEvents', () => ({
  dispatchChapterWikiLinksChanged: vi.fn(),
}))

/**
 * Exercises the wiki repository in isolation against a fake connection that
 * pattern-matches on SQL (so lazy schema detection via PRAGMA works). Drives the
 * synchronous web/desktop path (isNative: false).
 */

interface ExecResult {
  columns: string[]
  values: unknown[][]
}

/**
 * Fake connection whose `exec` is routed by SQL text:
 *  - PRAGMA table_info -> the columns listed in `mentionColumns`
 *  - anything else -> the next scripted result (default [])
 */
function makeContext(options: {
  mentionColumns?: string[]
  execResults?: ExecResult[][]
} = {}) {
  const mentionColumns = options.mentionColumns ?? ['id', 'chapter_id', 'wiki_page_id', 'link_source', 'created_at', 'updated_at']
  const execResults = options.execResults ?? []
  const runCalls: Array<{ sql: string; params?: unknown[] }> = []
  const requestPersistence = vi.fn()
  let execIndex = 0

  const connection: AppDatabaseConnection = {
    open: async () => {},
    close: () => {},
    execute: async () => undefined,
    run: (sql: string, params?: unknown[]) => {
      runCalls.push({ sql, params })
    },
    query: async () => ({ values: [] }),
    exec: (sql: string) => {
      if (sql.includes('PRAGMA table_info')) {
        // PRAGMA table_info columns: cid, name, type, ... — name is index 1
        return [{ columns: [], values: mentionColumns.map((name, i) => [i, name]) }]
      }
      return execResults[execIndex++] ?? []
    },
    export: () => new Uint8Array(),
    exportToJson: async () => undefined,
    prepare: () => {
      throw new Error('not used in these tests')
    },
  }

  const ctx: DatabaseContext = { connection, isNative: false, requestPersistence }
  return { ctx, runCalls, requestPersistence }
}

function makeNativeContext(options: {
  mentionColumns?: string[]
  queryResults?: Array<Array<Record<string, unknown>> | undefined>
} = {}) {
  const mentionColumns = options.mentionColumns
    ?? ['id', 'chapter_id', 'wiki_page_id', 'link_source', 'created_at', 'updated_at']
  const queryResults = options.queryResults ?? []
  const runCalls: Array<{ sql: string; params?: unknown[] }> = []
  let queryIndex = 0
  const connection = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('PRAGMA table_info')) {
        return { values: mentionColumns.map((name) => ({ name })) }
      }
      return { values: queryResults[queryIndex++] }
    }),
    run: vi.fn(async (sql: string, params?: unknown[]) => runCalls.push({ sql, params })),
    execute: vi.fn(async () => undefined),
  } as unknown as AppDatabaseConnection
  const ctx = {
    connection,
    isNative: true,
    requestPersistence: vi.fn(),
    flushPersistence: vi.fn(async () => undefined),
    setImporting: vi.fn(),
  } satisfies DatabaseContext
  return { ctx, connection, runCalls }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('wikiRepository (web path)', () => {
  it('createWikiPage inserts with JSON-encoded aliases and returns an id', async () => {
    // getWikiPages runs first (uniqueness check) -> return no existing pages.
    const { ctx, runCalls, requestPersistence } = makeContext({ execResults: [[]] })

    const id = await wikiRepo.createWikiPage(ctx, {
      book_id: 'book-1',
      page_name: 'Mara',
      content: 'A ranger.',
      summary: 'Protagonist.',
      aliases: ['The Ranger'],
    })

    expect(id).toMatch(/^wiki-book-1-/)
    const insert = runCalls.find((c) => c.sql.includes('INSERT INTO wiki_pages'))
    expect(insert).toBeDefined()
    // aliases are normalized + JSON-encoded; the page name is folded in.
    const aliasesParam = insert!.params?.[6] as string
    expect(() => JSON.parse(aliasesParam)).not.toThrow()
    expect(JSON.parse(aliasesParam)).toEqual(expect.arrayContaining(['The Ranger']))
    expect(requestPersistence).toHaveBeenCalledOnce()
  })

  it('getWikiPageById maps a positional row into a WikiPage', async () => {
    const row = [
      'wiki-1', 'book-1', 'Mara', 'character', 'content', 'summary',
      '[]', null, 0, 1, 'created', 'updated', 0, null,
    ]
    const { ctx } = makeContext({ execResults: [[{ columns: [], values: [row] }]] })

    const page = await wikiRepo.getWikiPageById(ctx, 'wiki-1')

    expect(page).toMatchObject({
      id: 'wiki-1',
      book_id: 'book-1',
      page_name: 'Mara',
      page_type: 'character',
      created_by_ai: true,
      is_pinned: false,
    })
  })

  it('getChapterWikiMentions selects the optional columns when present and maps rows', async () => {
    const mentionRow = ['mention-1', 'ch-1', 'wiki-1', 'manual', 'created', 'updated']
    // exec order after PRAGMA calls: the mentions SELECT.
    const { ctx } = makeContext({
      mentionColumns: ['id', 'chapter_id', 'wiki_page_id', 'link_source', 'created_at', 'updated_at'],
      execResults: [[{ columns: [], values: [mentionRow] }]],
    })

    const mentions = await wikiRepo.getChapterWikiMentions(ctx, 'ch-1')

    expect(mentions).toEqual([
      {
        id: 'mention-1',
        chapter_id: 'ch-1',
        wiki_page_id: 'wiki-1',
        link_source: 'manual',
        created_at: 'created',
        updated_at: 'updated',
      },
    ])
  })

  it('ensureChapterWikiMentionsSchema adds missing columns and indexes', async () => {
    // Report a legacy table missing link_source/updated_at.
    const { ctx, runCalls, requestPersistence } = makeContext({
      mentionColumns: ['id', 'chapter_id', 'wiki_page_id', 'created_at'],
    })

    await wikiRepo.ensureChapterWikiMentionsSchema(ctx)

    const sql = runCalls.map((c) => c.sql)
    expect(sql.some((s) => s.includes('ADD COLUMN link_source'))).toBe(true)
    expect(sql.some((s) => s.includes('ADD COLUMN updated_at'))).toBe(true)
    expect(sql.some((s) => s.includes('CREATE INDEX IF NOT EXISTS idx_chapter_wiki_mentions_chapter'))).toBe(true)
    expect(requestPersistence).toHaveBeenCalled()
  })

  it('maps invalid and optional web wiki page fields to safe defaults', async () => {
    const row = [
      'wiki-1', 'book-1', 'Mara', 'invalid', null, null,
      false, 42, 0, 0, 'created', 'updated', 1, false,
    ]
    const { ctx } = makeContext({ execResults: [[{ columns: [], values: [row] }]] })

    await expect(wikiRepo.getWikiPages(ctx, 'book-1')).resolves.toEqual([{
      id: 'wiki-1',
      book_id: 'book-1',
      page_name: 'Mara',
      page_type: 'character',
      content: '',
      summary: '',
      aliases: null,
      tags: null,
      is_major: false,
      created_by_ai: false,
      created_at: 'created',
      updated_at: 'updated',
      is_pinned: true,
      cover_image_id: null,
    }])
  })

  it('returns null or empty collections for missing web page and link rows', async () => {
    await expect(wikiRepo.getWikiPageById(makeContext({ execResults: [[]] }).ctx, 'missing')).resolves.toBeNull()
    await expect(wikiRepo.getWikiPages(makeContext({ execResults: [[]] }).ctx, 'book-1')).resolves.toEqual([])

    const mentions = makeContext({ execResults: [[]] })
    await expect(wikiRepo.getChapterWikiMentions(mentions.ctx, 'chapter-1')).resolves.toEqual([])
    const chapterLinks = makeContext({ execResults: [[]] })
    await expect(wikiRepo.getChapterWikiLinks(chapterLinks.ctx, 'chapter-1')).resolves.toEqual([])
    const pageLinks = makeContext({ execResults: [[]] })
    await expect(wikiRepo.getWikiPageChapterLinks(pageLinks.ctx, 'wiki-1')).resolves.toEqual([])
  })

  it('maps legacy web mention and link rows without optional columns', async () => {
    const columns = ['id', 'chapter_id', 'wiki_page_id', 'created_at']
    const mentions = makeContext({
      mentionColumns: columns,
      execResults: [[{ columns: [], values: [['m1', 'c1', 'w1', null, 'created', null]] }]],
    })
    await expect(wikiRepo.getChapterWikiMentions(mentions.ctx, 'c1')).resolves.toEqual([{
      id: 'm1', chapter_id: 'c1', wiki_page_id: 'w1', link_source: null,
      created_at: 'created', updated_at: null,
    }])

    const chapterLinks = makeContext({
      mentionColumns: columns,
      execResults: [[{ columns: [], values: [['w1', 'Page', 'invalid', 'unknown', 'created', false]] }]],
    })
    await expect(wikiRepo.getChapterWikiLinks(chapterLinks.ctx, 'c1')).resolves.toEqual([{
      wiki_page_id: 'w1', page_name: 'Page', page_type: 'character', link_source: null,
      created_at: 'created', updated_at: null,
    }])

    const pageLinks = makeContext({
      mentionColumns: columns,
      execResults: [[{ columns: [], values: [['c1', false, 42, 'unknown', 'created', false]] }]],
    })
    await expect(wikiRepo.getWikiPageChapterLinks(pageLinks.ctx, 'w1')).resolves.toEqual([{
      chapter_id: 'c1', chapter_title: null, part_id: null, link_source: null,
      created_at: 'created', updated_at: null,
    }])
  })

  it('writes every optional update and tracking field on the web path', async () => {
    const update = makeContext()
    await wikiRepo.updateWikiPage(update.ctx, 'wiki-1', {
      content: '',
      summary: '',
      tags: '',
      is_pinned: false,
    })
    expect(update.runCalls[0].sql).toContain('content = ?, summary = ?, tags = ?, is_pinned = ?')
    expect(update.runCalls[0].params).toEqual(['', '', '', 0, expect.any(String), 'wiki-1'])
    expect(update.requestPersistence).toHaveBeenCalledOnce()

    const tracking = makeContext()
    await wikiRepo.trackWikiUpdate(tracking.ctx, {
      wiki_page_id: 'wiki-1', chapter_id: 'chapter-1', update_type: 'changed',
    })
    expect(tracking.runCalls[0].params).toEqual([
      expect.stringMatching(/^update-wiki-1-/), 'wiki-1', 'chapter-1', 'changed',
      null, null, expect.any(String),
    ])
  })
})

describe('wikiRepository (native path)', () => {
  it('maps keyed and positional wiki page rows with valid and fallback page types', async () => {
    const keyed = makeNativeContext({ queryResults: [[{
      id: 'wiki-1', book_id: 'book-1', page_name: 'Mara', page_type: 'location',
      content: 'Content', summary: 'Summary', aliases: '[]', tags: '[]', is_major: 1,
      created_by_ai: 1, created_at: 'created', updated_at: 'updated', is_pinned: 0,
      cover_image_id: 'cover-1',
    }]] })
    await expect(wikiRepo.getWikiPages(keyed.ctx, 'book-1')).resolves.toEqual([expect.objectContaining({
      page_type: 'location', aliases: '[]', tags: '[]', is_major: true,
      created_by_ai: true, cover_image_id: 'cover-1',
    })])

    const positionalRow = [
      'wiki-2', 'book-1', 'Page', false, null, null, null, null,
      0, 0, 'created', 'updated', 0, null,
    ] as unknown as Record<string, unknown>
    const positional = makeNativeContext({ queryResults: [[positionalRow]] })
    await expect(wikiRepo.getWikiPageById(positional.ctx, 'wiki-2')).resolves.toEqual(expect.objectContaining({
      id: 'wiki-2', page_type: 'character', content: '', summary: '',
    }))
  })

  it('returns native page defaults when queries have no values', async () => {
    await expect(wikiRepo.getWikiPages(makeNativeContext({ queryResults: [undefined] }).ctx, 'book-1')).resolves.toEqual([])
    await expect(wikiRepo.getWikiPageById(
      makeNativeContext({ queryResults: [undefined] }).ctx,
      'missing',
    )).resolves.toBeNull()
  })

  it('maps native mentions and both link directions', async () => {
    const mentions = makeNativeContext({ queryResults: [[{
      id: 'm1', chapter_id: 'c1', wiki_page_id: 'w1', link_source: 'ai_summary',
      created_at: 'created', updated_at: 'updated',
    }]] })
    await expect(wikiRepo.getChapterWikiMentions(mentions.ctx, 'c1')).resolves.toEqual([expect.objectContaining({
      link_source: 'ai_summary', updated_at: 'updated',
    })])

    const chapterLinks = makeNativeContext({ queryResults: [[{
      wiki_page_id: 'w1', page_name: 'Page', page_type: 'other', link_source: 'manual',
      created_at: 'created', updated_at: 42,
    }]] })
    await expect(wikiRepo.getChapterWikiLinks(chapterLinks.ctx, 'c1')).resolves.toEqual([expect.objectContaining({
      page_type: 'other', link_source: 'manual', updated_at: null,
    })])

    const pageLinks = makeNativeContext({ queryResults: [[{
      chapter_id: 'c1', title: false, part_id: false, link_source: 'unknown',
      created_at: 'created', updated_at: 42,
    }]] })
    await expect(wikiRepo.getWikiPageChapterLinks(pageLinks.ctx, 'w1')).resolves.toEqual([expect.objectContaining({
      chapter_title: null, part_id: null, link_source: null, updated_at: null,
    })])
  })

  it('creates pages and tracks updates using native writes without web persistence', async () => {
    const create = makeNativeContext({ queryResults: [[]] })
    const id = await wikiRepo.createWikiPage(create.ctx, {
      book_id: 'book-1', page_name: 'Mara', content: '', summary: '',
      created_by_ai: false, is_pinned: false,
    })
    expect(id).toMatch(/^wiki-book-1-/)
    expect(create.runCalls[0].params).toEqual(expect.arrayContaining(['character', 0]))
    expect(create.ctx.requestPersistence).not.toHaveBeenCalled()

    const tracking = makeNativeContext()
    await wikiRepo.trackWikiUpdate(tracking.ctx, {
      wiki_page_id: 'wiki-1', chapter_id: 'chapter-1', update_type: 'changed',
      change_summary: 'summary', contradiction_notes: 'notes',
    })
    expect(tracking.runCalls[0].params).toEqual(expect.arrayContaining(['summary', 'notes']))
  })

  it('executes native schema migrations without scheduling web persistence', async () => {
    const native = makeNativeContext({ mentionColumns: ['id', 'created_at'] })
    await wikiRepo.ensureChapterWikiMentionsSchema(native.ctx)

    expect(native.connection.execute).toHaveBeenCalledTimes(5)
    expect(native.ctx.requestPersistence).not.toHaveBeenCalled()
  })
})
