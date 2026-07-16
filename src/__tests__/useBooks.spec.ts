import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBooks } from '@/composables/useBooks'

const { saveBook, booksRef, loadingRef, errorRef, loadBooks } = vi.hoisted(() => ({
  saveBook: vi.fn(async () => {}),
  booksRef: { current: [] as unknown[] },
  loadingRef: { current: false },
  errorRef: { current: null as string | null },
  loadBooks: vi.fn(async () => {}),
}))

vi.mock('@/composables/useDatabase', () => ({
  useDatabase: () => ({
    books: ref(booksRef.current),
    loading: ref(loadingRef.current),
    error: ref(errorRef.current),
    loadBooks,
    saveBook,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useBooks', () => {
  it('re-exposes the database state and loaders', () => {
    const { books, loading, error, loadBooks: exposedLoad, createBook } = useBooks()
    expect(books.value).toEqual([])
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()
    expect(exposedLoad).toBe(loadBooks)
    expect(typeof createBook).toBe('function')
  })

  it('createBook persists a normalized book and returns it with a chapter count', async () => {
    const { createBook } = useBooks()
    const result = await createBook({ id: 'book-1', title: 'My Book' })

    expect(saveBook).toHaveBeenCalledTimes(1)
    const saved = saveBook.mock.calls[0][0] as Record<string, unknown>
    expect(saved).toMatchObject({
      id: 'book-1',
      title: 'My Book',
      chapter_order: '[]',
      part_order: '[]',
      cover_image_id: null,
    })
    expect(typeof saved.created_at).toBe('string')
    expect(Number.isNaN(Date.parse(saved.created_at as string))).toBe(false)

    expect(result).toMatchObject({ id: 'book-1', title: 'My Book', chapterCount: 0 })
  })
})
