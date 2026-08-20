import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs from 'sql.js'
import { AppDatabase, type Book, type Chapter, type ImageAsset } from '@/lib/database'

// Build an AppDatabase backed by an in-memory sql.js database, bypassing the
// browser-only init() (IndexedDB + wasm URL loading). The persistence
// coordinator stays null, so requestPersistence() is a safe no-op.
async function makeDb(): Promise<AppDatabase> {
  const SQL = await initSqlJs()
  const database = new AppDatabase()
  const internal = database as unknown as {
    isNative: boolean
    db: unknown
    createTables: () => Promise<void>
    runMigrations: () => Promise<void>
  }
  internal.isNative = false
  internal.db = new SQL.Database()
  await internal.createTables()
  await internal.runMigrations()
  return database
}

function book(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book-1',
    title: 'My Book',
    chapter_order: '[]',
    part_order: '[]',
    cover_image_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function chapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: 'ch-1',
    book_id: 'book-1',
    part_id: null,
    title: 'Chapter One',
    text: 'Once upon a time.',
    word_count: 4,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function rawDatabase(database: AppDatabase): {
  run(sql: string, params?: unknown[]): void
  exec(sql: string, params?: unknown[]): Array<{ values: unknown[][] }>
} {
  return (database as unknown as {
    db: {
      run(sql: string, params?: unknown[]): void
      exec(sql: string, params?: unknown[]): Array<{ values: unknown[][] }>
    }
  }).db
}

function rejectNextPersistence(database: AppDatabase, error: Error) {
  const request = vi.fn()
  const flush = vi.fn(async () => { throw error })
  const internal = database as unknown as {
    persistenceCoordinator: { request(): void; flush(): Promise<void> }
  }
  internal.persistenceCoordinator = { request, flush }
  return { request, flush }
}

let db: AppDatabase

beforeEach(async () => {
  // Row ids are built from Date.now(); make it strictly increasing so records
  // created within the same millisecond (e.g. two wiki pages) get unique ids.
  let tick = 1_800_000_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => (tick += 1))
  db = await makeDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('books', () => {
  it('saves and reads books back', async () => {
    await db.saveBook(book())
    await db.saveBook(book({ id: 'book-2', title: 'Second' }))

    const books = await db.getBooks()
    expect(books.map((b) => b.id).sort()).toEqual(['book-1', 'book-2'])
    expect(books.find((b) => b.id === 'book-1')?.title).toBe('My Book')
  })

  it('upserts a book on repeated saves', async () => {
    await db.saveBook(book())
    await db.saveBook(book({ title: 'Renamed' }))
    const books = await db.getBooks()
    expect(books).toHaveLength(1)
    expect(books[0].title).toBe('Renamed')
  })
})

describe('database import safety', () => {
  it('rejects a structurally invalid backup without changing existing data', async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter())

    await expect(
      db.importDatabase(new TextEncoder().encode('{}')),
    ).rejects.toThrow(/missing the books or chapters collection/)

    expect(await db.getBooks()).toEqual([expect.objectContaining({ id: 'book-1' })])
    expect(await db.getChapters('book-1')).toEqual([
      expect.objectContaining({ id: 'ch-1', text: 'Once upon a time.' }),
    ])
  })

  it('rolls back a failed replacement and leaves foreign keys enabled', async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter())

    const invalidBackup = {
      version: 5,
      books: [book({ id: 'replacement-book', title: 'Replacement' })],
      chapters: [chapter({ id: 'orphan', book_id: 'missing-book' })],
    }

    await expect(
      db.importDatabase(new TextEncoder().encode(JSON.stringify(invalidBackup))),
    ).rejects.toThrow()

    expect(await db.getBooks()).toEqual([expect.objectContaining({ id: 'book-1' })])
    expect(await db.getChapters('book-1')).toEqual([
      expect.objectContaining({ id: 'ch-1', text: 'Once upon a time.' }),
    ])
    expect(await db.getChapters('replacement-book')).toEqual([])

    const connection = (db as unknown as {
      db: { exec: (sql: string) => Array<{ values: unknown[][] }> }
    }).db
    expect(connection.exec('PRAGMA foreign_keys')[0].values[0][0]).toBe(1)
    expect((db as unknown as { isImporting: boolean }).isImporting).toBe(false)
  })

  it('can atomically replace related live data with a valid empty backup', async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter())
    await db.saveImageAsset({
      id: 'img-1',
      book_id: 'book-1',
      chapter_id: 'ch-1',
      asset_type: 'chapter',
      file_name: 'scene.png',
      file_path: 'web/img-1/scene.png',
      mime_type: 'image/png',
      image_data: null,
      notes: '',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })

    await db.importDatabase(new TextEncoder().encode(JSON.stringify({
      version: 5,
      books: [],
      chapters: [],
    })))

    expect(await db.getBooks()).toEqual([])
    expect(await db.getChapters('book-1')).toEqual([])
    expect(await db.getBookImages('book-1')).toEqual([])
  })
})

