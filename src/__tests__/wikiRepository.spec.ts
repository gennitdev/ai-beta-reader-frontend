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
})
