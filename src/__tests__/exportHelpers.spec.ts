import { describe, expect, it } from 'vitest'
import { buildMarkdownExportFiles, parseJsonArray } from '@/lib/exportHelpers'
import type { Book, BookPart, Chapter } from '@/lib/database'

function createBook(): Book {
  return {
    id: 'book-1',
    title: 'Book / One',
    chapter_order: '["chapter-3","chapter-1","chapter-2"]',
    part_order: '["part-2","part-1"]',
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

function createParts(): BookPart[] {
  return [
    {
      id: 'part-1',
      book_id: 'book-1',
      name: 'First Part',
      chapter_order: '["chapter-1"]',
      cover_image_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'part-2',
      book_id: 'book-1',
      name: 'Second Part',
      chapter_order: '["chapter-3"]',
      cover_image_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    },
  ]
}

function createChapters(): Chapter[] {
  return [
    {
      id: 'chapter-1',
      book_id: 'book-1',
      part_id: 'part-1',
      title: 'Alpha',
      text: 'Alpha text',
      word_count: 100,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'chapter-2',
      book_id: 'book-1',
      part_id: null,
      title: 'Beta',
      text: 'Beta text',
      word_count: 200,
      created_at: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'chapter-3',
      book_id: 'book-1',
      part_id: 'part-2',
      title: 'Gamma',
      text: 'Gamma text',
      word_count: 300,
      created_at: '2026-01-03T00:00:00.000Z',
    },
  ]
}

describe('buildMarkdownExportFiles', () => {
  it('creates one file per part plus an uncategorized file and includes notes', () => {
    const files = buildMarkdownExportFiles({
      book: createBook(),
      chapters: createChapters(),
      parts: createParts(),
      chapterNotesById: {
        'chapter-2': 'Uncategorized note',
        'chapter-3': 'Gamma note',
      },
      granularity: 'part',
      includeNotes: true,
    })

    expect(files).toEqual([
      {
        path: 'Book___One/1 - Second_Part.md',
        content:
          '# Book / One\n\n## Second Part\n\n### Gamma\n\nGamma text\n\n---\n\n**Notes:**\n\nGamma note\n\n',
      },
      {
        path: 'Book___One/2 - First_Part.md',
        content: '# Book / One\n\n## First Part\n\n### Alpha\n\nAlpha text\n\n',
      },
      {
        path: 'Book___One/Uncategorized.md',
        content:
          '# Book / One\n\n## Uncategorized Chapters\n\n### Beta\n\nBeta text\n\n---\n\n**Notes:**\n\nUncategorized note\n\n',
      },
    ])
  })

  it('creates a single book file with part headings and an uncategorized section', () => {
    const files = buildMarkdownExportFiles({
      book: createBook(),
      chapters: createChapters(),
      parts: createParts(),
      chapterNotesById: {},
      granularity: 'book',
      includeNotes: false,
    })

    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('Book___One.md')
    const content = files[0].content
    expect(content).toContain('## Second Part')
    expect(content).toContain('## First Part')
    expect(content).toContain('## Uncategorized Chapters')
    expect(content).toContain('### Beta')
  })

  it('creates a single ordered book file and omits notes when disabled', () => {
    const files = buildMarkdownExportFiles({
      book: {
        ...createBook(),
        part_order: '[]',
      },
      chapters: createChapters(),
      parts: [],
      chapterNotesById: {
        'chapter-1': 'Should not appear',
      },
      granularity: 'book',
      includeNotes: false,
    })

    expect(files).toEqual([
      {
        path: 'Book___One.md',
        content:
          '# Book / One\n\n## Gamma\n\nGamma text\n\n## Alpha\n\nAlpha text\n\n## Beta\n\nBeta text\n\n',
      },
    ])
  })
})

describe('parseJsonArray', () => {
  it('returns the string entries of a JSON array', () => {
    expect(parseJsonArray('["a","b"]')).toEqual(['a', 'b'])
  })

  it('returns an empty array for nullish, malformed, or non-array input', () => {
    expect(parseJsonArray(null)).toEqual([])
    expect(parseJsonArray(undefined)).toEqual([])
    expect(parseJsonArray('{bad')).toEqual([])
    expect(parseJsonArray('{"a":1}')).toEqual([])
  })
})