describe('chapters', () => {
  beforeEach(async () => {
    await db.saveBook(book())
  })

  it('saves, reads, and deletes chapters', async () => {
    await db.saveChapter(chapter())
    await db.saveChapter(chapter({ id: 'ch-2', title: 'Chapter Two' }))

    let chapters = await db.getChapters('book-1')
    expect(chapters.map((c) => c.id).sort()).toEqual(['ch-1', 'ch-2'])
    expect(chapters[0]).toMatchObject({
      cover_image_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })

    await db.deleteChapter('ch-1', 'book-1')
    chapters = await db.getChapters('book-1')
    expect(chapters.map((c) => c.id)).toEqual(['ch-2'])
  })

  it('creates one version for each changed save and records activity', async () => {
    await db.saveChapter(chapter())
    await db.saveChapter(chapter())
    await db.saveChapter(chapter({ text: 'Once upon a darker time.', word_count: 5 }))

    const revisions = await db.getChapterRevisions('ch-1')
    expect(revisions).toHaveLength(2)
    expect(revisions[0]).toMatchObject({
      text: 'Once upon a darker time.',
      words_added: 1,
      words_removed: 0,
      revision_kind: 'save',
    })

    const activity = await db.getBookRevisionActivity('book-1')
    expect(activity).toHaveLength(2)
    expect(activity[1]).toMatchObject({ chapter_id: 'ch-1', words_added: 1, words_removed: 0 })
  })

  it('preserves an untracked existing chapter as a baseline on its first edited save', async () => {
    await db.saveChapter(chapter(), { createRevision: false })
    await db.saveChapter(chapter({ text: 'A newly edited opening.', word_count: 4 }))

    const revisions = await db.getChapterRevisions('ch-1')
    expect(revisions.map((revision) => revision.revision_kind)).toEqual(['save', 'baseline'])
    expect(revisions[1].text).toBe('Once upon a time.')
    expect(await db.getBookRevisionActivity('book-1')).toHaveLength(1)

    await db.deleteChapter('ch-1', 'book-1')
    expect(await db.getChapterRevisions('ch-1')).toEqual([])

    const activityAfterDeletion = await db.getBookRevisionActivity('book-1')
    expect(activityAfterDeletion).toHaveLength(2)
    expect(activityAfterDeletion[0]).toMatchObject({
      activity_type: 'save',
      chapter_title: 'Chapter One',
    })
    expect(activityAfterDeletion[1]).toMatchObject({
      activity_type: 'delete',
      chapter_title: 'Chapter One',
      word_count_deleted: 4,
    })
  })

  it('records additions and deletions from the prose diff when words move', async () => {
    await db.saveChapter(chapter({ text: 'one two three four', word_count: 4 }))
    await db.saveChapter(chapter({ text: 'three four one two', word_count: 4 }))

    const [revision] = await db.getChapterRevisions('ch-1')
    expect(revision).toMatchObject({ words_added: 2, words_removed: 2 })
  })

  it('restores an older version as a new revision without deleting newer history', async () => {
    await db.saveChapter(chapter())
    await db.saveChapter(chapter({ text: 'Once upon a darker time.', word_count: 5 }))
    const beforeRestore = await db.getChapterRevisions('ch-1')

    const restored = await db.restoreChapterRevision(beforeRestore[1].id)

    expect(restored.id).not.toBe(beforeRestore[1].id)
    expect(restored.text).toBe('Once upon a time.')
    const revisions = await db.getChapterRevisions('ch-1')
    expect(revisions).toHaveLength(3)
    expect(revisions.some((revision) => revision.text === 'Once upon a darker time.')).toBe(true)
    expect((await db.getChapters('book-1'))[0].text).toBe('Once upon a time.')
  })

  it('discards an old snapshot while retaining its revision and activity tombstones', async () => {
    await db.saveChapter(chapter())
    await db.saveChapter(chapter({ text: 'Once upon a darker time.', word_count: 5 }))
    await db.saveChapter(chapter({ text: 'Once upon a much darker time.', word_count: 6 }))
    const beforeDiscard = await db.getChapterRevisions('ch-1')
    const current = beforeDiscard[0]
    const oldRevision = beforeDiscard[1]

    const discarded = await db.discardChapterRevision(oldRevision.id)

    expect(discarded).toMatchObject({ id: oldRevision.id, text: '' })
    expect(discarded.discarded_at).toEqual(expect.any(String))
    const revisions = await db.getChapterRevisions('ch-1')
    expect(revisions).toHaveLength(3)
    expect(revisions.find((revision) => revision.id === oldRevision.id)).toMatchObject({
      text: '',
      word_count: 5,
      words_added: oldRevision.words_added,
    })
    expect(revisions.find((revision) => revision.id === oldRevision.id)?.discarded_at).toEqual(expect.any(String))
    expect(revisions.find((revision) => revision.id === current.id)?.text).toBe('Once upon a much darker time.')

    const activity = await db.getBookRevisionActivity('book-1')
    expect(activity.find((event) => event.id === oldRevision.id)).toMatchObject({
      revision_available: false,
      revision_discarded: true,
    })
    await expect(db.restoreChapterRevision(oldRevision.id)).rejects.toThrow('not found')
    await expect(db.discardChapterRevision(current.id)).rejects.toThrow('current saved version')
  })

  it('never allows the original baseline snapshot to be discarded', async () => {
    await db.saveChapter(chapter(), { createRevision: false })
    await db.saveChapter(chapter({ text: 'A revised beginning.', word_count: 3 }))
    const baseline = (await db.getChapterRevisions('ch-1'))
      .find((revision) => revision.revision_kind === 'baseline')

    await expect(db.discardChapterRevision(baseline!.id)).rejects.toThrow('original version')
  })
})

