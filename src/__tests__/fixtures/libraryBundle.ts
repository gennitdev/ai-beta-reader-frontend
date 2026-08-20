import type { CanonicalLibraryModel } from '@/lib/libraryBundle/model'
import type { DatabaseImportData } from '@/lib/databaseImportExport'

const timestamp = '2026-08-20T15:00:00.000Z'
const chapterHash = 'a'.repeat(64)
const assetHash = '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81'

export function completeCanonicalLibraryFixture(): CanonicalLibraryModel {
  return {
    format_version: 1,
    bundle_kind: 'library',
    content_mode: 'full',
    book_ids: ['book-1'],
    includes: { image_bytes: true, history: true, audit_records: true },
    books: [{
      id: 'book-1', title: 'A Book', chapter_order: ['chapter-1'], part_order: ['part-1'],
      cover_image_id: 'image-1', created_at: timestamp, updated_at: timestamp,
    }],
    parts: [{
      id: 'part-1', book_id: 'book-1', name: 'Part One', cover_image_id: null,
      created_at: timestamp, updated_at: timestamp,
    }],
    chapters: [{
      id: 'chapter-1', book_id: 'book-1', part_id: 'part-1', title: 'Opening',
      body: 'Once upon a time.', cover_image_id: null, created_at: timestamp,
      updated_at: timestamp,
      wiki_mentions: [{
        id: 'mention-1', wiki_page_id: 'wiki-1', source: 'manual',
        created_at: timestamp, updated_at: timestamp,
      }],
    }],
    chapter_notes: [{
      id: 'note-1', chapter_id: 'chapter-1', body: 'Revise later.',
      created_at: timestamp, updated_at: timestamp,
    }],
    chapter_summaries: [{
      id: 'summary-1', chapter_id: 'chapter-1', body: 'An opening.', pov: 'Alice',
      characters: ['Alice'], beats: ['Arrival'], spoilers_ok: true, generated_by: 'ai',
      model: 'test-model', created_at: timestamp, updated_at: timestamp,
    }],
    part_summaries: [{
      id: 'part-summary-1', part_id: 'part-1', body: 'The first act.',
      characters: ['Alice'], beats: ['Arrival'], generated_by: 'user', model: null,
      created_at: timestamp, updated_at: timestamp,
    }],
    reviews: [{
      id: 'review-1', chapter_id: 'chapter-1', body: 'Strong opening.',
      prompt_used: 'Review this.', profile_ref: 'profile:test', profile_name: 'Editor',
      tone_key: 'editorial', created_at: timestamp, updated_at: timestamp,
    }],
    wiki_pages: [{
      id: 'wiki-1', book_id: 'book-1', page_name: 'Alice', page_type: 'character',
      body: '# Alice', summary: 'The protagonist.', aliases: ['Al'], tags: ['lead'],
      is_major: true, created_by_ai: false, is_pinned: true, cover_image_id: null,
      created_at: timestamp, updated_at: timestamp,
    }],
    book_characters: [{
      id: 'character-1', book_id: 'book-1', character_name: 'Alice', wiki_page_id: 'wiki-1',
      created_at: timestamp, updated_at: timestamp,
    }],
    profiles: [{
      id: 'profile:test', profile_kind: 'custom', legacy_id: 1, name: 'Editor',
      description: 'A careful editor.', tone_key: null, system_prompt: null, is_default: false,
      created_at: timestamp, updated_at: timestamp,
    }],
    assets: [{
      id: 'image-1', book_id: 'book-1', chapter_id: null, asset_type: 'cover',
      file_name: 'cover.png', mime_type: 'image/png', notes: '', wiki_page_ids: ['wiki-1'],
      created_at: timestamp, updated_at: timestamp, sha256: assetHash, byte_length: 3,
      bytes: new Uint8Array([1, 2, 3]),
    }],
    chapter_revisions: [{
      id: 'revision-1', chapter_id: 'chapter-1', book_id: 'book-1', title: 'Opening',
      text: 'Once upon a time.', word_count: 4, words_added: 4, words_removed: 0,
      revision_kind: 'save', created_at: timestamp, discarded_at: null,
    }],
    chapter_activity: [{
      id: 'revision-1', book_id: 'book-1', chapter_id: 'chapter-1', chapter_title: 'Opening',
      activity_type: 'save', words_added: 4, words_removed: 0, word_count_deleted: 0,
      revision_discarded: false, created_at: timestamp,
    }],
    wiki_updates: [{
      id: 'update-1', wiki_page_id: 'wiki-1', chapter_id: 'chapter-1',
      update_type: 'updated', change_summary: 'Added an alias.', contradiction_notes: null,
      created_at: timestamp,
    }],
    wiki_review_state: [{
      wiki_page_id: 'wiki-1', chapter_id: 'chapter-1', chapter_content_sha256: chapterHash,
      reviewed_at: timestamp, reviewed_by: 'agent',
    }],
  }
}

