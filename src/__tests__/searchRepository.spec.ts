import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AppDatabaseConnection,
  DatabaseContext,
  QueryResultRowStatement,
} from '@/lib/db/connection'
import {
  findReplaceMatches,
  replaceFindReplaceMatches,
  replaceInChapter,
  replaceInWikiPage,
  restoreFindReplaceFields,
  searchBook,
} from '@/lib/db/searchRepository'
import { createFindReplaceDocument } from '@/lib/findReplace'

const dispatchChapterWikiLinksChanged = vi.hoisted(() => vi.fn())

vi.mock('@/utils/chapterWikiLinkEvents', () => ({ dispatchChapterWikiLinksChanged }))

interface Call {
  sql: string
  params?: unknown[]
}

function makeStatement(rows: Array<Record<string, unknown>>, calls: Call[], sql: string): QueryResultRowStatement {
  let index = -1
  return {
    bind: (params) => calls.push({ sql, params }),
    step: () => {
      index += 1
      return index < rows.length
    },
    getAsObject: () => rows[index],
    free: vi.fn(),
  }
}

function makeWebContext(preparedRows: Array<Array<Record<string, unknown>>> = []) {
  const prepareCalls: Call[] = []
  const runCalls: Call[] = []
  const requestPersistence = vi.fn()
  let prepareIndex = 0
  const connection: AppDatabaseConnection = {
    open: async () => undefined,
    close: () => undefined,
    execute: async () => undefined,
    run: (sql, params) => runCalls.push({ sql, params }),
    query: async () => ({ values: [] }),
    exec: () => [],
    export: () => new Uint8Array(),
    exportToJson: async () => undefined,
    prepare: (sql) => makeStatement(preparedRows[prepareIndex++] ?? [], prepareCalls, sql),
  }
  const ctx: DatabaseContext = {
    connection,
    isNative: false,
    requestPersistence,
    flushPersistence: async () => undefined,
    setImporting: vi.fn(),
  }
  return { ctx, prepareCalls, runCalls, requestPersistence }
}

function makeNativeContext(queryResults: Array<Array<Record<string, unknown>>> = []) {
  const queryCalls: Call[] = []
  const runCalls: Call[] = []
  let queryIndex = 0
  const connection = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queryCalls.push({ sql, params })
      return { values: queryResults[queryIndex++] ?? [] }
    }),
    run: vi.fn(async (sql: string, params?: unknown[]) => {
      runCalls.push({ sql, params })
    }),
  } as unknown as AppDatabaseConnection
  const ctx: DatabaseContext = {
    connection,
    isNative: true,
    requestPersistence: vi.fn(),
    flushPersistence: async () => undefined,
    setImporting: vi.fn(),
  }
  return { ctx, queryCalls, runCalls }
}

beforeEach(() => vi.clearAllMocks())

describe('searchRepository search paths', () => {
  it('searches web chapter and wiki rows case-insensitively and preserves chapter position', async () => {
    const { ctx, prepareCalls } = makeWebContext([
      [
        { id: 'c1', title: 'Quiet', text: 'nothing here', word_count: 2 },
        { id: 'c2', title: 'The Dragon', text: 'awakens', word_count: 2 },
      ],
      [
        { id: 'w1', page_name: 'Keep', content: 'A dragon sleeps', summary: '', page_type: 'place' },
        { id: 'w2', page_name: 'Mara', content: 'Ranger', summary: '', page_type: 'character' },
      ],
    ])

    const result = await searchBook(ctx, 'book-1', 'DRAGON')

    expect(result.chapters).toEqual([
      { id: 'c2', title: 'The Dragon', text: 'awakens', word_count: 2, position: 1 },
    ])
    expect(result.wikiPages.map((page) => page.id)).toEqual(['w1'])
    expect(prepareCalls.map((call) => call.params)).toEqual([['book-1'], ['book-1']])
  })

  it('supports positional and keyed native rows', async () => {
    const { ctx } = makeNativeContext([
      [
        ['c1', 'Needle', 'haystack', 1] as unknown as Record<string, unknown>,
        { id: 'c2', title: 'Other', text: 'a NEEDLE appears', word_count: 3 },
      ],
      [
        ['w1', 'Needle Hall', '', '', 'place'] as unknown as Record<string, unknown>,
      ],
    ])

    const result = await searchBook(ctx, 'book-1', 'needle')

    expect(result.chapters).toHaveLength(2)
    expect(result.chapters[0]).toMatchObject({ id: 'c1', position: 0 })
    expect(result.wikiPages[0]).toMatchObject({ id: 'w1', page_type: 'place' })
  })

  it('builds book and target-scoped match documents', async () => {
    const { ctx, prepareCalls } = makeWebContext([
      [{ id: 'c1', title: 'Jon Returns', text: 'Jon arrived.', word_count: 2 }],
      [{ id: 'w1', page_name: 'Jon', content: 'Jon lives here.', summary: '', page_type: 'character' }],
    ])

    const documents = await findReplaceMatches(ctx, { bookId: 'b1', searchTerm: 'jon' })

    expect(documents.map((document) => document.targetType)).toEqual(['chapter', 'wikiPage'])
    expect(documents.flatMap((document) => document.matches)).toHaveLength(4)
    expect(prepareCalls).toHaveLength(2)

    const chapterOnly = makeWebContext([
      [{ id: 'c1', title: '', text: 'Jon', word_count: 1 }],
    ])
    const scoped = await findReplaceMatches(chapterOnly.ctx, {
      bookId: 'b1',
      searchTerm: 'jon',
      scope: 'chapter',
      targetId: 'c1',
    })
    expect(scoped[0].displayName).toBe('Untitled chapter')
    expect(chapterOnly.prepareCalls[0].params).toEqual(['b1', 'c1'])
  })

  it('validates empty and target-scoped searches', async () => {
    const { ctx } = makeWebContext()
    await expect(findReplaceMatches(ctx, { bookId: 'b1', searchTerm: '' })).resolves.toEqual([])
    await expect(findReplaceMatches(ctx, {
      bookId: 'b1', searchTerm: 'x', scope: 'wikiPage',
    })).rejects.toThrow(/target ID is required/)
  })
})

