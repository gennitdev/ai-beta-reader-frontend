import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabaseConnection, DatabaseContext } from '@/lib/db/connection'
import type { Book, Chapter } from '@/lib/database'
import {
  discardChapterRevision,
  getBookRevisionActivity,
  getBooks,
  getChapterRevisions,
  getChapters,
  saveBook,
  saveChapter,
} from '@/lib/db/chapterRepository'

interface Call {
  sql: string
  params?: unknown[]
}

type ExecResult = Array<{ columns: string[]; values: unknown[][] }>

function makeWebContext(execResults: ExecResult[] = []) {
  const runCalls: Call[] = []
  const execCalls: Call[] = []
  const requestPersistence = vi.fn()
  const flushPersistence = vi.fn(async () => undefined)
  let execIndex = 0
  const connection = {
    run: vi.fn((sql: string, params?: unknown[]) => runCalls.push({ sql, params })),
    exec: vi.fn((sql: string, params?: unknown[]) => {
      execCalls.push({ sql, params })
      return execResults[execIndex++] ?? []
    }),
  } as unknown as AppDatabaseConnection
  const ctx: DatabaseContext = {
    connection,
    isNative: false,
    requestPersistence,
    flushPersistence,
    setImporting: vi.fn(),
  }
  return { ctx, runCalls, execCalls, requestPersistence, flushPersistence }
}

function makeNativeContext(queryResults: Array<Array<Record<string, unknown>> | undefined> = []) {
  const runCalls: Call[] = []
  const queryCalls: Call[] = []
  let queryIndex = 0
  const connection = {
    run: vi.fn(async (sql: string, params?: unknown[]) => runCalls.push({ sql, params })),
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queryCalls.push({ sql, params })
      return { values: queryResults[queryIndex++] }
    }),
  } as unknown as AppDatabaseConnection
  const ctx: DatabaseContext = {
    connection,
    isNative: true,
    requestPersistence: vi.fn(),
    flushPersistence: vi.fn(async () => undefined),
    setImporting: vi.fn(),
  }
  return { ctx, runCalls, queryCalls }
}

function book(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book-1',
    title: 'Book',
    chapter_order: '[]',
    part_order: '[]',
    cover_image_id: null,
    created_at: 'created',
    updated_at: 'updated',
    ...overrides,
  }
}

function chapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'chapter-1',
    book_id: 'book-1',
    part_id: null,
    title: 'Chapter',
    text: 'New text',
    word_count: 2,
    cover_image_id: null,
    created_at: 'created',
    updated_at: 'updated',
    ...overrides,
  }
}

const webResult = (...rows: unknown[][]): ExecResult => [{ columns: [], values: rows }]

afterEach(() => vi.restoreAllMocks())

