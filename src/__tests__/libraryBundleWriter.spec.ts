import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { completeCanonicalLibraryFixture } from '@/__tests__/fixtures/libraryBundle'
import { decodeBundleText, sortedBundlePaths } from '@/lib/libraryBundle/fileMap'
import { chapterContentHash, semanticHash, stableJson } from '@/lib/libraryBundle/semanticHash'
import { bundleShortId, bundleSlug, writeLibraryBundle } from '@/lib/libraryBundle/write'

const options = {
  bundleId: 'bundle:test',
  exportedAt: '2026-08-20T16:00:00.000Z',
  appVersion: '1.2.3',
}

describe('writeLibraryBundle', () => {
  it('writes every canonical entity into the documented full bundle layout', async () => {
    const result = await writeLibraryBundle(completeCanonicalLibraryFixture(), options)
    const paths = sortedBundlePaths(result.files)

    expect(paths).toEqual([
      '_beta-bot/history/chapter-activity.jsonl',
      '_beta-bot/history/chapter-revisions.jsonl',
      '_beta-bot/history/wiki-updates.jsonl',
      '_beta-bot/inventory.json',
      '_beta-bot/review-state.jsonl',
      'beta-bot.yaml',
      'books/a-book--book-1/assets/image-1/asset.yaml',
      'books/a-book--book-1/assets/image-1/cover.png',
      'books/a-book--book-1/book.yaml',
      'books/a-book--book-1/chapters/opening--chapter-1/chapter.md',
      'books/a-book--book-1/chapters/opening--chapter-1/notes.md',
      'books/a-book--book-1/chapters/opening--chapter-1/reviews/2026-08-20T15-00-00Z--review-1.md',
      'books/a-book--book-1/chapters/opening--chapter-1/summary.md',
      'books/a-book--book-1/characters.yaml',
      'books/a-book--book-1/parts/part-one--part-1/part.yaml',
      'books/a-book--book-1/parts/part-one--part-1/summary.md',
      'books/a-book--book-1/wiki/alice--wiki-1.md',
      'profiles/editor--profile-test.yaml',
    ])

    const manifestText = decodeBundleText(result.files.get('beta-bot.yaml')!)
    const manifest = parseYaml(manifestText)
    expect(manifestText).toContain('format: "beta-bot-library"')
    expect(manifest).toMatchObject({
      format: 'beta-bot-library', bundle_id: 'bundle:test', format_version: 1,
      content_mode: 'full', app_version: '1.2.3',
    })
    expect(result.files.get('books/a-book--book-1/assets/image-1/cover.png')).toEqual(
      new Uint8Array([1, 2, 3]),
    )
    expect(result.inventory.entities).toHaveLength(15)
    expect(result.inventory.entities.map((entry) => entry.entity_type)).toContain('chapter_revision')
  })

  it('preserves exact Markdown bodies and produces identical output for identical inputs', async () => {
    const model = completeCanonicalLibraryFixture()
    model.chapters[0].body = '--- not frontmatter\n\nTrailing spaces  \n'
    const first = await writeLibraryBundle(model, options)
    const second = await writeLibraryBundle(model, options)

    for (const path of sortedBundlePaths(first.files)) {
      expect(second.files.get(path)).toEqual(first.files.get(path))
    }
    expect(decodeBundleText(first.files.get(
      'books/a-book--book-1/chapters/opening--chapter-1/chapter.md',
    )!)).toMatch(/---\n--- not frontmatter\n\nTrailing spaces  \n$/)
  })

  it('handles empty libraries, Unicode titles, and duplicate display names deterministically', async () => {
    const empty = completeCanonicalLibraryFixture()
    for (const key of [
      'books', 'parts', 'chapters', 'chapter_notes', 'chapter_summaries', 'part_summaries',
      'reviews', 'wiki_pages', 'book_characters', 'profiles', 'assets', 'chapter_revisions',
      'chapter_activity', 'wiki_updates', 'wiki_review_state',
    ] as const) empty[key] = []
    empty.book_ids = []
    const emptyResult = await writeLibraryBundle(empty, options)
    expect(sortedBundlePaths(emptyResult.files)).toEqual([
      '_beta-bot/history/chapter-activity.jsonl',
      '_beta-bot/history/chapter-revisions.jsonl',
      '_beta-bot/history/wiki-updates.jsonl',
      '_beta-bot/inventory.json',
      '_beta-bot/review-state.jsonl',
      'beta-bot.yaml',
    ])

    const duplicates = structuredClone(empty)
    duplicates.book_ids = ['book-a', 'book-b']
    duplicates.books = ['book-a', 'book-b'].map((id) => ({
      id, title: 'Café / Café', chapter_order: [], part_order: [], cover_image_id: null,
      created_at: '2026-08-20T15:00:00.000Z', updated_at: '2026-08-20T15:00:00.000Z',
    }))
    const duplicateResult = await writeLibraryBundle(duplicates, options)
    expect(sortedBundlePaths(duplicateResult.files)).toEqual(expect.arrayContaining([
      'books/cafe-cafe--book-a/book.yaml',
      'books/cafe-cafe--book-b/book.yaml',
    ]))
  })

  it('does not cut through words in long asset directory IDs', async () => {
    for (const [id, directory] of [
      ['jack-asset-12-jack-portrait', 'jack-portrait'],
      ['jack-asset-13-nell-portrait', 'nell-portrait'],
      ['jack-asset-17-morrows-table', 'morrows-table'],
    ]) {
      const model = completeCanonicalLibraryFixture()
      model.assets[0].id = id
      const result = await writeLibraryBundle(model, options)

      expect(sortedBundlePaths(result.files)).toEqual(expect.arrayContaining([
        `books/a-book--book-1/assets/${directory}/asset.yaml`,
        `books/a-book--book-1/assets/${directory}/cover.png`,
      ]))
    }
  })

  it('hashes typed semantics instead of formatting or updated timestamps', async () => {
    const book = completeCanonicalLibraryFixture().books[0]
    const updated = { ...book, updated_at: '2026-08-20T16:30:00.000Z' }
    const renamed = { ...book, title: 'Renamed' }
    expect(await semanticHash(updated)).toBe(await semanticHash(book))
    expect(await semanticHash(renamed)).not.toBe(await semanticHash(book))
    expect(await semanticHash(new Uint8Array([1, 2, 3]))).toMatch(/^[a-f0-9]{64}$/)
    expect(stableJson({ updated_at: 'now', bytes: new Uint8Array([1]) })).toBe(
      '{"bytes":[1],"updated_at":"now"}',
    )
    expect(await chapterContentHash({ title: 'Opening', body: 'Text' })).toBe(
      await semanticHash({ title: 'Opening', body: 'Text' }),
    )
  })

  it('rejects missing or corrupted bytes and unsafe asset filenames', async () => {
    const missing = completeCanonicalLibraryFixture()
    missing.assets[0].bytes = null
    await expect(writeLibraryBundle(missing, options)).rejects.toThrow(/missing required bytes/)

    const corrupt = completeCanonicalLibraryFixture()
    corrupt.assets[0].bytes = new Uint8Array([9])
    await expect(writeLibraryBundle(corrupt, options)).rejects.toThrow(/integrity metadata/)

    const unsafe = completeCanonicalLibraryFixture()
    unsafe.assets[0].file_name = '../cover.png'
    await expect(writeLibraryBundle(unsafe, options)).rejects.toThrow(/not portable/)
  })

  it('rejects every unresolved parent instead of emitting a partial backup', async () => {
    const cases: Array<(model: ReturnType<typeof completeCanonicalLibraryFixture>) => void> = [
      (model) => { model.parts[0].book_id = 'missing' },
      (model) => { model.chapters[0].book_id = 'missing' },
      (model) => { model.chapter_notes[0].chapter_id = 'missing' },
      (model) => { model.chapter_summaries[0].chapter_id = 'missing' },
      (model) => { model.part_summaries[0].part_id = 'missing' },
      (model) => { model.reviews[0].chapter_id = 'missing' },
      (model) => { model.wiki_pages[0].book_id = 'missing' },
      (model) => { model.assets[0].book_id = 'missing' },
    ]

    for (const mutate of cases) {
      const model = completeCanonicalLibraryFixture()
      mutate(model)
      await expect(writeLibraryBundle(model, options)).rejects.toThrow(/unknown/)
    }
  })

  it('omits undeclared full-only content for text workspaces and rejects file collisions', async () => {
    const textOnly = completeCanonicalLibraryFixture()
    textOnly.content_mode = 'text-only'
    textOnly.includes = { image_bytes: false, history: false, audit_records: false }
    textOnly.assets[0].bytes = null
    const written = await writeLibraryBundle(textOnly, options)
    expect(sortedBundlePaths(written.files)).not.toContain('_beta-bot/history/chapter-revisions.jsonl')
    expect(sortedBundlePaths(written.files)).not.toContain('_beta-bot/review-state.jsonl')
    expect(sortedBundlePaths(written.files)).not.toContain(
      'books/a-book--book-1/assets/image-1/cover.png',
    )

    const collision = completeCanonicalLibraryFixture()
    collision.chapter_notes.push({ ...collision.chapter_notes[0], id: 'note-2' })
    await expect(writeLibraryBundle(collision, options)).rejects.toThrow(/path collision/)
  })

  it('uses portable fallbacks and stable suffixes for path components', () => {
    expect(bundleSlug('  💫  ')).toBe('untitled')
    expect(bundleSlug('Crème BRÛLÉE')).toBe('creme-brulee')
    expect(bundleShortId('1234567890123')).toBe('234567890123')
  })
})
