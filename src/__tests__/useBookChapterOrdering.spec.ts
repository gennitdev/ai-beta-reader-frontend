import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import {
  useBookChapterOrdering,
  parseIdArray,
  applyOrder,
  buildChapterOrder,
} from '@/composables/useBookChapterOrdering'
import type { Book, BookPart } from '@/lib/database'
import type { BookChapter } from '@/types/bookView'

function chapter(id: string, overrides: Partial<BookChapter> = {}): BookChapter {
  return {
    id,
    title: id,
    content: '',
    position: 0,
    position_in_part: null,
    part_id: null,
    part_name: null,
    word_count: 0,
    ...overrides,
  } as BookChapter
}

function part(id: string, createdAt: string): BookPart {
  return { id, book_id: 'book-1', name: id, created_at: createdAt } as BookPart
}

describe('parseIdArray', () => {
  it('parses a JSON array of ids', () => {
    expect(parseIdArray('["a","b"]')).toEqual(['a', 'b'])
  })
  it('returns [] for null/undefined/empty', () => {
    expect(parseIdArray(null)).toEqual([])
    expect(parseIdArray(undefined)).toEqual([])
    expect(parseIdArray('')).toEqual([])
  })
  it('returns [] for invalid JSON or non-array JSON', () => {
    expect(parseIdArray('not json')).toEqual([])
    expect(parseIdArray('{"a":1}')).toEqual([])
  })
})

describe('applyOrder', () => {
  it('returns items unchanged when no order is given', () => {
    const items = [chapter('a'), chapter('b')]
    expect(applyOrder(items, [])).toBe(items)
  })
  it('orders by ids, appends unlisted items, and stamps positions', () => {
    const result = applyOrder([chapter('a'), chapter('b'), chapter('c')], ['c', 'a'])
    expect(result.map((c) => c.id)).toEqual(['c', 'a', 'b'])
    expect(result.map((c) => c.position)).toEqual([0, 1, 2])
  })
})

describe('buildChapterOrder', () => {
  it('places uncategorized first, then parts in partOrder, then unvisited parts', () => {
    const partUpdates = {
      null: ['u1', 'u2'],
      'part-b': ['b1'],
      'part-a': ['a1', 'a2'],
      'part-z': ['z1'],
    }
    expect(buildChapterOrder(partUpdates, ['part-a', 'part-b'])).toEqual([
      'u1', 'u2', 'a1', 'a2', 'b1', 'z1',
    ])
  })
})

function makeDeps(overrides: {
  book?: Book | null
  parts?: BookPart[]
  chapters?: BookChapter[]
} = {}) {
  const book = ref<Book | null>(
    overrides.book === undefined
      ? ({ id: 'book-1', part_order: null } as Book)
      : overrides.book,
  )
  const parts = ref<BookPart[]>(overrides.parts ?? [])
  const chapters = ref<BookChapter[]>(overrides.chapters ?? [])
  const sortedChapters = computed(() =>
    chapters.value.slice().sort((a, b) => (a.position || 0) - (b.position || 0)),
  )
  const updateChapterOrders = vi.fn(async () => {})
  const updatePartOrder = vi.fn(async () => {})
  const loadBook = vi.fn(async () => {})
  const ordering = useBookChapterOrdering({
    book,
    parts,
    chapters,
    sortedChapters,
    bookId: ref('book-1'),
    updateChapterOrders,
    updatePartOrder,
    loadBook,
  })
  return { book, parts, chapters, ordering, updateChapterOrders, updatePartOrder, loadBook }
}

describe('useBookChapterOrdering', () => {
  it('orders parts by partOrder then remaining by created_at', async () => {
    const { parts, ordering } = makeDeps({
      parts: [part('p1', '2024-01-03'), part('p2', '2024-01-01'), part('p3', '2024-01-02')],
    })
    // No stored order → all "remaining", sorted by created_at ascending.
    expect(ordering.orderedParts.value.map((p) => p.id)).toEqual(['p2', 'p3', 'p1'])

    ordering.setPartOrderState(['p1'])
    void parts
    expect(ordering.orderedParts.value.map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
  })

  it('groups chapters by part with word counts and uncategorized', () => {
    const { ordering } = makeDeps({
      parts: [part('p1', '2024-01-01')],
      chapters: [
        chapter('c1', { part_id: 'p1', word_count: 100, position: 0 }),
        chapter('c2', { part_id: 'p1', word_count: 50, position: 1 }),
        chapter('c3', { part_id: null, word_count: 25, position: 2 }),
      ],
    })
    ordering.setPartOrderState(['p1'])
    const grouped = ordering.chaptersByPart.value
    expect(grouped.parts[0].chapters.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(grouped.parts[0].wordCount).toBe(150)
    expect(grouped.uncategorized.map((c) => c.id)).toEqual(['c3'])
    expect(grouped.uncategorizedWordCount).toBe(25)
  })

  it('syncPartOrderWithParts sanitizes stored order, appends missing, and persists changes', async () => {
    const { book, ordering, updatePartOrder } = makeDeps({
      book: { id: 'book-1', part_order: JSON.stringify(['p1', 'gone']) } as Book,
      parts: [part('p1', '2024-01-02'), part('p2', '2024-01-01')],
    })
    await ordering.syncPartOrderWithParts()
    // 'gone' dropped (not a real part), 'p2' appended.
    expect(ordering.partOrder.value).toEqual(['p1', 'p2'])
    expect(updatePartOrder).toHaveBeenCalledWith('book-1', ['p1', 'p2'])
    expect(book.value?.part_order).toBe(JSON.stringify(['p1', 'p2']))
  })

  it('does not persist when the reconciled part order is unchanged', async () => {
    const { ordering, updatePartOrder } = makeDeps({
      book: { id: 'book-1', part_order: JSON.stringify(['p1']) } as Book,
      parts: [part('p1', '2024-01-01')],
    })
    await ordering.syncPartOrderWithParts()
    expect(updatePartOrder).not.toHaveBeenCalled()
    expect(ordering.partOrder.value).toEqual(['p1'])
  })

  it('saveSidebarChapterOrder persists the flattened order and reloads', async () => {
    const { ordering, updateChapterOrders, loadBook } = makeDeps({
      parts: [part('p1', '2024-01-01')],
      chapters: [
        chapter('c1', { part_id: 'p1' }),
        chapter('u1', { part_id: null }),
      ],
    })
    ordering.setPartOrderState(['p1'])
    ordering.syncSidebarLists()

    await ordering.saveSidebarChapterOrder()

    expect(updateChapterOrders).toHaveBeenCalledWith(
      'book-1',
      ['u1', 'c1'],
      { null: ['u1'], p1: ['c1'] },
      ['p1'],
    )
    expect(loadBook).toHaveBeenCalled()
  })

  it('reloads even when the order persist fails', async () => {
    const { ordering, updateChapterOrders, loadBook } = makeDeps({
      parts: [part('p1', '2024-01-01')],
      chapters: [chapter('c1', { part_id: 'p1' })],
    })
    ordering.setPartOrderState(['p1'])
    ordering.syncSidebarLists()
    updateChapterOrders.mockRejectedValueOnce(new Error('offline'))

    await ordering.saveSidebarChapterOrder()
    expect(loadBook).toHaveBeenCalled()
  })
})
