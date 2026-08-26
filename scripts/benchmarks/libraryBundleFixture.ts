import type { CanonicalLibraryModel } from '../../src/lib/libraryBundle/model'
import { chapterContentHash, sha256Hex } from '../../src/lib/libraryBundle/semanticHash'

export type BundleStressScaleName = 'smoke' | 'ci' | 'nightly'

export interface BundleStressScale {
  books: number
  chaptersPerBook: number
  revisionsPerChapter: number
  assetCount: number
  assetBytes: number
  chapterBodyBytes: number
}

export const BUNDLE_STRESS_SCALES: Readonly<Record<BundleStressScaleName, BundleStressScale>> = Object.freeze({
  smoke: { books: 2, chaptersPerBook: 20, revisionsPerChapter: 2, assetCount: 4, assetBytes: 32 * 1024, chapterBodyBytes: 2 * 1024 },
  ci: { books: 10, chaptersPerBook: 50, revisionsPerChapter: 4, assetCount: 32, assetBytes: 64 * 1024, chapterBodyBytes: 4 * 1024 },
  // Approximate the 150–200 MiB illustrated libraries exercised by desktop users.
  nightly: { books: 20, chaptersPerBook: 100, revisionsPerChapter: 10, assetCount: 100, assetBytes: 2 * 1024 * 1024, chapterBodyBytes: 8 * 1024 },
})

const TIMESTAMP = '2026-08-22T12:00:00.000Z'

function seededBytes(seed: number, length: number): Uint8Array<ArrayBuffer> {
  let state = seed >>> 0
  const bytes = new Uint8Array(length)
  for (let index = 0; index < length; index++) {
    state = (Math.imul(state ^ state >>> 15, 1 | state) + 0x6d2b79f5) >>> 0
    state ^= state + Math.imul(state ^ state >>> 7, 61 | state)
    bytes[index] = (state ^ state >>> 14) & 0xff
  }
  return bytes
}

function sizedText(prefix: string, bytes: number): string {
  const unit = `${prefix} The lantern crossed the river while the archive remembered every revision. `
  return unit.repeat(Math.ceil(bytes / unit.length)).slice(0, bytes)
}

export interface GeneratedBundleStressFixture {
  model: CanonicalLibraryModel
  entityCount: number
  binaryBytes: number
}