describe('parts', () => {
  beforeEach(async () => {
    await db.saveBook(book())
  })

  it('creates, lists, renames, and deletes parts', async () => {
    const part = await db.createPart({ book_id: 'book-1', name: 'Part One' })
    expect(part.name).toBe('Part One')

    let parts = await db.getParts('book-1')
    expect(parts).toHaveLength(1)

    await db.updatePart(part.id, 'Renamed Part')
    parts = await db.getParts('book-1')
    expect(parts[0].name).toBe('Renamed Part')

    await db.deletePart(part.id)
    parts = await db.getParts('book-1')
    expect(parts).toHaveLength(0)
  })
})

describe('chapter summaries', () => {
  beforeEach(async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter())
  })

  it('saves and reads a chapter summary with parsed arrays', async () => {
    await db.saveSummary({
      chapter_id: 'ch-1',
      summary: 'A recap.',
      pov: 'Alice',
      characters: ['Alice', 'Bob'],
      beats: ['Opening'],
      spoilers_ok: true,
      generated_by: 'ai',
      model: 'test-model',
    })

    const summary = await db.getSummary('ch-1')
    // characters/beats are persisted as JSON strings; callers parse them.
    expect(summary).toMatchObject({
      chapter_id: 'ch-1',
      summary: 'A recap.',
      pov: 'Alice',
      characters: '["Alice","Bob"]',
      beats: '["Opening"]',
      spoilers_ok: true,
      generated_by: 'ai',
      model: 'test-model',
    })
    await db.saveSummary({
      chapter_id: 'ch-1', summary: 'A manually revised recap.', pov: 'Alice',
      characters: ['Alice', 'Bob'], beats: ['Opening'], spoilers_ok: true,
      generated_by: 'user', model: null,
    })
    expect(rawDatabase(db).exec(
      `SELECT COUNT(*) FROM chapter_summaries WHERE chapter_id = 'ch-1'`,
    )[0].values[0][0]).toBe(1)
    expect(await db.getSummary('ch-1')).toMatchObject({
      summary: 'A manually revised recap.', generated_by: 'user', model: null,
    })
    expect(await db.getSummary('missing')).toBeNull()
  })
})

