import { ref, type Ref } from 'vue'
import type { Book, ImageAsset } from '@/lib/database'

interface UseBookCoverDeps {
  book: Ref<Book | null>
  fetchBookCover: (bookId: string) => Promise<ImageAsset | null>
  getImageSource: (asset: ImageAsset) => Promise<string>
  pickNewBookCover: (bookId: string) => Promise<ImageAsset | null>
  deleteImage: (asset: ImageAsset) => Promise<void>
  setBookCoverImageId: (bookId: string, imageId: string | null) => Promise<void>
}

/**
 * The book's cover image: loading it, picking a new one, and removing it, plus
 * the derived source URL and loading/error state.
 */
export function useBookCover(deps: UseBookCoverDeps) {
  const { book, fetchBookCover, getImageSource, pickNewBookCover, deleteImage, setBookCoverImageId } = deps

  const bookCoverImage = ref<ImageAsset | null>(null)
  const bookCoverSrc = ref<string | null>(null)
  const coverLoading = ref(false)
  const coverError = ref<string | null>(null)

  const loadBookCoverImage = async (targetBookId: string) => {
    coverLoading.value = true
    coverError.value = null
    try {
      const asset = await fetchBookCover(targetBookId)
      bookCoverImage.value = asset
      bookCoverSrc.value = asset ? await getImageSource(asset) : null
    } catch (error) {
      coverError.value = error instanceof Error ? error.message : 'Failed to load book cover'
    } finally {
      coverLoading.value = false
    }
  }

  const handleSelectBookCover = async () => {
    if (!book.value) return

    coverLoading.value = true
    coverError.value = null
    try {
      const asset = await pickNewBookCover(book.value.id)
      if (asset) {
        bookCoverImage.value = asset
        bookCoverSrc.value = await getImageSource(asset)
        book.value.cover_image_id = asset.id
      }
    } catch (error) {
      coverError.value = error instanceof Error ? error.message : 'Failed to update book cover'
    } finally {
      coverLoading.value = false
    }
  }

  const handleDeleteBookCover = async () => {
    if (!book.value || !bookCoverImage.value) return

    coverLoading.value = true
    coverError.value = null
    try {
      await deleteImage(bookCoverImage.value)
      await setBookCoverImageId(book.value.id, null)
      bookCoverImage.value = null
      bookCoverSrc.value = null
      book.value.cover_image_id = null
    } catch (error) {
      coverError.value = error instanceof Error ? error.message : 'Failed to delete book cover'
    } finally {
      coverLoading.value = false
    }
  }

  return {
    bookCoverImage,
    bookCoverSrc,
    coverLoading,
    coverError,
    loadBookCoverImage,
    handleSelectBookCover,
    handleDeleteBookCover,
  }
}
