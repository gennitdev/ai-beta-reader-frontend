// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '@/lib/database'

const imageMocks = vi.hoisted(() => ({
  saveImageAssetRecord: vi.fn(),
  deleteImageAssetRecord: vi.fn(),
  getChapterImageAssets: vi.fn(),
  getPartImageAssets: vi.fn(),
  getBookCoverImageAsset: vi.fn(),
  setBookCoverImageId: vi.fn(),
  getPartCoverImageAsset: vi.fn(),
  setPartCoverImageId: vi.fn(),
  getChapterCoverImageAsset: vi.fn(),
  setChapterCoverImageId: vi.fn(),
  requestPersistentBrowserStorage: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock('@/composables/useDatabase', () => ({
  useDatabase: () => imageMocks,
}))
vi.mock('@/utils/platform', () => ({ isDesktopAppRuntime: () => false }))
vi.mock('@/lib/browserStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/browserStorage')>()
  return { ...actual, requestPersistentBrowserStorage: imageMocks.requestPersistentBrowserStorage }
})
vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), warn: imageMocks.loggerWarn },
}))

import { useImageLibrary } from '@/composables/useImageLibrary'
import { IndexedDbImageContentStore } from '@/lib/imageContentStore'

function asset(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: 'image-1', book_id: 'book-1', chapter_id: 'chapter-1', asset_type: 'chapter',
    file_name: 'scene.png', file_path: 'web/image-1/scene.png', mime_type: 'image/png',
    image_data: null, notes: '', created_at: '', updated_at: '', ...overrides,
  }
}

function file(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })
}

beforeEach(() => {
  vi.clearAllMocks()
  imageMocks.saveImageAssetRecord.mockResolvedValue(undefined)
  imageMocks.deleteImageAssetRecord.mockResolvedValue(undefined)
  imageMocks.requestPersistentBrowserStorage.mockResolvedValue(undefined)
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {} })
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })))
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:image-source') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
})

describe('useImageLibrary browser lifecycle', () => {
  it('validates, persists, and records selected image files', async () => {
    const write = vi.spyOn(IndexedDbImageContentStore.prototype, 'write').mockResolvedValue(undefined)
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    const library = useImageLibrary()

    const saved = await library.addImagesFromFiles([file('one.png'), file('two.png')], {
      bookId: 'book-1', chapterId: 'chapter-1', assetType: 'chapter',
    })

    expect(imageMocks.requestPersistentBrowserStorage).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledTimes(2)
    expect(imageMocks.saveImageAssetRecord).toHaveBeenCalledTimes(2)
    expect(saved.map((entry) => entry.id)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ])
    expect(saved[0]).toEqual(expect.objectContaining({
      file_path: 'web/00000000-0000-4000-8000-000000000001/one.png',
      image_data: null,
    }))
    randomUUID.mockRestore()
  })

  it('rolls back content and metadata when a later database write fails', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    vi.spyOn(IndexedDbImageContentStore.prototype, 'write').mockResolvedValue(undefined)
    const deleteContent = vi.spyOn(IndexedDbImageContentStore.prototype, 'delete').mockResolvedValue(undefined)
    imageMocks.saveImageAssetRecord
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('metadata write failed'))
    const library = useImageLibrary()

    await expect(library.addImagesFromFiles([file('one.png'), file('two.png')], {
      bookId: 'book-1', chapterId: 'chapter-1', assetType: 'chapter',
    })).rejects.toThrow('metadata write failed')

    expect(imageMocks.deleteImageAssetRecord).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
    )
    expect(deleteContent).toHaveBeenCalledTimes(2)
  })

  it('uses stored blobs, falls back to embedded backups, and caches object URLs', async () => {
    const stored = new Blob(['stored'], { type: 'image/png' })
    const read = vi.spyOn(IndexedDbImageContentStore.prototype, 'read')
      .mockResolvedValueOnce(stored)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(stored)
      .mockResolvedValueOnce(null)
    const library = useImageLibrary()

    await expect(library.getImageBlob(asset())).resolves.toBe(stored)
    const embedded = await library.getImageBlob(asset({
      id: 'embedded', image_data: 'data:image/gif;base64,AQID',
    }))
    expect(embedded.type).toBe('image/gif')
    expect(new Uint8Array(await embedded.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))

    await expect(library.getImageSource(asset({ id: 'cached' }))).resolves.toBe('blob:image-source')
    await expect(library.getImageSource(asset({ id: 'cached' }))).resolves.toBe('blob:image-source')
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    await expect(library.getImageBlob(asset({ id: 'missing', file_name: 'missing.png' })))
      .rejects.toThrow('image data for missing.png is missing')
    expect(read).toHaveBeenCalledTimes(4)
  })

  it('deletes metadata first and reports orphaned content for later reconciliation', async () => {
    const deleteContent = vi.spyOn(IndexedDbImageContentStore.prototype, 'delete')
      .mockRejectedValue(new Error('IndexedDB unavailable'))
    const library = useImageLibrary()

    await expect(library.deleteImage(asset())).resolves.toBeUndefined()

    expect(imageMocks.deleteImageAssetRecord).toHaveBeenCalledWith('image-1')
    expect(deleteContent).toHaveBeenCalledOnce()
    expect(imageMocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('eligible for reconciliation'),
      expect.any(Error),
    )
  })

  it('inspects missing content and removes orphaned browser records', async () => {
    vi.spyOn(IndexedDbImageContentStore.prototype, 'exists').mockImplementation(
      async (entry) => entry.id === 'present',
    )
    vi.spyOn(IndexedDbImageContentStore.prototype, 'listStoredIds')
      .mockResolvedValue(['present', 'orphan'])
    const deleteStoredId = vi.spyOn(IndexedDbImageContentStore.prototype, 'deleteStoredId')
      .mockResolvedValue(undefined)
    const library = useImageLibrary()

    const result = await library.reconcileImageContent([
      asset({ id: 'present' }),
      asset({ id: 'missing' }),
      asset({ id: 'embedded', image_data: 'data:image/png;base64,AQ==' }),
    ], true)

    expect(result).toEqual({
      missingImageIds: ['missing'],
      orphanedImageIds: ['orphan'],
      deletedOrphanIds: ['orphan'],
      failedOrphanIds: [],
    })
    expect(deleteStoredId).toHaveBeenCalledWith('orphan')
  })
})