describe('part summaries', () => {
  let partId: string
  beforeEach(async () => {
    await db.saveBook(book())
    const part = await db.createPart({ book_id: 'book-1', name: 'Part One' })
    partId = part.id
  })

  it('saves, reads, and deletes a part summary', async () => {
    await db.savePartSummary({
      part_id: partId,
      summary: 'Part recap.',
      characters: ['Alice'],
      beats: ['Beat'],
      generated_by: 'ai',
      model: 'test-model',
    })

    const summary = await db.getPartSummary(partId)
    expect(summary).toMatchObject({
      part_id: partId,
      summary: 'Part recap.',
      characters: '["Alice"]',
      generated_by: 'ai',
      model: 'test-model',
    })

    await db.deletePartSummary(partId)
    expect(await db.getPartSummary(partId)).toBeNull()
  })
})

describe('reviews', () => {
  beforeEach(async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter())
  })

  it('saves, lists, and deletes reviews', async () => {
    await db.saveReview({
      chapter_id: 'ch-1',
      review_text: 'Nice chapter.',
      prompt_used: 'prompt',
      profile_id: null,
      profile_name: 'Editor',
      tone_key: 'editorial',
    })

    let reviews = await db.getReviews('ch-1')
    expect(reviews).toHaveLength(1)
    expect(reviews[0]).toMatchObject({
      review_text: 'Nice chapter.',
      profile_stable_id: 'system:editorial',
    })

    await db.deleteReview(reviews[0].id)
    reviews = await db.getReviews('ch-1')
    expect(reviews).toHaveLength(0)
  })
})

describe('chapter notes', () => {
  beforeEach(async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter())
  })

  it('saves, updates, reads, and deletes notes', async () => {
    await db.saveNotes('ch-1', 'first note')
    expect((await db.getNotes('ch-1'))?.notes).toBe('first note')

    await db.saveNotes('ch-1', 'updated note')
    expect((await db.getNotes('ch-1'))?.notes).toBe('updated note')

    await db.deleteNotes('ch-1')
    expect(await db.getNotes('ch-1')).toBeNull()
  })
})

describe('custom reviewer profiles', () => {
  it('creates, lists, updates, and deletes profiles', async () => {
    const id = await db.createCustomProfile({ name: 'Snarky', description: 'A snarky reviewer' })

    let profiles = await db.getCustomProfiles()
    expect(profiles).toHaveLength(1)
    expect(profiles[0].name).toBe('Snarky')
    expect(profiles[0].stable_id).toMatch(/^profile:[0-9a-f-]{36}$/)

    await db.saveBook(book())
    await db.saveChapter(chapter())
    await db.saveReview({
      chapter_id: 'ch-1', review_text: 'Portable review.', prompt_used: null,
      profile_id: id, profile_name: 'Snarky', tone_key: `custom-${id}`,
    })
    expect(await db.getReviews('ch-1')).toEqual([
      expect.objectContaining({ profile_stable_id: profiles[0].stable_id }),
    ])

    await db.updateCustomProfile(id, { name: 'Kindly' })
    profiles = await db.getCustomProfiles()
    expect(profiles[0].name).toBe('Kindly')

    await db.deleteCustomProfile(id)
    expect(await db.getCustomProfiles()).toHaveLength(0)
  })
})

describe('portable backup metadata', () => {
  it('round-trips wiki review state and emits named rows for schema-ordered tables', async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter())
    const wikiId = await db.createWikiPage({
      book_id: 'book-1', page_name: 'Alice', content: '', summary: '',
    })
    rawDatabase(db).run(
      `INSERT INTO wiki_review_state
        (wiki_page_id, chapter_id, chapter_content_sha256, reviewed_at, reviewed_by)
       VALUES (?, ?, ?, ?, ?)`,
      [wikiId, 'ch-1', 'a'.repeat(64), '2026-08-20T15:00:00.000Z', 'agent'],
    )

    const backup = await db.exportDatabase()
    const serialized = JSON.parse(new TextDecoder().decode(backup)) as {
      chapter_revisions: unknown[]
      wiki_review_state: Array<Record<string, unknown>>
    }
    expect(Array.isArray(serialized.chapter_revisions[0])).toBe(false)
    expect(serialized.wiki_review_state).toEqual([expect.objectContaining({
      wiki_page_id: wikiId,
      chapter_id: 'ch-1',
      reviewed_by: 'agent',
    })])

    const restoredDb = await makeDb()
    await restoredDb.importDatabase(backup)
    const restoredBackup = JSON.parse(
      new TextDecoder().decode(await restoredDb.exportDatabase()),
    ) as { wiki_review_state: Array<Record<string, unknown>> }
    expect(restoredBackup.wiki_review_state).toEqual(serialized.wiki_review_state)
  })
})