/** Generate a complete, deterministic library without checking a large fixture into Git. */
export async function generateBundleStressFixture(
  scaleName: BundleStressScaleName,
  seed: number,
): Promise<GeneratedBundleStressFixture> {
  const scale = BUNDLE_STRESS_SCALES[scaleName]
  const model: CanonicalLibraryModel = {
    format_version: 1,
    bundle_kind: 'library',
    content_mode: 'full',
    book_ids: [],
    includes: { image_bytes: true, history: true, audit_records: true },
    books: [], parts: [], chapters: [], chapter_notes: [], chapter_summaries: [],
    part_summaries: [], reviews: [], wiki_pages: [], book_characters: [],
    profiles: [], assets: [], chapter_revisions: [], chapter_activity: [],
    wiki_updates: [], wiki_review_state: [],
  }

  model.profiles.push({
    id: 'profile:stress-editor', profile_kind: 'custom', legacy_id: 1,
    name: 'Stress Editor', description: 'Deterministic benchmark profile.',
    tone_key: null, system_prompt: null, is_default: false,
    created_at: TIMESTAMP, updated_at: TIMESTAMP,
  })

  for (let bookIndex = 0; bookIndex < scale.books; bookIndex++) {
    const bookId = `book-${bookIndex.toString().padStart(3, '0')}`
    const partId = `part-${bookIndex.toString().padStart(3, '0')}`
    const chapterIds: string[] = []
    model.book_ids.push(bookId)
    model.parts.push({
      id: partId, book_id: bookId, name: `Part ${bookIndex + 1}`, cover_image_id: null,
      created_at: TIMESTAMP, updated_at: TIMESTAMP,
    })
    model.part_summaries.push({
      id: `part-summary-${bookIndex}`, part_id: partId, body: `Summary for ${bookId}.`,
      characters: [`Character ${bookIndex}`], beats: ['Opening', 'Turn'], generated_by: 'ai',
      model: 'benchmark-model', created_at: TIMESTAMP, updated_at: TIMESTAMP,
    })

    for (let chapterIndex = 0; chapterIndex < scale.chaptersPerBook; chapterIndex++) {
      const ordinal = bookIndex * scale.chaptersPerBook + chapterIndex
      const suffix = ordinal.toString().padStart(6, '0')
      const chapterId = `chapter-${suffix}`
      const wikiId = `wiki-${suffix}`
      const title = `Chapter ${chapterIndex + 1}`
      const body = sizedText(`${bookId}/${chapterId}`, scale.chapterBodyBytes)
      chapterIds.push(chapterId)
      const chapter = {
        id: chapterId, book_id: bookId, part_id: partId, title, body, cover_image_id: null,
        created_at: TIMESTAMP, updated_at: TIMESTAMP,
        wiki_mentions: [{
          id: `mention-${suffix}`, wiki_page_id: wikiId, source: 'manual' as const,
          created_at: TIMESTAMP, updated_at: TIMESTAMP,
        }],
      }
      model.chapters.push(chapter)
      model.chapter_notes.push({
        id: `note-${suffix}`, chapter_id: chapterId, body: `Note for ${chapterId}.`,
        created_at: TIMESTAMP, updated_at: TIMESTAMP,
      })
      model.chapter_summaries.push({
        id: `summary-${suffix}`, chapter_id: chapterId, body: `Summary for ${chapterId}.`,
        pov: `Character ${bookIndex}`, characters: [`Character ${bookIndex}`], beats: ['Opening', 'Turn'],
        spoilers_ok: true, generated_by: 'ai', model: 'benchmark-model',
        created_at: TIMESTAMP, updated_at: TIMESTAMP,
      })
      model.reviews.push({
        id: `review-${suffix}`, chapter_id: chapterId, body: `Review for ${chapterId}.`,
        prompt_used: 'Review this chapter.', profile_ref: 'profile:stress-editor',
        profile_name: 'Stress Editor', tone_key: 'editorial',
        created_at: TIMESTAMP, updated_at: TIMESTAMP,
      })
      model.wiki_pages.push({
        id: wikiId, book_id: bookId, page_name: `Subject ${suffix}`, page_type: 'character',
        body: sizedText(`Wiki ${suffix}`, Math.max(256, Math.floor(scale.chapterBodyBytes / 4))),
        summary: `Wiki summary ${suffix}.`, aliases: [`Alias ${suffix}`], tags: ['stress'],
        is_major: chapterIndex === 0, created_by_ai: false, is_pinned: false,
        cover_image_id: null, created_at: TIMESTAMP, updated_at: TIMESTAMP,
      })
      model.wiki_updates.push({
        id: `wiki-update-${suffix}`, wiki_page_id: wikiId, chapter_id: chapterId,
        update_type: 'updated', change_summary: `Updated from ${chapterId}.`,
        contradiction_notes: null, created_at: TIMESTAMP,
      })
      model.wiki_review_state.push({
        wiki_page_id: wikiId, chapter_id: chapterId,
        chapter_content_sha256: await chapterContentHash(chapter),
        reviewed_at: TIMESTAMP, reviewed_by: 'benchmark',
      })

      for (let revisionIndex = 0; revisionIndex < scale.revisionsPerChapter; revisionIndex++) {
        const revisionId = `revision-${suffix}-${revisionIndex}`
        model.chapter_revisions.push({
          id: revisionId, chapter_id: chapterId, book_id: bookId, title,
          text: body, word_count: body.split(/\s+/).length, words_added: 25, words_removed: 5,
          revision_kind: revisionIndex === 0 ? 'baseline' : 'save',
          created_at: TIMESTAMP, discarded_at: null,
        })
        model.chapter_activity.push({
          id: revisionId, book_id: bookId, chapter_id: chapterId, chapter_title: title,
          activity_type: 'save', words_added: 25, words_removed: 5, word_count_deleted: 0,
          revision_discarded: false, created_at: TIMESTAMP,
        })
      }
    }

    model.books.push({
      id: bookId, title: `Benchmark Book ${bookIndex + 1}`, chapter_order: chapterIds,
      part_order: [partId], cover_image_id: null, created_at: TIMESTAMP, updated_at: TIMESTAMP,
    })
    model.book_characters.push({
      id: `character-${bookIndex}`, book_id: bookId, character_name: `Character ${bookIndex}`,
      wiki_page_id: `wiki-${(bookIndex * scale.chaptersPerBook).toString().padStart(6, '0')}`,
      created_at: TIMESTAMP, updated_at: TIMESTAMP,
    })
  }

  for (let assetIndex = 0; assetIndex < scale.assetCount; assetIndex++) {
    const bytes = seededBytes(seed + assetIndex * 7919, scale.assetBytes)
    const bookIndex = assetIndex % scale.books
    model.assets.push({
      id: `asset-${assetIndex.toString().padStart(4, '0')}`,
      book_id: `book-${bookIndex.toString().padStart(3, '0')}`, chapter_id: null,
      asset_type: 'cover', file_name: `image-${assetIndex}.bin`,
      mime_type: 'application/octet-stream', notes: 'Deterministic benchmark bytes.',
      wiki_page_ids: [], created_at: TIMESTAMP, updated_at: TIMESTAMP,
      sha256: await sha256Hex(bytes), byte_length: bytes.byteLength, bytes,
    })
  }

  const entityCount = Object.entries(model)
    .filter(([key, value]) => key !== 'book_ids' && Array.isArray(value))
    .reduce((count, [, value]) => count + (value as unknown[]).length, 0)
  return { model, entityCount, binaryBytes: scale.assetCount * scale.assetBytes }
}