describe('searchRepository mutations', () => {
  it('replaces selected chapter fields, recalculates words, persists, and dispatches', async () => {
    const fields = { title: 'Jon Returns', text: 'Jon met JON.' }
    const document = createFindReplaceDocument({
      targetType: 'chapter', targetId: 'c1', displayName: fields.title, fields, searchTerm: 'jon',
    })
    const { ctx, runCalls, requestPersistence } = makeWebContext([[fields]])

    const result = await replaceFindReplaceMatches(ctx, {
      targetType: 'chapter',
      targetId: 'c1',
      replacement: 'james',
      expectedFields: fields,
      matches: document.matches,
    })

    expect(result.replacedCount).toBe(3)
    expect(runCalls[0].params).toEqual([
      'James Returns', 'James met JAMES.', 3, expect.any(String), 'c1',
    ])
    expect(requestPersistence).toHaveBeenCalledOnce()
    expect(dispatchChapterWikiLinksChanged).toHaveBeenCalledWith({ chapterIds: ['c1'], wikiPageIds: [] })
  })

  it('returns immediately for an empty replacement selection', async () => {
    const { ctx, runCalls } = makeWebContext()
    await expect(replaceFindReplaceMatches(ctx, {
      targetType: 'chapter', targetId: 'c1', replacement: 'x', expectedFields: { text: 'old' }, matches: [],
    })).resolves.toEqual({ replacedCount: 0, fields: { text: 'old' } })
    expect(runCalls).toEqual([])
  })

  it('rejects missing and stale chapter records without writing', async () => {
    const missing = makeWebContext([[]])
    await expect(replaceFindReplaceMatches(missing.ctx, {
      targetType: 'chapter', targetId: 'missing', replacement: 'x', expectedFields: { text: 'old' },
      matches: [{ id: 'x', field: 'text', start: 0, end: 3, matchedText: 'old', before: '', after: '', occurrence: 0 }],
    })).rejects.toThrow('Chapter not found')

    const stale = makeWebContext([[{ title: 'Title', text: 'edited' }]])
    await expect(replaceFindReplaceMatches(stale.ctx, {
      targetType: 'chapter', targetId: 'c1', replacement: 'new', expectedFields: { text: 'old' },
      matches: [{ id: 'x', field: 'text', start: 0, end: 3, matchedText: 'old', before: '', after: '', occurrence: 0 }],
    })).rejects.toThrow(/changed after searching/)
    expect(stale.runCalls).toEqual([])
  })

  it('replaces and restores wiki fields on the native path', async () => {
    const original = { page_name: 'Jon', content: 'Jon arrived.', summary: 'JON' }
    const document = createFindReplaceDocument({
      targetType: 'wikiPage', targetId: 'w1', displayName: 'Jon', fields: original, searchTerm: 'jon',
    })
    const replacement = makeNativeContext([[original]])

    const result = await replaceFindReplaceMatches(replacement.ctx, {
      targetType: 'wikiPage', targetId: 'w1', replacement: 'james', expectedFields: original, matches: document.matches,
    })

    expect(result.fields).toMatchObject({ page_name: 'James', content: 'James arrived.', summary: 'JAMES' })
    expect(replacement.runCalls[0].params).toEqual([
      'James', 'James arrived.', 'JAMES', expect.any(String), 'w1',
    ])

    const restore = makeNativeContext([[
      { page_name: 'James', content: 'James arrived.', summary: 'JAMES' },
    ]])
    await restoreFindReplaceFields(restore.ctx, {
      targetType: 'wikiPage',
      targetId: 'w1',
      expectedFields: result.fields,
      fields: original,
    })
    expect(restore.runCalls[0].params).toEqual(['Jon', 'Jon arrived.', 'JON', expect.any(String), 'w1'])
  })

  it('restores chapter text and recalculates its word count', async () => {
    const { ctx, runCalls } = makeWebContext([[{ title: 'New', text: 'three new words' }]])

    await restoreFindReplaceFields(ctx, {
      targetType: 'chapter', targetId: 'c1', expectedFields: { title: 'New', text: 'three new words' },
      fields: { title: 'Old', text: 'two words' },
    })

    expect(runCalls[0].params).toEqual(['Old', 'two words', 2, expect.any(String), 'c1'])
  })

  it('performs literal, case-preserving whole-target replacements', async () => {
    const chapter = makeWebContext([[
      { title: 'A.B and A.B', text: 'a.b A.B A.b' },
    ]])
    await replaceInChapter(chapter.ctx, 'c1', 'a.b', 'x')
    expect(chapter.runCalls[0].params).toEqual([
      'X and X', 'x X X', 3, expect.any(String), 'c1',
    ])

    const wiki = makeNativeContext([[
      { page_name: 'Jon', content: 'jon JON', summary: 'Jon' },
    ]])
    await replaceInWikiPage(wiki.ctx, 'w1', 'jon', 'lee')
    expect(wiki.runCalls[0].params).toEqual(['Lee', 'lee LEE', 'Lee', expect.any(String), 'w1'])
  })
})