describe('wiki pages', () => {
  beforeEach(async () => {
    await db.saveBook(book())
  })

  it('creates, reads, updates, and deletes wiki pages', async () => {
    const id = await db.createWikiPage({
      book_id: 'book-1',
      page_name: 'Alice',
      content: '# Alice',
      summary: 'A hero.',
      page_type: 'character',
    })

    const pages = await db.getWikiPages('book-1')
    expect(pages).toHaveLength(1)
    expect(await db.getWikiPageById(id)).toMatchObject({ page_name: 'Alice' })
    expect(await db.getWikiPage('book-1', 'Alice')).toMatchObject({ id })

    await db.updateWikiPage(id, { summary: 'An updated hero.' })
    expect((await db.getWikiPageById(id))?.summary).toBe('An updated hero.')

    await db.deleteWikiPage(id)
    expect(await db.getWikiPages('book-1')).toHaveLength(0)
  })

  it('rejects a duplicate page name', async () => {
    await db.createWikiPage({ book_id: 'book-1', page_name: 'Alice', content: '', summary: '' })
    await expect(
      db.createWikiPage({ book_id: 'book-1', page_name: 'Alice', content: '', summary: '' }),
    ).rejects.toThrow()
  })

  it('preserves alternate names through database backup and restore', async () => {
    const wikiId = await db.createWikiPage({
      book_id: 'book-1',
      page_name: 'Alice Liddell',
      content: '# Alice',
      summary: 'A hero.',
      page_type: 'character',
      aliases: ['Alice', 'Ally'],
    })

    const backup = await db.exportDatabase()
    const serialized = JSON.parse(new TextDecoder().decode(backup)) as {
      version: number
      wiki_pages: Array<Record<string, unknown>>
    }
    expect(serialized.version).toBe(7)
    expect(serialized.wiki_pages).toContainEqual(expect.objectContaining({
      id: wikiId,
      page_name: 'Alice Liddell',
      aliases: '["Alice","Ally"]',
    }))

    const restoredDb = await makeDb()
    await restoredDb.importDatabase(backup)

    expect(await restoredDb.getWikiPageById(wikiId)).toMatchObject({
      page_name: 'Alice Liddell',
      aliases: '["Alice","Ally"]',
    })
    expect(await restoredDb.getWikiPage('book-1', 'Ally')).toMatchObject({ id: wikiId })
  })
})

describe('image assets', () => {
  function asset(overrides: Partial<ImageAsset> = {}): ImageAsset {
    return {
      id: 'img-1',
      book_id: 'book-1',
      chapter_id: 'ch-1',
      asset_type: 'illustration' as ImageAsset['asset_type'],
      file_name: 'img.png',
      file_path: 'images/img.png',
      mime_type: 'image/png',
      image_data: null,
      notes: '',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    }
  }

  beforeEach(async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter())
  })

  it('saves images and lists them by chapter and book', async () => {
    await db.saveImageAsset(asset({
      content_hash: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      content_hash_algorithm: 'sha256-v1',
      content_byte_length: 3,
    }))
    await db.saveImageAsset(asset({ id: 'img-2', chapter_id: null }))

    expect((await db.getChapterImages('ch-1')).map((i) => i.id)).toEqual(['img-1'])
    expect((await db.getBookImages('book-1')).map((i) => i.id).sort()).toEqual(['img-1', 'img-2'])
    expect(await db.getChapterImages('ch-1')).toContainEqual(expect.objectContaining({
      content_hash: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      content_hash_algorithm: 'sha256-v1',
      content_byte_length: 3,
    }))
  })

  it('sets and reads a chapter cover image', async () => {
    await db.saveImageAsset(asset())
    await db.setChapterCoverImageId('ch-1', 'img-1')
    expect((await db.getChapterCoverImage('ch-1'))?.id).toBe('img-1')

    await db.setChapterCoverImageId('ch-1', null)
    expect(await db.getChapterCoverImage('ch-1')).toBeNull()
  })

  it('updates notes and manages wiki tags, then deletes', async () => {
    await db.saveImageAsset(asset())
    const wikiId = await db.createWikiPage({
      book_id: 'book-1',
      page_name: 'Alice',
      content: '',
      summary: '',
    })

    await db.updateImageAssetNotes('img-1', 'a caption')
    await db.setImageWikiTags('img-1', [wikiId])
    const tags = await db.getImageWikiTags('img-1')
    expect(tags.map((t) => t.wiki_page_id)).toEqual([wikiId])

    await db.deleteImageAsset('img-1')
    expect(await db.getChapterImages('ch-1')).toHaveLength(0)
  })
})

