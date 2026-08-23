import { logger } from '@/lib/logger'
import type { BookDeletionPreview, PendingImageDeletion } from '@/lib/database'
import { useDatabase } from './useDatabase'
import { useImageLibrary } from './useImageLibrary'

export interface BookDeletionOutcome {
  preview: BookDeletionPreview
  pendingCleanupCount: number
}

export function useBookDeletion() {
  const {
    deleteBook,
    getBookDeletionPreview,
    getPendingImageDeletions,
    completePendingImageDeletion,
    failPendingImageDeletion,
  } = useDatabase()
  const { deletePendingImageContent } = useImageLibrary()

  async function cleanPendingImages(images: PendingImageDeletion[]): Promise<number> {
    let failures = 0
    for (const image of images) {
      try {
        await deletePendingImageContent(image)
        await completePendingImageDeletion(image.imageId)
      } catch (error) {
        failures += 1
        logger.warn(`[BookDeletion] Image cleanup remains pending for ${image.imageId}`, error)
        await failPendingImageDeletion(image.imageId, error).catch((queueError) => {
          logger.error(`[BookDeletion] Failed to record cleanup error for ${image.imageId}`, queueError)
        })
      }
    }
    return failures
  }

  async function deleteBookAndCleanup(bookId: string): Promise<BookDeletionOutcome> {
    const result = await deleteBook(bookId)
    const pendingCleanupCount = await cleanPendingImages(result.pendingImages)
    return { preview: result.preview, pendingCleanupCount }
  }

  async function retryPendingImageCleanup(): Promise<number> {
    const pending = await getPendingImageDeletions()
    return cleanPendingImages(pending)
  }

  return {
    getBookDeletionPreview,
    deleteBookAndCleanup,
    retryPendingImageCleanup,
  }
}
