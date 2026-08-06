import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useBookCover } from '@/composables/useBookCover'
import type { Book, ImageAsset } from '@/lib/database'

const asset = (over: Partial<ImageAsset> = {}): ImageAsset => ({
  id: 'img-1', book_id: 'book-1', chapter_id: null, asset_type: 'cover',
  file_name: 'cover.png', file_path: '/cover.png', mime_type: 'image/png',
  image_data: null, notes: '', created_at: '2026-01-01', updated_at: '2026-01-01', ...over,
})

function setup(bookValue: Book | null = { id: 'book-1', title: 'B', chapter_order: '[]', part_order: '[]', cover_image_id: null, created_at: '2026-01-01' }) {
  const book = ref<Book | null>(bookValue)
  const deps = {
    book,
    fetchBookCover: vi.fn(async () => asset()),
    getImageSource: vi.fn(async () => 'blob:cover'),
    pickNewBookCover: vi.fn(async () => asset({ id: 'img-2' })),
    deleteImage: vi.fn(async () => {}),
    setBookCoverImageId: vi.fn(async () => {}),
  }
  return { book, deps, cover: useBookCover(deps) }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('useBookCover', () => {
  it('loads a cover and derives its source URL', async () => {
    const { cover, deps } = setup()
    await cover.loadBookCoverImage('book-1')

    expect(deps.fetchBookCover).toHaveBeenCalledWith('book-1')
    expect(deps.getImageSource).toHaveBeenCalled()
    expect(cover.bookCoverSrc.value).toBe('blob:cover')
    expect(cover.coverLoading.value).toBe(false)
    expect(cover.coverError.value).toBeNull()
  })

  it('clears the source when there is no cover asset', async () => {
    const { cover, deps } = setup()
    deps.fetchBookCover.mockResolvedValueOnce(null)
    await cover.loadBookCoverImage('book-1')

    expect(cover.bookCoverSrc.value).toBeNull()
    expect(deps.getImageSource).not.toHaveBeenCalled()
  })

  it('records an error when loading the cover fails', async () => {
    const { cover, deps } = setup()
    deps.fetchBookCover.mockRejectedValueOnce(new Error('boom'))
    await cover.loadBookCoverImage('book-1')

    expect(cover.coverError.value).toBe('boom')
    expect(cover.coverLoading.value).toBe(false)
  })

  it('selects a new cover and writes it back onto the book', async () => {
    const { cover, deps, book } = setup()
    await cover.handleSelectBookCover()

    expect(deps.pickNewBookCover).toHaveBeenCalledWith('book-1')
    expect(cover.bookCoverSrc.value).toBe('blob:cover')
    expect(book.value?.cover_image_id).toBe('img-2')
  })

  it('does nothing when selecting a cover with no book loaded', async () => {
    const { cover, deps } = setup(null)
    await cover.handleSelectBookCover()
    expect(deps.pickNewBookCover).not.toHaveBeenCalled()
  })

  it('deletes the cover and clears it off the book', async () => {
    const { cover, deps, book } = setup()
    await cover.loadBookCoverImage('book-1') // establishes bookCoverImage
    await cover.handleDeleteBookCover()

    expect(deps.deleteImage).toHaveBeenCalled()
    expect(deps.setBookCoverImageId).toHaveBeenCalledWith('book-1', null)
    expect(cover.bookCoverSrc.value).toBeNull()
    expect(book.value?.cover_image_id).toBeNull()
  })

  it('does nothing when deleting with no cover present', async () => {
    const { cover, deps } = setup()
    await cover.handleDeleteBookCover()
    expect(deps.deleteImage).not.toHaveBeenCalled()
  })
})