describe('chapterRepository row mapping', () => {
  it('maps web rows with safe defaults for optional book, chapter, and revision fields', async () => {
    const books = makeWebContext([webResult([
      'book-1', 'Book', null, 42, false, 'created', null,
    ])])
    await expect(getBooks(books.ctx)).resolves.toEqual([{
      id: 'book-1',
      title: 'Book',
      chapter_order: '[]',
      part_order: '[]',
      cover_image_id: null,
      created_at: 'created',
      updated_at: 'created',
    }])

    const chapters = makeWebContext([webResult([
      'chapter-1', 'book-1', 12, false, null, null, 7, 'created', null,
    ])])
    await expect(getChapters(chapters.ctx, 'book-1')).resolves.toEqual([{
      id: 'chapter-1',
      book_id: 'book-1',
      part_id: null,
      title: undefined,
      text: '',
      word_count: 0,
      cover_image_id: null,
      created_at: 'created',
      updated_at: 'created',
    }])

    const revisions = makeWebContext([webResult([
      'revision-1', 'chapter-1', 'book-1', false, null, null, null, null,
      'unknown', 'created', false,
    ])])
    await expect(getChapterRevisions(revisions.ctx, 'chapter-1')).resolves.toEqual([{
      id: 'revision-1',
      chapter_id: 'chapter-1',
      book_id: 'book-1',
      title: null,
      text: '',
      word_count: 0,
      words_added: 0,
      words_removed: 0,
      revision_kind: 'save',
      created_at: 'created',
      discarded_at: null,
    }])
  })

  it('maps keyed native rows and preserves valid optional values', async () => {
    const books = makeNativeContext([[
      {
        id: 'book-1', title: 'Book', chapter_order: '["chapter-1"]', part_order: '["part-1"]',
        cover_image_id: 'cover-1', created_at: 'created', updated_at: 'updated',
      },
    ]])
    await expect(getBooks(books.ctx)).resolves.toEqual([expect.objectContaining({
      chapter_order: '["chapter-1"]',
      part_order: '["part-1"]',
      cover_image_id: 'cover-1',
      updated_at: 'updated',
    })])

    const chapters = makeNativeContext([[
      {
        id: 'chapter-1', book_id: 'book-1', part_id: 'part-1', title: 'Title', text: 'Text',
        word_count: 1, cover_image_id: 'cover-1', created_at: 'created', updated_at: 'updated',
      },
    ]])
    await expect(getChapters(chapters.ctx, 'book-1')).resolves.toEqual([expect.objectContaining({
      part_id: 'part-1', title: 'Title', cover_image_id: 'cover-1', updated_at: 'updated',
    })])

    const revisions = makeNativeContext([[
      {
        id: 'revision-1', chapter_id: 'chapter-1', book_id: 'book-1', title: 'Old', text: 'Text',
        word_count: 1, words_added: 1, words_removed: 2, revision_kind: 'baseline',
        created_at: 'created', discarded_at: 'discarded',
      },
    ]])
    await expect(getChapterRevisions(revisions.ctx, 'chapter-1')).resolves.toEqual([expect.objectContaining({
      title: 'Old', revision_kind: 'baseline', discarded_at: 'discarded',
    })])
  })

  it('returns empty collections when either backend has no result rows', async () => {
    await expect(getBooks(makeWebContext([[]]).ctx)).resolves.toEqual([])
    await expect(getChapters(makeWebContext([[]]).ctx, 'book-1')).resolves.toEqual([])
    await expect(getChapterRevisions(makeWebContext([[]]).ctx, 'chapter-1')).resolves.toEqual([])
    await expect(getBooks(makeNativeContext([undefined]).ctx)).resolves.toEqual([])
    await expect(getChapters(makeNativeContext([undefined]).ctx, 'book-1')).resolves.toEqual([])
    await expect(getChapterRevisions(makeNativeContext([undefined]).ctx, 'chapter-1')).resolves.toEqual([])
  })

  it('maps activity defaults and delete/save variants on both backends', async () => {
    const web = makeWebContext([webResult(
      ['activity-1', 'chapter-1', false, 'delete', null, null, null, 'created', 0, 1],
      ['activity-2', 'chapter-2', 'Title', 'other', 2, 1, 0, 'later', 1, 0],
    )])
    expect(await getBookRevisionActivity(web.ctx, 'book-1')).toEqual([
      expect.objectContaining({ chapter_title: null, activity_type: 'delete', words_added: 0, revision_discarded: true }),
      expect.objectContaining({ chapter_title: 'Title', activity_type: 'save', words_added: 2, revision_available: true }),
    ])

    const native = makeNativeContext([[
      {
        id: 'activity-1', chapter_id: 'chapter-1', chapter_title: null, activity_type: 'delete',
        words_added: null, words_removed: null, word_count_deleted: null, created_at: 'created',
        revision_available: 0, revision_discarded: 1,
      },
    ]])
    expect(await getBookRevisionActivity(native.ctx, 'book-1')).toEqual([
      expect.objectContaining({ activity_type: 'delete', words_added: 0, revision_discarded: true }),
    ])

    await expect(getBookRevisionActivity(makeWebContext([[]]).ctx, 'book-1')).resolves.toEqual([])
    await expect(getBookRevisionActivity(makeNativeContext([undefined]).ctx, 'book-1')).resolves.toEqual([])
  })
})

