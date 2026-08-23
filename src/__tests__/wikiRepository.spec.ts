import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabaseConnection, DatabaseContext } from '@/lib/db/connection'
import * as wikiRepo from '@/lib/db/wikiRepository'
import { dispatchChapterWikiLinksChanged } from '@/utils/chapterWikiLinkEvents'

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
  const flushPersistence = vi.fn(async () => undefined)
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

  const ctx: DatabaseContext = {
    connection,
    isNative: false,
    requestPersistence,
    flushPersistence,
    setImporting: vi.fn(),
  }
  return { ctx, runCalls, requestPersistence, flushPersistence }
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

  it('normalizes aliases during identity-aware page updates', async () => {
    const current = [
      'wiki-1', 'book-1', 'Mara', 'character', 'content', 'summary',
      '["Ranger"]', null, 0, 0, 'created', 'updated', 0, null,
    ]
    const { ctx, runCalls, requestPersistence } = makeContext({
      execResults: [
        [{ columns: [], values: [current] }],
        [{ columns: [], values: [current] }],
      ],
    })

    await wikiRepo.updateWikiPage(ctx, 'wiki-1', {
      page_name: 'Mara Vale',
      aliases: [' Ranger ', 'Mara Vale', 'The Scout'],
    })

    expect(runCalls[0].sql).toContain('page_name = ?, aliases = ?, updated_at = ?')
    expect(runCalls[0].params).toEqual([
      'Mara Vale', JSON.stringify(['Ranger', 'The Scout']), expect.any(String), 'wiki-1',
    ])
    expect(requestPersistence).toHaveBeenCalledOnce()
  })

  it('rejects identity updates for a missing page', async () => {
    const { ctx, runCalls } = makeContext({ execResults: [[]] })

    await expect(wikiRepo.updateWikiPage(ctx, 'missing', { aliases: ['Alias'] }))
      .rejects.toThrow('Wiki page not found')
    expect(runCalls).toEqual([])
  })

  it('resolves a wiki page by a normalized alias', async () => {
    const row = [
      'wiki-1', 'book-1', 'Mara', 'character', '', '', '["The Ranger"]', null,
      0, 0, 'created', 'updated', 0, null,
    ]
    const { ctx } = makeContext({ execResults: [[{ columns: [], values: [row] }]] })

    await expect(wikiRepo.getWikiPage(ctx, 'book-1', ' the ranger '))
      .resolves.toEqual(expect.objectContaining({ id: 'wiki-1' }))
  })

  it('deletes a page and all dependent rows in one web transaction', async () => {
    const { ctx, runCalls, requestPersistence, flushPersistence } = makeContext()

    await wikiRepo.deleteWikiPage(ctx, 'wiki-1')

    expect(runCalls.map(({ sql }) => sql.trim().split(' ')[0])).toEqual([
      'BEGIN', 'DELETE', 'DELETE', 'DELETE', 'DELETE', 'DELETE', 'COMMIT',
    ])
    expect(runCalls.filter(({ sql }) => sql.includes('DELETE')).map(({ params }) => params))
      .toEqual([['wiki-1'], ['wiki-1'], ['wiki-1'], ['wiki-1'], ['wiki-1']])
    expect(requestPersistence).toHaveBeenCalledOnce()
    expect(flushPersistence).toHaveBeenCalledOnce()
  })

  it('adds mentions with and without optional schema columns', async () => {
    const modern = makeContext()
    await wikiRepo.addChapterWikiMention(modern.ctx, 'chapter-1', 'wiki-1', 'ai_summary')
    const modernInsert = modern.runCalls.find(({ sql }) => sql.includes('INSERT OR REPLACE'))
    expect(modernInsert?.sql).toContain('link_source')
    expect(modernInsert?.sql).toContain('updated_at')
    expect(modernInsert?.params).toEqual(expect.arrayContaining(['ai_summary']))
    expect(modern.requestPersistence).toHaveBeenCalled()

    const legacy = makeContext({
      mentionColumns: ['id', 'chapter_id', 'wiki_page_id', 'created_at'],
    })
    await wikiRepo.addChapterWikiMention(legacy.ctx, 'chapter-2', 'wiki-2')
    const legacyInsert = legacy.runCalls.find(({ sql }) => sql.includes('INSERT OR REPLACE'))
    expect(legacyInsert?.sql).not.toContain('link_source')
    expect(legacyInsert?.sql).not.toContain('updated_at')

    expect(dispatchChapterWikiLinksChanged).toHaveBeenCalledWith({
      chapterIds: ['chapter-1'], wikiPageIds: ['wiki-1'],
    })
    expect(dispatchChapterWikiLinksChanged).toHaveBeenCalledWith({
      chapterIds: ['chapter-2'], wikiPageIds: ['wiki-2'],
    })
  })

  it('sets chapter links by deleting stale rows, deduplicating ids, and preserving creation time', async () => {
    const existingRows = [
      ['mention-old', 'chapter-1', 'wiki-old', 'manual', 'created-old', 'updated-old'],
      ['mention-keep', 'chapter-1', 'wiki-keep', 'manual', 'created-keep', 'updated-keep'],
    ]
    const { ctx, runCalls, requestPersistence } = makeContext({
      execResults: [[{ columns: [], values: existingRows }]],
    })

    await wikiRepo.setChapterWikiLinks(
      ctx,
      'chapter-1',
      ['wiki-keep', 'wiki-new', 'wiki-new'],
      'ai_summary',
    )

    const mutations = runCalls.filter(({ sql }) =>
      sql.includes('DELETE FROM chapter_wiki_mentions') || sql.includes('INSERT OR REPLACE'),
    )
    expect(mutations).toHaveLength(3)
    expect(mutations[0].params).toEqual(['mention-old'])
    expect(mutations[1].params).toEqual(expect.arrayContaining(['wiki-keep', 'created-keep']))
    expect(mutations[2].params).toEqual(expect.arrayContaining(['wiki-new', 'ai_summary']))
    expect(requestPersistence).toHaveBeenCalled()
    expect(dispatchChapterWikiLinksChanged).toHaveBeenCalledWith({
      chapterIds: ['chapter-1'],
      wikiPageIds: expect.arrayContaining(['wiki-old', 'wiki-keep', 'wiki-new']),
    })
  })

  it('ensures only missing chapter links and skips persistence when nothing changes', async () => {
    const existingRow = ['mention-keep', 'chapter-1', 'wiki-keep', 'manual', 'created', 'updated']
    const changes = makeContext({
      execResults: [[{ columns: [], values: [existingRow] }]],
    })
    await wikiRepo.ensureChapterWikiLinks(
      changes.ctx,
      'chapter-1',
      ['wiki-keep', 'wiki-new', 'wiki-new'],
    )
    const inserts = changes.runCalls.filter(({ sql }) => sql.includes('INSERT OR REPLACE'))
    expect(inserts).toHaveLength(1)
    expect(inserts[0].params).toEqual(expect.arrayContaining(['wiki-new']))
    expect(changes.requestPersistence).toHaveBeenCalled()
    expect(dispatchChapterWikiLinksChanged).toHaveBeenCalledWith({
      chapterIds: ['chapter-1'], wikiPageIds: ['wiki-new'],
    })

    vi.clearAllMocks()
    const noChanges = makeContext({
      execResults: [[{ columns: [], values: [existingRow] }]],
    })
    await wikiRepo.ensureChapterWikiLinks(noChanges.ctx, 'chapter-1', ['wiki-keep'])
    expect(noChanges.runCalls.some(({ sql }) => sql.includes('INSERT OR REPLACE'))).toBe(false)
    // Schema checks schedule persistence on web; the no-op link operation must
    // not add a third persistence request of its own.
    expect(noChanges.requestPersistence).toHaveBeenCalledTimes(2)
    expect(dispatchChapterWikiLinksChanged).not.toHaveBeenCalled()

    await wikiRepo.ensureChapterWikiLinks(noChanges.ctx, 'chapter-1', [])
    expect(dispatchChapterWikiLinksChanged).not.toHaveBeenCalled()
  })

  it('sets wiki-page chapter links in the reverse direction', async () => {
    const existingRows = [
      ['chapter-old', 'Old', null, 'manual', 'created-old', 'updated-old'],
      ['chapter-keep', 'Keep', 'part-1', 'manual', 'created-keep', 'updated-keep'],
    ]
    const { ctx, runCalls, requestPersistence } = makeContext({
      execResults: [[{ columns: [], values: existingRows }]],
    })

    await wikiRepo.setWikiPageChapterLinks(
      ctx,
      'wiki-1',
      ['chapter-keep', 'chapter-new', 'chapter-new'],
      'ai_summary',
    )

    const mutations = runCalls.filter(({ sql }) =>
      sql.includes('DELETE FROM chapter_wiki_mentions') || sql.includes('INSERT OR REPLACE'),
    )
    expect(mutations).toHaveLength(3)
    expect(mutations[0].params).toEqual(['chapter-old', 'wiki-1'])
    expect(mutations[1].params).toEqual(expect.arrayContaining(['chapter-keep', 'created-keep']))
    expect(mutations[2].params).toEqual(expect.arrayContaining(['chapter-new', 'wiki-1']))
    expect(requestPersistence).toHaveBeenCalled()
    expect(dispatchChapterWikiLinksChanged).toHaveBeenCalledWith({
      chapterIds: expect.arrayContaining(['chapter-old', 'chapter-keep', 'chapter-new']),
      wikiPageIds: ['wiki-1'],
    })
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

  it('runs page and link mutations through native async writes', async () => {
    const update = makeNativeContext()
    await wikiRepo.updateWikiPage(update.ctx, 'wiki-1', { content: 'updated' })
    expect(update.runCalls[0].sql).toContain('UPDATE wiki_pages')

    const deletion = makeNativeContext()
    await wikiRepo.deleteWikiPage(deletion.ctx, 'wiki-1')
    expect(deletion.runCalls.filter(({ sql }) => sql.includes('DELETE'))).toHaveLength(5)
    expect(deletion.ctx.requestPersistence).not.toHaveBeenCalled()

    const addition = makeNativeContext()
    await wikiRepo.addChapterWikiMention(addition.ctx, 'chapter-1', 'wiki-1')
    expect(addition.runCalls.some(({ sql }) => sql.includes('INSERT OR REPLACE'))).toBe(true)

    const chapterLinks = makeNativeContext({ queryResults: [[]] })
    await wikiRepo.setChapterWikiLinks(chapterLinks.ctx, 'chapter-1', ['wiki-1'])
    expect(chapterLinks.runCalls.some(({ sql }) => sql.includes('INSERT OR REPLACE'))).toBe(true)

    const ensuredLinks = makeNativeContext({ queryResults: [[]] })
    await wikiRepo.ensureChapterWikiLinks(ensuredLinks.ctx, 'chapter-1', ['wiki-1'])
    expect(ensuredLinks.runCalls.some(({ sql }) => sql.includes('INSERT OR REPLACE'))).toBe(true)

    const pageLinks = makeNativeContext({ queryResults: [[]] })
    await wikiRepo.setWikiPageChapterLinks(pageLinks.ctx, 'wiki-1', ['chapter-1'])
    expect(pageLinks.runCalls.some(({ sql }) => sql.includes('INSERT OR REPLACE'))).toBe(true)
  })

  it('logs and continues when an individual schema statement fails', async () => {
    const native = makeNativeContext({ mentionColumns: ['id', 'created_at'] })
    const failure = new Error('duplicate column')
    native.connection.execute = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(wikiRepo.ensureChapterWikiMentionsSchema(native.ctx)).resolves.toBeUndefined()

    expect(console.warn).toHaveBeenCalledWith(
      '[AppDatabase] Failed to ensure chapter_wiki_mentions schema:',
      expect.stringContaining('ADD COLUMN link_source'),
      failure,
    )
    expect(native.connection.execute).toHaveBeenCalledTimes(5)
  })
})
