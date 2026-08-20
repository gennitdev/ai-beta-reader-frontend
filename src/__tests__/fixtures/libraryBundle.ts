import type { CanonicalLibraryModel } from '@/lib/libraryBundle/model'

const timestamp = '2026-08-20T15:00:00.000Z'
const chapterHash = 'a'.repeat(64)
const assetHash = 'b'.repeat(64)

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
