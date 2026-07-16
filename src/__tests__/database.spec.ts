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

describe('chapters', () => {
  beforeEach(async () => {
    await db.saveBook(book())
  })

  it('saves, reads, and deletes chapters', async () => {
    await db.saveChapter(chapter())
    await db.saveChapter(chapter({ id: 'ch-2', title: 'Chapter Two' }))

    let chapters = await db.getChapters('book-1')
    expect(chapters.map((c) => c.id).sort()).toEqual(['ch-1', 'ch-2'])

    await db.deleteChapter('ch-1', 'book-1')
    chapters = await db.getChapters('book-1')
    expect(chapters.map((c) => c.id)).toEqual(['ch-2'])
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
    })

    const summary = await db.getPartSummary(partId)
    expect(summary).toMatchObject({ part_id: partId, summary: 'Part recap.', characters: '["Alice"]' })

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
    expect(reviews[0].review_text).toBe('Nice chapter.')

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

    await db.updateCustomProfile(id, { name: 'Kindly' })
    profiles = await db.getCustomProfiles()
    expect(profiles[0].name).toBe('Kindly')

    await db.deleteCustomProfile(id)
    expect(await db.getCustomProfiles()).toHaveLength(0)
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
    await db.saveImageAsset(asset())
    await db.saveImageAsset(asset({ id: 'img-2', chapter_id: null }))

    expect((await db.getChapterImages('ch-1')).map((i) => i.id)).toEqual(['img-1'])
    expect((await db.getBookImages('book-1')).map((i) => i.id).sort()).toEqual(['img-1', 'img-2'])
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
