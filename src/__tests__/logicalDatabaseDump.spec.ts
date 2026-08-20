import { describe, expect, it } from 'vitest'
import type { DatabaseImportData } from '@/lib/databaseImportExport'
import {
  createLogicalDatabaseDump,
  LOGICAL_DATABASE_DUMP_VERSION,
} from '@/lib/libraryBundle/logicalDump'

function emptyData(): DatabaseImportData {
  return {
    version: 6,
    books: [], chapters: [], chapter_revisions: [], chapter_activity: [], book_parts: [],
    chapter_summaries: [], part_summaries: [], wiki_pages: [], book_characters: [],
    chapter_reviews: [], custom_reviewer_profiles: [], ai_profiles: [], wiki_updates: [],
    chapter_wiki_mentions: [], image_assets: [], image_wiki_tags: [], chapter_notes: [],
    wiki_review_state: [],
  }
}

describe('createLogicalDatabaseDump', () => {
  it('normalizes named rows, JSON arrays, booleans, timestamps, and row order', () => {
    const data = emptyData()
    data.books = [
      { id: 'book-b', title: 'B', chapter_order: '[]', part_order: '[]', cover_image_id: null,
        created_at: '2026-01-01 00:00:00', updated_at: '2026-01-01T00:00:00.000Z' },
      { id: 'book-a', title: 'A', chapter_order: '["ch-1"]', part_order: '[]', cover_image_id: null,
        created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
    ]
    data.wiki_pages = [{
      id: 'wiki-1', book_id: 'book-a', page_name: 'Alice', page_type: 'character', content: '',
      summary: '', aliases: '["Al"]', tags: '[]', is_major: 1, created_by_ai: 0,
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
      is_pinned: 1, cover_image_id: null,
    }]

    const dump = createLogicalDatabaseDump(data)

    expect(dump.logical_dump_version).toBe(LOGICAL_DATABASE_DUMP_VERSION)
    expect(dump.tables.books.map((row) => row.id)).toEqual(['book-a', 'book-b'])
    expect(dump.tables.books[0].chapter_order).toEqual(['ch-1'])
    expect(dump.tables.books[1].created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(dump.tables.wiki_pages[0]).toMatchObject({
      aliases: ['Al'], tags: [], is_major: true, created_by_ai: false, is_pinned: true,
    })
  })

  it('maps positional rows with the versioned column definitions', () => {
    const data = emptyData()
    data.chapter_notes = [[
      'note-1', 'chapter-1', 'Remember this',
      '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z',
    ]]

    expect(createLogicalDatabaseDump(data).tables.chapter_notes).toEqual([{
      id: 'note-1', chapter_id: 'chapter-1', notes: 'Remember this',
      created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
    }])
  })

  it('preserves invalid or already-structured legacy values for later validation', () => {
    const data = emptyData()
    data.part_summaries = [
      {
        id: 'summary-a', part_id: 'part-1', summary: null, characters: ['Alice'],
        beats: '{bad json', created_at: 'not-a-date', updated_at: null,
        generated_by: undefined, model: null,
      },
      {
        id: 'summary-b', part_id: 'part-1', summary: '', characters: '{}', beats: '[]',
        created_at: '2026-01-01T00:00:00.000+00:00',
        updated_at: '2026-01-01T00:00:00.000Z', generated_by: null, model: null,
      },
    ]

    const rows = createLogicalDatabaseDump(data).tables.part_summaries
    expect(rows[0]).toMatchObject({
      characters: ['Alice'], beats: '{bad json', created_at: 'not-a-date',
      updated_at: null, generated_by: null,
    })
    expect(rows[1]).toMatchObject({
      characters: '{}', beats: [], created_at: '2026-01-01T00:00:00.000Z',
    })
  })
})