describe('atomic destructive operations', () => {
  const image = (overrides: Partial<ImageAsset> = {}): ImageAsset => ({
    id: 'img-1',
    book_id: 'book-1',
    chapter_id: 'ch-1',
    asset_type: 'illustration',
    file_name: 'img.png',
    file_path: 'images/img.png',
    mime_type: 'image/png',
    image_data: null,
    notes: '',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  })

  it('rolls back chapter cleanup, activity, and ordering when deletion fails', async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter())
    await db.saveSummary({
      chapter_id: 'ch-1', summary: 'Summary', pov: null, characters: [], beats: [], spoilers_ok: false,
    })
    await db.saveImageAsset(image())
    rawDatabase(db).run(`CREATE TRIGGER reject_chapter_delete BEFORE DELETE ON chapters
      BEGIN SELECT RAISE(ABORT, 'forced chapter failure'); END`)

    await expect(db.deleteChapter('ch-1', 'book-1')).rejects.toThrow('forced chapter failure')

    expect(await db.getChapters('book-1')).toEqual([expect.objectContaining({ id: 'ch-1' })])
    expect(await db.getSummary('ch-1')).toEqual(expect.objectContaining({ summary: 'Summary' }))
    expect(await db.getChapterImages('ch-1')).toEqual([expect.objectContaining({ id: 'img-1' })])
    expect(await db.getChapterRevisions('ch-1')).toHaveLength(1)
    expect(await db.getBookRevisionActivity('book-1')).toHaveLength(1)
    expect(JSON.parse((await db.getBooks())[0].chapter_order)).toEqual(['ch-1'])
  })

  it('rolls back chapter assignment and ordering when part deletion fails', async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter())
    const part = await db.createPart({ book_id: 'book-1', name: 'Part One' })
    await db.updateChapterOrders('book-1', ['ch-1'], { [part.id]: ['ch-1'] }, [part.id])
    await db.savePartSummary({ part_id: part.id, summary: 'Part summary', characters: [], beats: [] })
    rawDatabase(db).run(`CREATE TRIGGER reject_part_delete BEFORE DELETE ON book_parts
      BEGIN SELECT RAISE(ABORT, 'forced part failure'); END`)

    await expect(db.deletePart(part.id)).rejects.toThrow('forced part failure')

    expect(await db.getParts('book-1')).toEqual([expect.objectContaining({ id: part.id })])
    expect((await db.getChapters('book-1'))[0].part_id).toBe(part.id)
    expect(await db.getPartSummary(part.id)).toEqual(expect.objectContaining({ summary: 'Part summary' }))
    expect(JSON.parse((await db.getBooks())[0].part_order)).toEqual([part.id])
  })

  it('rolls back wiki relationships when page deletion fails', async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter())
    const wikiId = await db.createWikiPage({
      book_id: 'book-1', page_name: 'Alice', content: '', summary: '',
    })
    await db.addChapterWikiMention('ch-1', wikiId)
    await db.saveImageAsset(image())
    await db.setImageWikiTags('img-1', [wikiId])
    await db.trackWikiUpdate({ wiki_page_id: wikiId, chapter_id: 'ch-1', update_type: 'updated' })
    rawDatabase(db).run(`CREATE TRIGGER reject_wiki_delete BEFORE DELETE ON wiki_pages
      BEGIN SELECT RAISE(ABORT, 'forced wiki failure'); END`)

    await expect(db.deleteWikiPage(wikiId)).rejects.toThrow('forced wiki failure')

    expect(await db.getWikiPageById(wikiId)).toEqual(expect.objectContaining({ id: wikiId }))
    expect(await db.getChapterWikiMentions('ch-1')).toEqual([
      expect.objectContaining({ wiki_page_id: wikiId }),
    ])
    expect(await db.getImageWikiTags('img-1')).toEqual([
      expect.objectContaining({ wiki_page_id: wikiId }),
    ])
    expect(rawDatabase(db).exec('SELECT COUNT(*) FROM wiki_updates')[0].values[0][0]).toBe(1)
  })

  it('rolls back cover unlinking and tags when image deletion fails', async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter())
    const part = await db.createPart({ book_id: 'book-1', name: 'Part One' })
    const wikiId = await db.createWikiPage({
      book_id: 'book-1', page_name: 'Alice', content: '', summary: '',
    })
    await db.saveImageAsset(image())
    await db.setBookCoverImage('book-1', 'img-1')
    await db.setPartCoverImageId(part.id, 'img-1')
    await db.setChapterCoverImageId('ch-1', 'img-1')
    await db.setImageWikiTags('img-1', [wikiId])
    rawDatabase(db).run(`CREATE TRIGGER reject_image_delete BEFORE DELETE ON image_assets
      BEGIN SELECT RAISE(ABORT, 'forced image failure'); END`)

    await expect(db.deleteImageAsset('img-1')).rejects.toThrow('forced image failure')

    expect((await db.getBookCoverImage('book-1'))?.id).toBe('img-1')
    expect((await db.getPartCoverImage(part.id))?.id).toBe('img-1')
    expect((await db.getChapterCoverImage('ch-1'))?.id).toBe('img-1')
    expect(await db.getImageWikiTags('img-1')).toHaveLength(1)
  })

  it('rolls back review cleanup when reviewer profile deletion fails', async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter())
    const profileId = await db.createCustomProfile({ name: 'Careful', description: 'Checks details' })
    await db.saveReview({
      chapter_id: 'ch-1', review_text: 'Review', prompt_used: null,
      profile_id: profileId, profile_name: 'Careful', tone_key: null,
    })
    rawDatabase(db).run(`CREATE TRIGGER reject_profile_delete BEFORE DELETE ON custom_reviewer_profiles
      BEGIN SELECT RAISE(ABORT, 'forced profile failure'); END`)

    await expect(db.deleteCustomProfile(profileId)).rejects.toThrow('forced profile failure')

    expect(await db.getCustomProfiles()).toEqual([expect.objectContaining({ id: profileId })])
    expect(await db.getReviews('ch-1')).toEqual([
      expect.objectContaining({ profile_id: profileId, review_text: 'Review' }),
    ])
  })

  it('does not report committed deletes as durable until their snapshots flush', async () => {
    const persistenceError = new Error('snapshot interrupted')

    const chapterDb = await makeDb()
    await chapterDb.saveBook(book())
    await chapterDb.saveChapter(chapter())
    const chapterPersistence = rejectNextPersistence(chapterDb, persistenceError)
    await expect(chapterDb.deleteChapter('ch-1', 'book-1')).rejects.toBe(persistenceError)
    expect(await chapterDb.getChapters('book-1')).toEqual([])
    expect(chapterPersistence.request).toHaveBeenCalledOnce()

    const partDb = await makeDb()
    await partDb.saveBook(book())
    const part = await partDb.createPart({ book_id: 'book-1', name: 'Part One' })
    const partPersistence = rejectNextPersistence(partDb, persistenceError)
    await expect(partDb.deletePart(part.id)).rejects.toBe(persistenceError)
    expect(await partDb.getParts('book-1')).toEqual([])
    expect(partPersistence.flush).toHaveBeenCalledOnce()

    const wikiDb = await makeDb()
    await wikiDb.saveBook(book())
    const wikiId = await wikiDb.createWikiPage({
      book_id: 'book-1', page_name: 'Alice', content: '', summary: '',
    })
    const wikiPersistence = rejectNextPersistence(wikiDb, persistenceError)
    await expect(wikiDb.deleteWikiPage(wikiId)).rejects.toBe(persistenceError)
    expect(await wikiDb.getWikiPageById(wikiId)).toBeNull()
    expect(wikiPersistence.flush).toHaveBeenCalledOnce()
  })
})

