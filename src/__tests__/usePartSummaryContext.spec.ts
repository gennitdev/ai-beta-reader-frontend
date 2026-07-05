import { computed, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { usePartSummaryContext } from '@/composables/usePartSummaryContext'
import type { Book, BookPart, Chapter, ChapterSummary, PartSummary } from '@/lib/database'

function createBook(): Book {
  return {
    id: 'book-1',
    title: 'Book One',
    chapter_order: '["chapter-2","chapter-1","chapter-3"]',
    part_order: '["part-1"]',
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

function createPart(): BookPart {
  return {
    id: 'part-1',
    book_id: 'book-1',
    name: 'Part One',
    chapter_order: '["chapter-2","chapter-1"]',
    cover_image_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function createChapters(): Chapter[] {
  return [
    {
      id: 'chapter-1',
      book_id: 'book-1',
      part_id: 'part-1',
      title: 'First',
      text: '',
      word_count: 120,
      created_at: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'chapter-2',
      book_id: 'book-1',
      part_id: 'part-1',
      title: 'Second',
      text: '',
      word_count: 180,
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'chapter-3',
      book_id: 'book-1',
      part_id: null,
      title: 'Other',
      text: '',
      word_count: 300,
      created_at: '2026-01-03T00:00:00.000Z',
    },
  ]
}

describe('usePartSummaryContext', () => {
  it('hydrates part chapter entries in part order and computes summary coverage', async () => {
    const getSummary = vi.fn(async (chapterId: string): Promise<ChapterSummary | null> => {
      if (chapterId === 'chapter-2') {
        return {
          id: 'summary-2',
          chapter_id: 'chapter-2',
          summary: 'Second summary',
          pov: null,
          characters: '["Bob"]',
          beats: '["Reveal"]',
          spoilers_ok: false,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        }
      }
      return null
    })

    const context = usePartSummaryContext({
      book: computed(() => createBook()),
      partId: computed(() => 'part-1'),
      chapters: ref(createChapters()),
      getPartSummary: async () => null,
      getSummary,
    })

    await context.hydrateChapterEntries(createPart())

    expect(context.chapterEntries.value.map((entry) => entry.id)).toEqual(['chapter-2', 'chapter-1'])
    expect(context.chapterEntries.value[0]).toMatchObject({
      summary: 'Second summary',
      characters: ['Bob'],
      beats: ['Reveal'],
    })
    expect(context.totalWordCount.value).toBe(300)
    expect(context.summarizedChapterCount.value).toBe(1)
    expect(context.summaryCoverage.value).toBe('1/2')
    expect(context.availableChapterSummaries.value).toEqual([
      {
        id: 'chapter-2',
        title: 'Second',
        summary: 'Second summary',
      },
    ])
  })

  it('loads part summary metadata and normalizes character and beat arrays', async () => {
    const getPartSummary = vi.fn(async (): Promise<PartSummary | null> => ({
      id: 'part-summary-1',
      part_id: 'part-1',
      summary: 'Part overview',
      characters: '["Alice","Bob"]',
      beats: '["Setup","Twist"]',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    }))

    const context = usePartSummaryContext({
      book: computed(() => createBook()),
      partId: computed(() => 'part-1'),
      chapters: ref(createChapters()),
      getPartSummary,
      getSummary: async () => null,
    })

    await context.loadPartSummaryData('part-1')

    expect(context.partSummary.value).toEqual({
      summary: 'Part overview',
      characters: ['Alice', 'Bob'],
      beats: ['Setup', 'Twist'],
      updatedAt: '2026-01-02T00:00:00.000Z',
    })
    expect(context.editedSummary.value).toBe('Part overview')
    expect(context.hasPartSummary.value).toBe(true)
    expect(getPartSummary).toHaveBeenCalledWith('part-1')
  })
})
