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
  updateImageAssetIntegrity: vi.fn(),
  setImageWikiTags: vi.fn(),
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
  imageMocks.updateImageAssetIntegrity.mockResolvedValue(undefined)
  imageMocks.setImageWikiTags.mockResolvedValue(undefined)
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
      content_hash: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      content_hash_algorithm: 'sha256-v1',
      content_byte_length: 3,
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

  it('keeps duplicate-content assets independently owned while assigning the same hash', async () => {
    const write = vi.spyOn(IndexedDbImageContentStore.prototype, 'write').mockResolvedValue(undefined)
    const remove = vi.spyOn(IndexedDbImageContentStore.prototype, 'delete').mockResolvedValue(undefined)
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    const library = useImageLibrary()

    const saved = await library.addImagesFromFiles([file('first.png'), file('duplicate.png')], {
      bookId: 'book-1', chapterId: 'chapter-1', assetType: 'chapter',
    })

    expect(saved[0].content_hash).toBe(saved[1].content_hash)
    expect(saved[0].id).not.toBe(saved[1].id)
    expect(saved[0].file_path).not.toBe(saved[1].file_path)
    expect(write.mock.calls.map(([storedAsset]) => storedAsset.id)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ])

    await library.deleteImage(saved[0])

    expect(imageMocks.deleteImageAssetRecord).toHaveBeenCalledWith(saved[0].id)
    expect(remove).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith(saved[0])
    expect(imageMocks.deleteImageAssetRecord).not.toHaveBeenCalledWith(saved[1].id)
    randomUUID.mockRestore()
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

  it('progressively backfills integrity metadata when a legacy image is read', async () => {
    const stored = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    vi.spyOn(IndexedDbImageContentStore.prototype, 'read').mockResolvedValue(stored)
    const legacyAsset = asset()
    const library = useImageLibrary()

    await expect(library.getImageBlob(legacyAsset)).resolves.toBe(stored)

    const integrity = {
      content_hash: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      content_hash_algorithm: 'sha256-v1',
      content_byte_length: 3,
    }
    expect(imageMocks.updateImageAssetIntegrity).toHaveBeenCalledWith('image-1', integrity)
    expect(legacyAsset).toEqual(expect.objectContaining(integrity))
  })

  it('keeps legacy images readable and retryable when hash metadata cannot be saved', async () => {
    const stored = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    vi.spyOn(IndexedDbImageContentStore.prototype, 'read').mockResolvedValue(stored)
    imageMocks.updateImageAssetIntegrity.mockRejectedValue(new Error('database unavailable'))
    const legacyAsset = asset()
    const library = useImageLibrary()

    await expect(library.getImageBlob(legacyAsset)).resolves.toBe(stored)
    await expect(library.getImageBlob(legacyAsset)).resolves.toBe(stored)

    expect(imageMocks.updateImageAssetIntegrity).toHaveBeenCalledTimes(2)
    expect(legacyAsset.content_hash).toBeUndefined()
    expect(imageMocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('will be retried'),
      expect.any(Error),
    )
  })

  it('rejects stored bytes that do not match persisted integrity metadata', async () => {
    vi.spyOn(IndexedDbImageContentStore.prototype, 'read')
      .mockResolvedValue(new Blob([new Uint8Array([9, 9, 9])], { type: 'image/png' }))
    const library = useImageLibrary()

    await expect(library.getImageBlob(asset({
      content_hash: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      content_hash_algorithm: 'sha256-v1',
      content_byte_length: 3,
    }))).rejects.toThrow(/failed its integrity check.*known-good backup/i)
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

  it('delegates image queries and returns the first chapter image when present', async () => {
    const chapterImage = asset({ id: 'chapter-image' })
    const partImage = asset({ id: 'part-image', asset_type: 'part' })
    const bookCover = asset({ id: 'book-cover', asset_type: 'cover' })
    const partCover = asset({ id: 'part-cover', asset_type: 'part_cover' })
    const chapterCover = asset({ id: 'chapter-cover', asset_type: 'chapter_cover' })
    imageMocks.getChapterImageAssets
      .mockResolvedValueOnce([chapterImage])
      .mockResolvedValueOnce([])
    imageMocks.getPartImageAssets.mockResolvedValueOnce([partImage])
    imageMocks.getBookCoverImageAsset.mockResolvedValueOnce(bookCover)
    imageMocks.getPartCoverImageAsset.mockResolvedValueOnce(partCover)
    imageMocks.getChapterCoverImageAsset.mockResolvedValueOnce(chapterCover)
    const library = useImageLibrary()

    await expect(library.fetchChapterImages('chapter-1')).resolves.toEqual([chapterImage])
    await expect(library.fetchFirstChapterImage('empty-chapter')).resolves.toBeNull()
    await expect(library.fetchPartImages('part-1')).resolves.toEqual([partImage])
    await expect(library.fetchBookCover('book-1')).resolves.toBe(bookCover)
    await expect(library.fetchPartCover('part-1')).resolves.toBe(partCover)
    await expect(library.fetchChapterCover('chapter-1')).resolves.toBe(chapterCover)
    expect(library.canDisplayImages()).toBe(true)
    expect(library.canDownloadImages.value).toBe(true)
  })

  it('builds chapter and part thumbnail maps while skipping missing and unreadable images', async () => {
    const chapterImage = asset({ id: 'chapter-image' })
    const brokenChapterImage = asset({ id: 'broken-chapter', file_name: 'broken.png' })
    const partCover = asset({ id: 'part-cover', asset_type: 'part_cover' })
    const brokenPartCover = asset({ id: 'broken-part', asset_type: 'part_cover', file_name: 'broken.png' })
    imageMocks.getChapterImageAssets.mockImplementation(async (id: string) => ({
      good: [chapterImage], broken: [brokenChapterImage], empty: [],
    })[id] ?? [])
    imageMocks.getPartCoverImageAsset.mockImplementation(async (id: string) => ({
      good: partCover, broken: brokenPartCover, empty: null,
    })[id] ?? null)
    vi.spyOn(IndexedDbImageContentStore.prototype, 'read').mockImplementation(async (entry) => {
      if (entry.id.startsWith('broken')) throw new Error('IndexedDB unavailable')
      return new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const library = useImageLibrary()

    await expect(library.fetchChapterThumbnails(['good', 'broken', 'empty'])).resolves.toEqual({
      good: 'blob:image-source',
    })
    await expect(library.fetchPartThumbnails(['good', 'broken', 'empty'])).resolves.toEqual({
      good: 'blob:image-source',
    })
    expect(console.warn).toHaveBeenCalledWith(
      '[ImageLibrary] Failed to get image source for chapter',
      'broken',
      expect.any(Error),
    )
    expect(console.warn).toHaveBeenCalledWith(
      '[ImageLibrary] Failed to get image source for part',
      'broken',
      expect.any(Error),
    )
  })

  it('downloads browser images through a temporary anchor using the default filename fallback', async () => {
    vi.spyOn(IndexedDbImageContentStore.prototype, 'read')
      .mockResolvedValue(new Blob([new Uint8Array([1])], { type: 'image/png' }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const append = vi.spyOn(document.body, 'appendChild')
    const remove = vi.spyOn(document.body, 'removeChild')
    const library = useImageLibrary()

    await library.downloadOrShareImage(asset({ file_name: '' }))

    const link = append.mock.calls[0][0] as HTMLAnchorElement
    expect(link.href).toContain('blob:image-source')
    expect(link.download).toBe('illustration-image-1.jpg')
    expect(click).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledWith(link)
  })

  it('reports incomplete integrity metadata and browser storage read failures', async () => {
    const library = useImageLibrary()
    vi.spyOn(IndexedDbImageContentStore.prototype, 'read')
      .mockResolvedValueOnce(new Blob([new Uint8Array([1])], { type: 'image/png' }))
      .mockRejectedValueOnce(new Error('quota database closed'))

    await expect(library.getImageBlob(asset({
      content_hash: 'a'.repeat(64),
      content_hash_algorithm: null,
      content_byte_length: null,
    }))).rejects.toThrow('integrity metadata for scene.png is incomplete')
    await expect(library.getImageBlob(asset())).rejects.toThrow(/could not be loaded in browser storage/i)
  })

  it('inspects image content without deleting orphans when cleanup is disabled', async () => {
    vi.spyOn(IndexedDbImageContentStore.prototype, 'exists').mockResolvedValue(false)
    vi.spyOn(IndexedDbImageContentStore.prototype, 'listStoredIds').mockResolvedValue(['orphan'])

    await expect(useImageLibrary().reconcileImageContent([asset()], false)).resolves.toEqual({
      missingImageIds: ['image-1'],
      orphanedImageIds: ['orphan'],
    })
  })

  it('replaces a browser book cover and removes the previous cover', async () => {
    const previousCover = asset({ id: 'previous-cover', asset_type: 'cover' })
    imageMocks.getBookCoverImageAsset.mockResolvedValueOnce(previousCover)
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000010')
    vi.spyOn(IndexedDbImageContentStore.prototype, 'write').mockResolvedValue(undefined)
    const removeContent = vi.spyOn(IndexedDbImageContentStore.prototype, 'delete').mockResolvedValue(undefined)
    const picker = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () {
      Object.defineProperty(this, 'files', { configurable: true, value: [file('cover.png')] })
      this.dispatchEvent(new Event('change'))
    })

    const result = await useImageLibrary().pickNewBookCover('book-1')

    expect(result).toEqual(expect.objectContaining({
      id: '00000000-0000-4000-8000-000000000010', asset_type: 'cover',
    }))
    expect(imageMocks.setBookCoverImageId).toHaveBeenCalledWith('book-1', result?.id)
    expect(imageMocks.deleteImageAssetRecord).toHaveBeenCalledWith('previous-cover')
    expect(removeContent).toHaveBeenCalledWith(previousCover)
    picker.mockRestore()
  })

  it('rolls back a newly saved browser part cover when assigning it fails', async () => {
    imageMocks.getPartCoverImageAsset.mockResolvedValueOnce(null)
    imageMocks.setPartCoverImageId.mockRejectedValueOnce(new Error('part update failed'))
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000011')
    vi.spyOn(IndexedDbImageContentStore.prototype, 'write').mockResolvedValue(undefined)
    const removeContent = vi.spyOn(IndexedDbImageContentStore.prototype, 'delete').mockResolvedValue(undefined)
    const picker = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () {
      Object.defineProperty(this, 'files', { configurable: true, value: [file('part.png')] })
      this.dispatchEvent(new Event('change'))
    })

    await expect(useImageLibrary().pickPartCover('book-1', 'part-1'))
      .rejects.toThrow('part update failed')

    expect(imageMocks.deleteImageAssetRecord).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000011',
    )
    expect(removeContent).toHaveBeenCalledOnce()
    picker.mockRestore()
  })

  it('returns null when browser cover selection is canceled', async () => {
    imageMocks.getBookCoverImageAsset.mockResolvedValueOnce(null)
    imageMocks.getPartCoverImageAsset.mockResolvedValueOnce(null)
    const picker = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () {
      this.dispatchEvent(new Event('cancel'))
    })
    const library = useImageLibrary()

    await expect(library.pickNewBookCover('book-1')).resolves.toBeNull()
    await expect(library.pickPartCover('book-1', 'part-1')).resolves.toBeNull()
    expect(imageMocks.saveImageAssetRecord).not.toHaveBeenCalled()
    picker.mockRestore()
  })
})