describe('chapter ordering', () => {
  beforeEach(async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter({ id: 'ch-1' }))
    await db.saveChapter(chapter({ id: 'ch-2' }))
  })

  it('updates the book chapter order and part assignments', async () => {
    const part = await db.createPart({ book_id: 'book-1', name: 'Part One' })
    await db.updateChapterOrders('book-1', ['ch-2', 'ch-1'], { [part.id]: ['ch-1'] })

    const books = await db.getBooks()
    expect(JSON.parse(books[0].chapter_order)).toEqual(['ch-2', 'ch-1'])

    const chapters = await db.getChapters('book-1')
    expect(chapters.find((c) => c.id === 'ch-1')?.part_id).toBe(part.id)
  })
})

describe('chapter wiki mentions and links', () => {
  let wikiId: string
  beforeEach(async () => {
    await db.saveBook(book())
    await db.saveChapter(chapter())
    wikiId = await db.createWikiPage({
      book_id: 'book-1',
      page_name: 'Alice',
      content: '',
      summary: '',
    })
  })

  it('adds a mention and reads it back through the various link views', async () => {
    await db.addChapterWikiMention('ch-1', wikiId)

    const mentions = await db.getChapterWikiMentions('ch-1')
    expect(mentions.map((m) => m.wiki_page_id)).toEqual([wikiId])

    const chapterLinks = await db.getChapterWikiLinks('ch-1')
    expect(chapterLinks.map((l) => l.wiki_page_id)).toEqual([wikiId])

    const pageLinks = await db.getWikiPageChapterLinks(wikiId)
    expect(pageLinks.map((l) => l.chapter_id)).toEqual(['ch-1'])
  })

  it('replaces the full set of links for a chapter', async () => {
    const wikiId2 = await db.createWikiPage({
      book_id: 'book-1',
      page_name: 'Bob',
      content: '',
      summary: '',
    })
    await db.setChapterWikiLinks('ch-1', [wikiId, wikiId2])
    expect((await db.getChapterWikiMentions('ch-1')).map((m) => m.wiki_page_id).sort()).toEqual(
      [wikiId, wikiId2].sort(),
    )

    await db.setChapterWikiLinks('ch-1', [wikiId2])
    expect((await db.getChapterWikiMentions('ch-1')).map((m) => m.wiki_page_id)).toEqual([wikiId2])
  })
})

