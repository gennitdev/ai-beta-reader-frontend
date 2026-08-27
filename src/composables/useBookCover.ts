import type { Ref } from 'vue'
import type { Book, ImageAsset } from '@/lib/database'
import { useCoverImage } from '@/composables/useCoverImage'

interface UseBookCoverDeps {
  book: Ref<Book | null>
  fetchBookCover: (bookId: string) => Promise<ImageAsset | null>
  getImageSource: (asset: ImageAsset) => Promise<string>
  pickNewBookCover: (bookId: string) => Promise<ImageAsset | null>
  deleteImage: (asset: ImageAsset) => Promise<void>
  setBookCoverImageId: (bookId: string, imageId: string | null) => Promise<void>
  confirmDelete?: (message: string) => boolean
}

/**
 * The book's cover image: loading it, picking a new one, and removing it, plus
 * the derived source URL and loading/error state. A thin adapter over the
 * generic {@link useCoverImage} that adds a native-confirm delete flow.
 */
export function useBookCover(deps: UseBookCoverDeps) {
  const {
    book,
    fetchBookCover,
    getImageSource,
    pickNewBookCover,
    deleteImage,
    setBookCoverImageId,
    confirmDelete = (message: string) => globalThis.confirm(message),
  } = deps

  const cover = useCoverImage({
    entity: book,
    fetchCover: fetchBookCover,
    getImageSource,
    pickCover: (bookId) => pickNewBookCover(bookId),
    deleteImage,
    setCoverImageId: setBookCoverImageId,
    messages: {
      load: 'Failed to load book cover',
      update: 'Failed to update book cover',
      remove: 'Failed to delete book cover',
    },
  })

  const handleDeleteBookCover = async () => {
    if (!book.value || !cover.coverImage.value) return
    if (!confirmDelete('Permanently delete this book cover image? This action cannot be undone.')) return
    await cover.removeCover()
  }

  return {
    bookCoverImage: cover.coverImage,
    bookCoverSrc: cover.coverSrc,
    coverLoading: cover.coverLoading,
    coverError: cover.coverError,
    loadBookCoverImage: cover.loadCover,
    handleSelectBookCover: cover.selectCover,
    handleDeleteBookCover,
  }
}
