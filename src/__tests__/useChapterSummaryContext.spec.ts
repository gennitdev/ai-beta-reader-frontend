import { describe, expect, it, vi } from 'vitest'
import { useChapterSummaryContext } from '@/composables/useChapterSummaryContext'
import type { Book, BookPart, Chapter, ChapterSummary, PartSummary } from '@/lib/database'

function createBook(): Book {
  return {
    id: 'book-1',
    title: 'Book One',
    chapter_order: '["chapter-1","chapter-2","chapter-3"]',
    part_order: '["part-1","part-2"]',
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

function createParts(): BookPart[] {
  return [
    {
      id: 'part-1',
      book_id: 'book-1',
      name: 'Part One',
      chapter_order: '["chapter-1","chapter-2"]',
      cover_image_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'part-2',
      book_id: 'book-1',
      name: 'Part Two',
      chapter_order: '["chapter-3"]',
      cover_image_id: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ]
}

function createChapters(): Chapter[] {
  return [
    {
      id: 'chapter-1',
      book_id: 'book-1',
      part_id: 'part-1',
      title: 'Arrival',
      text: '',
      word_count: 100,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'chapter-2',
      book_id: 'book-1',
      part_id: 'part-1',
      title: 'Escape',
      text: '',
      word_count: 200,
      created_at: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'chapter-3',
      book_id: 'book-1',
      part_id: 'part-2',
      title: 'Return',
      text: '',
      word_count: 300,
      created_at: '2026-01-03T00:00:00.000Z',
    },
  ]
}

describe('useChapterSummaryContext', () => {
  it('falls back to prior chapter summaries when a prior part summary is missing', async () => {
    const getSummary = vi.fn(async (chapterId: string): Promise<ChapterSummary | null> => ({
      id: `summary-${chapterId}`,
      chapter_id: chapterId,
      summary: `${chapterId} summary`,
      pov: null,
      characters: null,
      beats: null,
      spoilers_ok: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }))

    const getPartSummary = vi.fn(async (): Promise<PartSummary | null> => null)

    const context = useChapterSummaryContext({
      getCurrentBook: createBook,
      getParts: createParts,
      getChapters: createChapters,
      getSummary,
      getPartSummary,
    })

    const summaries = await context.buildPriorPartSummaries('part-2')

    expect(summaries).toEqual([
      {
        partId: 'part-1',
        partTitle: 'Part One',
        summary: 'Arrival (chapter-1)\nchapter-1 summary\n\nEscape (chapter-2)\nchapter-2 summary',
        partNumber: 1,
      },
    ])
    expect(getPartSummary).toHaveBeenCalledWith('part-1')
    expect(getSummary).toHaveBeenCalledTimes(2)
  })

  it('uses cached and primed chapter summaries before hitting the database callback', async () => {
    const getSummary = vi.fn(async (chapterId: string): Promise<ChapterSummary | null> => ({
      id: `summary-${chapterId}`,
      chapter_id: chapterId,
      summary: `${chapterId} summary`,
      pov: null,
      characters: null,
      beats: null,
      spoilers_ok: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }))

    const context = useChapterSummaryContext({
      getCurrentBook: createBook,
      getParts: createParts,
      getChapters: createChapters,
      getSummary,
      getPartSummary: async () => null,
    })

    context.primeChapterSummary('chapter-1', {
      id: 'summary-chapter-1',
      chapter_id: 'chapter-1',
      summary: 'Primed summary',
      pov: null,
      characters: null,
      beats: null,
      spoilers_ok: false,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    })

    const summaries = await context.buildPriorChapterSummariesInPart(createParts()[0], 'chapter-2')

    expect(summaries).toEqual([
      {
        id: 'chapter-1',
        title: 'Arrival',
        summary: 'Primed summary',
      },
    ])
    expect(getSummary).not.toHaveBeenCalled()

    context.invalidateChapterSummary('chapter-1')
    await context.buildPriorChapterSummariesInPart(createParts()[0], 'chapter-2')
    expect(getSummary).toHaveBeenCalledWith('chapter-1')
  })
})