describe('chapterRepository writes and revisions', () => {
  it('saves books with fallback values on web and native backends', async () => {
    const value = book({ chapter_order: '', part_order: '', updated_at: undefined })
    const web = makeWebContext()
    await saveBook(web.ctx, value)
    expect(web.runCalls[0].params).toEqual([
      'book-1', 'Book', '[]', '[]', null, 'created', 'created',
    ])
    expect(web.requestPersistence).toHaveBeenCalledOnce()

    const native = makeNativeContext()
    await saveBook(native.ctx, value)
    expect(native.runCalls[0].params).toEqual(web.runCalls[0].params)
    expect(native.ctx.requestPersistence).not.toHaveBeenCalled()
  })

  it('saves without a revision and appends a missing book order entry', async () => {
    const web = makeWebContext([[]])
    await expect(saveChapter(web.ctx, chapter({ part_id: '', updated_at: undefined }), {
      createRevision: false,
    })).resolves.toBeNull()

    expect(web.runCalls.some((call) => call.sql.includes('INSERT INTO chapters'))).toBe(true)
    expect(web.runCalls.some((call) => call.sql.includes('UPDATE books SET chapter_order'))).toBe(true)
    expect(web.requestPersistence).toHaveBeenCalled()

    const native = makeNativeContext([undefined])
    await expect(saveChapter(native.ctx, chapter({ part_id: '', updated_at: undefined }), {
      createRevision: false,
    })).resolves.toBeNull()
    expect(native.runCalls.some((call) => call.sql.includes('UPDATE books SET chapter_order'))).toBe(true)
  })

  it('does not rewrite a book order that already contains the chapter', async () => {
    const web = makeWebContext([webResult(['["chapter-1"]'])])
    await saveChapter(web.ctx, chapter(), { createRevision: false })

    expect(web.runCalls.filter((call) => call.sql.includes('UPDATE books SET chapter_order'))).toEqual([])
  })

  it('creates baseline and save revisions when an existing chapter changes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(123)
    const existing = [
      'chapter-1', 'book-1', null, 'Old title', 'Old text', 2, null, 'created', 'updated',
    ]
    const web = makeWebContext([
      webResult(existing),
      webResult([0]),
      webResult(['["chapter-1"]']),
    ])

    const revisionId = await saveChapter(web.ctx, chapter())

    expect(revisionId).toBe('chapter-1-save-123')
    const revisions = web.runCalls.filter((call) => call.sql.includes('INSERT INTO chapter_revisions'))
    expect(revisions).toHaveLength(2)
    expect(revisions[0].params).toEqual(expect.arrayContaining(['baseline', 'Old text']))
    expect(revisions[1].params).toEqual(expect.arrayContaining(['save', 'New text']))
    expect(web.runCalls.some((call) => call.sql.includes('chapter_activity'))).toBe(true)
  })

  it('skips revision creation when an existing chapter is unchanged', async () => {
    const current = chapter()
    const row = [
      current.id, current.book_id, current.part_id, current.title, current.text, current.word_count,
      current.cover_image_id, current.created_at, current.updated_at,
    ]
    const web = makeWebContext([
      webResult(row),
      webResult(['["chapter-1"]']),
    ])

    await expect(saveChapter(web.ctx, current)).resolves.toBeNull()
    expect(web.runCalls.some((call) => call.sql.includes('INSERT INTO chapter_revisions'))).toBe(false)
  })

  it('rejects missing, discarded, baseline, and latest revisions before writing', async () => {
    await expect(discardChapterRevision(makeWebContext([[]]).ctx, 'missing')).rejects.toThrow('not found')

    const discarded = ['r1', 'chapter-1', 'book-1', 'Title', 'Text', 1, 0, 0, 'save', 'created', 'discarded']
    await expect(discardChapterRevision(
      makeWebContext([webResult(discarded)]).ctx,
      'r1',
    )).rejects.toThrow('already been discarded')

    const baseline = [...discarded.slice(0, 8), 'baseline', 'created', null]
    await expect(discardChapterRevision(
      makeWebContext([webResult(baseline)]).ctx,
      'r1',
    )).rejects.toThrow('original version')

    const save = [...discarded.slice(0, 8), 'save', 'created', null]
    await expect(discardChapterRevision(
      makeWebContext([webResult(save), webResult(['r1'])]).ctx,
      'r1',
    )).rejects.toThrow('current saved version')
  })

  it('discards a non-current web revision and requests persistence', async () => {
    const target = ['r1', 'chapter-1', 'book-1', 'Title', 'Text', 1, 0, 0, 'save', 'created', null]
    const web = makeWebContext([webResult(target), webResult(['r2'])])

    const discarded = await discardChapterRevision(web.ctx, 'r1')

    expect(discarded).toMatchObject({ id: 'r1', text: '', discarded_at: expect.any(String) })
    expect(web.runCalls.filter((call) => call.sql.startsWith('UPDATE'))).toHaveLength(2)
    expect(web.requestPersistence).toHaveBeenCalledOnce()
  })
})
