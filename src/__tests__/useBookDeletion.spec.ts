import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingImageDeletion } from '@/lib/database'

const h = vi.hoisted(() => ({
  deleteBook: vi.fn(),
  getBookDeletionPreview: vi.fn(),
  getPendingImageDeletions: vi.fn(),
  completePendingImageDeletion: vi.fn(),
  failPendingImageDeletion: vi.fn(),
  deletePendingImageContent: vi.fn(),
}))

vi.mock('@/composables/useDatabase', () => ({
  useDatabase: () => ({
    deleteBook: h.deleteBook,
    getBookDeletionPreview: h.getBookDeletionPreview,
    getPendingImageDeletions: h.getPendingImageDeletions,
    completePendingImageDeletion: h.completePendingImageDeletion,
    failPendingImageDeletion: h.failPendingImageDeletion,
  }),
}))

vi.mock('@/composables/useImageLibrary', () => ({
  useImageLibrary: () => ({ deletePendingImageContent: h.deletePendingImageContent }),
}))

import { useBookDeletion } from '@/composables/useBookDeletion'

const pending = (id: string): PendingImageDeletion => ({
  imageId: id,
  filePath: `web/${id}/image.png`,
  mimeType: 'image/png',
  createdAt: '2026-01-01T00:00:00.000Z',
  attemptCount: 0,
  lastError: null,
})

const preview = {
  bookId: 'book-1', title: 'Book', chapterCount: 1, partCount: 0, wikiPageCount: 0, imageCount: 2,
}

beforeEach(() => {
  vi.clearAllMocks()
  h.completePendingImageDeletion.mockResolvedValue(undefined)
  h.failPendingImageDeletion.mockResolvedValue(undefined)
  h.deletePendingImageContent.mockResolvedValue(undefined)
})

describe('useBookDeletion', () => {
  it('deletes queued image content and clears completed queue entries', async () => {
    h.deleteBook.mockResolvedValue({ preview, pendingImages: [pending('one'), pending('two')] })

    await expect(useBookDeletion().deleteBookAndCleanup('book-1')).resolves.toEqual({
      preview,
      pendingCleanupCount: 0,
    })
    expect(h.deletePendingImageContent).toHaveBeenCalledTimes(2)
    expect(h.completePendingImageDeletion).toHaveBeenCalledWith('one')
    expect(h.completePendingImageDeletion).toHaveBeenCalledWith('two')
    expect(h.failPendingImageDeletion).not.toHaveBeenCalled()
  })

  it('keeps failed content cleanup queued and retries it later', async () => {
    const image = pending('failed')
    h.deleteBook.mockResolvedValue({ preview, pendingImages: [image] })
    h.deletePendingImageContent.mockRejectedValueOnce(new Error('file locked'))

    await expect(useBookDeletion().deleteBookAndCleanup('book-1')).resolves.toEqual({
      preview,
      pendingCleanupCount: 1,
    })
    expect(h.failPendingImageDeletion).toHaveBeenCalledWith('failed', expect.any(Error))

    h.getPendingImageDeletions.mockResolvedValue([image])
    h.deletePendingImageContent.mockResolvedValue(undefined)
    await expect(useBookDeletion().retryPendingImageCleanup()).resolves.toBe(0)
    expect(h.completePendingImageDeletion).toHaveBeenCalledWith('failed')
  })
})