export function completeDatabaseExportFixture(): DatabaseImportData {
  const model = completeCanonicalLibraryFixture()
  const book = model.books[0]
  const part = model.parts[0]
  const chapter = model.chapters[0]
  const note = model.chapter_notes[0]
  const chapterSummary = model.chapter_summaries[0]
  const partSummary = model.part_summaries[0]
  const review = model.reviews[0]
  const wiki = model.wiki_pages[0]
  const character = model.book_characters[0]
  const profile = model.profiles[0]
  const asset = model.assets[0]
  const revision = model.chapter_revisions[0]
  const activity = model.chapter_activity[0]
  const update = model.wiki_updates[0]
  const reviewState = model.wiki_review_state[0]

  return {
    version: 6,
    books: [{ ...book, chapter_order: JSON.stringify(book.chapter_order), part_order: JSON.stringify(book.part_order) }],
    chapters: [{
      id: chapter.id, book_id: chapter.book_id, part_id: chapter.part_id, title: chapter.title,
      text: chapter.body, word_count: 4, cover_image_id: chapter.cover_image_id,
      created_at: chapter.created_at, updated_at: chapter.updated_at,
    }],
    chapter_revisions: [{ ...revision }],
    chapter_activity: [{ ...activity }],
    book_parts: [{ ...part, chapter_order: JSON.stringify([chapter.id]) }],
    chapter_summaries: [{
      id: chapterSummary.id, chapter_id: chapterSummary.chapter_id, summary: chapterSummary.body,
      pov: chapterSummary.pov, characters: JSON.stringify(chapterSummary.characters),
      beats: JSON.stringify(chapterSummary.beats), spoilers_ok: chapterSummary.spoilers_ok,
      created_at: chapterSummary.created_at, updated_at: chapterSummary.updated_at,
      generated_by: chapterSummary.generated_by, model: chapterSummary.model,
    }],
    part_summaries: [{
      id: partSummary.id, part_id: partSummary.part_id, summary: partSummary.body,
      characters: JSON.stringify(partSummary.characters), beats: JSON.stringify(partSummary.beats),
      created_at: partSummary.created_at, updated_at: partSummary.updated_at,
      generated_by: partSummary.generated_by, model: partSummary.model,
    }],
    wiki_pages: [{
      id: wiki.id, book_id: wiki.book_id, page_name: wiki.page_name, page_type: wiki.page_type,
      content: wiki.body, summary: wiki.summary, aliases: JSON.stringify(wiki.aliases),
      tags: JSON.stringify(wiki.tags), is_major: wiki.is_major, created_by_ai: wiki.created_by_ai,
      created_at: wiki.created_at, updated_at: wiki.updated_at, is_pinned: wiki.is_pinned,
      cover_image_id: wiki.cover_image_id,
    }],
    book_characters: [{ ...character }],
    chapter_reviews: [{
      id: review.id, chapter_id: review.chapter_id, review_text: review.body,
      prompt_used: review.prompt_used, profile_id: profile.legacy_id, profile_name: review.profile_name,
      tone_key: review.tone_key, created_at: review.created_at, updated_at: review.updated_at,
      profile_stable_id: review.profile_ref,
    }],
    custom_reviewer_profiles: [{
      id: profile.legacy_id, name: profile.name, description: profile.description,
      created_at: profile.created_at, updated_at: profile.updated_at, stable_id: profile.id,
    }],
    ai_profiles: [],
    wiki_updates: [{ ...update }],
    chapter_wiki_mentions: chapter.wiki_mentions.map((mention) => ({
      id: mention.id, chapter_id: chapter.id, wiki_page_id: mention.wiki_page_id,
      link_source: mention.source, created_at: mention.created_at, updated_at: mention.updated_at,
    })),
    image_assets: [{
      id: asset.id, book_id: asset.book_id, chapter_id: asset.chapter_id,
      asset_type: asset.asset_type, file_name: asset.file_name, file_path: 'images/cover.png',
      mime_type: asset.mime_type, image_data: null, notes: asset.notes,
      created_at: asset.created_at, updated_at: asset.updated_at,
    }],
    image_wiki_tags: asset.wiki_page_ids.map((wikiPageId) => ({
      image_id: asset.id, wiki_page_id: wikiPageId, created_at: asset.created_at,
    })),
    chapter_notes: [{
      id: note.id, chapter_id: note.chapter_id, notes: note.body,
      created_at: note.created_at, updated_at: note.updated_at,
    }],
    wiki_review_state: [{ ...reviewState }],
  }
}