describe('cover images for book, part, and wiki page', () => {
  function asset(id: string, extra: Record<string, unknown> = {}): ImageAsset {
    return {
      id,
      book_id: 'book-1',
      chapter_id: null,
      asset_type: 'illustration' as ImageAsset['asset_type'],
      file_name: `${id}.png`,
      file_path: `images/${id}.png`,
      mime_type: 'image/png',
      image_data: null,
      notes: '',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...extra,
    }
  }

  beforeEach(async () => {
    await db.saveBook(book())
  })

  it('sets and clears a book cover image', async () => {
    await db.saveImageAsset(asset('cover-1'))
    await db.setBookCoverImage('book-1', 'cover-1')
    expect((await db.getBookCoverImage('book-1'))?.id).toBe('cover-1')

    await db.setBookCoverImage('book-1', null)
    expect(await db.getBookCoverImage('book-1')).toBeNull()
  })

  it('sets a part cover image', async () => {
    const part = await db.createPart({ book_id: 'book-1', name: 'Part One' })
    await db.saveImageAsset(asset('pcover'))
    await db.setPartCoverImageId(part.id, 'pcover')
    expect((await db.getPartCoverImage(part.id))?.id).toBe('pcover')
  })

  it('sets a wiki page cover image', async () => {
    const wikiId = await db.createWikiPage({
      book_id: 'book-1',
      page_name: 'Alice',
      content: '',
      summary: '',
    })
    await db.saveImageAsset(asset('wcover'))
    await db.setWikiPageCoverImageId(wikiId, 'wcover')
    expect((await db.getWikiPageCoverImage(wikiId))?.id).toBe('wcover')
  })
})
