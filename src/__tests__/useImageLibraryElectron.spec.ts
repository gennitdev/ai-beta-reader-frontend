// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '@/lib/database'
import type { DesktopImagesBridge } from '@/shims/desktop-images'

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
}))

vi.mock('@/composables/useDatabase', () => ({ useDatabase: () => imageMocks }))
vi.mock('@/utils/platform', () => ({ isDesktopAppRuntime: () => true }))
vi.mock('@/lib/runtimeImageContentStore', () => ({ getImageStorageRuntime: () => 'electron' }))
vi.mock('@/lib/logger', () => ({ logger: { log: vi.fn(), warn: vi.fn() } }))

import { useImageLibrary } from '@/composables/useImageLibrary'
import { ElectronImageContentStore } from '@/lib/imageContentStore'

const metadata = (id: string, fileName = `${id}.png`) => ({
  id,
  fileName,
  relativePath: `images/${id}.png`,
  mimeType: 'image/png',
})

function asset(id: string, assetType: ImageAsset['asset_type'] = 'cover'): ImageAsset {
  return {
    id, book_id: 'book-1', chapter_id: null, asset_type: assetType,
    file_name: `${id}.png`, file_path: `images/${id}.png`, mime_type: 'image/png',
    image_data: null, notes: '', created_at: '', updated_at: '',
  }
}

function bridge(overrides: Partial<DesktopImagesBridge> = {}): DesktopImagesBridge {
  return {
    pickChapterImages: vi.fn(async () => ({ canceled: false, images: [] })),
    pickWikiImages: vi.fn(async () => ({ canceled: false, images: [] })),
    pickBookCover: vi.fn(async () => ({ canceled: true })),
    readImageData: vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' })),
    writeImageData: vi.fn(async () => ({ success: true })),
    deleteImageFile: vi.fn(async () => ({ success: true })),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  imageMocks.saveImageAssetRecord.mockResolvedValue(undefined)
  imageMocks.deleteImageAssetRecord.mockResolvedValue(undefined)
  imageMocks.setBookCoverImageId.mockResolvedValue(undefined)
  imageMocks.setPartCoverImageId.mockResolvedValue(undefined)
  imageMocks.updateImageAssetIntegrity.mockResolvedValue(undefined)
  imageMocks.setImageWikiTags.mockResolvedValue(undefined)
  window.desktopImages = bridge()
})

afterEach(() => {
  delete window.desktopImages
  vi.restoreAllMocks()
})

describe('useImageLibrary Electron lifecycle', () => {
  it('refreshes desktop capabilities and saves chapter images selected by the bridge', async () => {
    const desktopBridge = bridge({
      pickChapterImages: vi.fn(async () => ({
        canceled: false,
        images: [metadata('image-1'), metadata('image-2')],
      })),
    })
    window.desktopImages = desktopBridge
    const library = useImageLibrary()

    expect(library.canSelectImages.value).toBe(true)
    window.dispatchEvent(new Event('focus'))
    const saved = await library.addImagesToChapter('book-1', 'chapter-1')

    expect(desktopBridge.pickChapterImages).toHaveBeenCalledWith({
      bookId: 'book-1', chapterId: 'chapter-1', allowMultiple: true,
    })
    expect(saved).toHaveLength(2)
    expect(saved[0]).toEqual(expect.objectContaining({
      id: 'image-1', chapter_id: 'chapter-1', asset_type: 'chapter',
      content_hash_algorithm: 'sha256-v1', content_byte_length: 3,
    }))
    expect(imageMocks.saveImageAssetRecord).toHaveBeenCalledTimes(2)
  })

  it.each([
    [{ canceled: true, images: [metadata('ignored')] }],
    [{ canceled: false, images: [] }],
  ])('returns no chapter images when desktop selection has no usable result', async (response) => {
    window.desktopImages = bridge({ pickChapterImages: vi.fn(async () => response) })

    await expect(useImageLibrary().addImagesToChapter('book-1', 'chapter-1'))
      .resolves.toEqual([])
    expect(imageMocks.saveImageAssetRecord).not.toHaveBeenCalled()
  })

  it('saves standalone wiki images and tags them to the page', async () => {
    const desktopBridge = bridge({
      pickWikiImages: vi.fn(async () => ({
        canceled: false,
        images: [metadata('wiki-image')],
      })),
    })
    window.desktopImages = desktopBridge

    const saved = await useImageLibrary().addImagesToWikiPage('book-1', 'wiki-1')

    expect(desktopBridge.pickWikiImages).toHaveBeenCalledWith({
      bookId: 'book-1', wikiPageId: 'wiki-1', allowMultiple: true,
    })
    expect(saved[0]).toEqual(expect.objectContaining({
      id: 'wiki-image', chapter_id: null, asset_type: 'wiki',
    }))
    expect(imageMocks.setImageWikiTags).toHaveBeenCalledWith('wiki-image', ['wiki-1'])
  })

  it('rejects a desktop image that cannot be read after selection', async () => {
    window.desktopImages = bridge({
      pickChapterImages: vi.fn(async () => ({ canceled: false, images: [metadata('missing')] })),
    })
    vi.spyOn(ElectronImageContentStore.prototype, 'read').mockResolvedValueOnce(null)

    await expect(useImageLibrary().addImagesToChapter('book-1', 'chapter-1'))
      .rejects.toThrow('selected image missing.png could not be read')
  })

  it('replaces desktop book and part covers and deletes their previous content', async () => {
    const desktopBridge = bridge({
      pickBookCover: vi.fn()
        .mockResolvedValueOnce({ canceled: false, image: metadata('new-book-cover') })
        .mockResolvedValueOnce({ canceled: false, image: metadata('new-part-cover') }),
    })
    window.desktopImages = desktopBridge
    imageMocks.getBookCoverImageAsset.mockResolvedValueOnce(asset('old-book-cover'))
    imageMocks.getPartCoverImageAsset.mockResolvedValueOnce(asset('old-part-cover', 'part_cover'))
    const library = useImageLibrary()

    await expect(library.pickNewBookCover('book-1')).resolves.toEqual(expect.objectContaining({
      id: 'new-book-cover', asset_type: 'cover',
    }))
    await expect(library.pickPartCover('book-1', 'part-1')).resolves.toEqual(expect.objectContaining({
      id: 'new-part-cover', asset_type: 'part_cover',
    }))

    expect(imageMocks.setBookCoverImageId).toHaveBeenCalledWith('book-1', 'new-book-cover')
    expect(imageMocks.setPartCoverImageId).toHaveBeenCalledWith('part-1', 'new-part-cover')
    expect(imageMocks.deleteImageAssetRecord).toHaveBeenCalledWith('old-book-cover')
    expect(imageMocks.deleteImageAssetRecord).toHaveBeenCalledWith('old-part-cover')
    expect(desktopBridge.deleteImageFile).toHaveBeenCalledTimes(2)
  })

  it('returns null when desktop cover selection is canceled or missing metadata', async () => {
    window.desktopImages = bridge({
      pickBookCover: vi.fn()
        .mockResolvedValueOnce({ canceled: true })
        .mockResolvedValueOnce({ canceled: false }),
    })
    imageMocks.getBookCoverImageAsset.mockResolvedValueOnce(null)
    imageMocks.getPartCoverImageAsset.mockResolvedValueOnce(null)
    const library = useImageLibrary()

    await expect(library.pickNewBookCover('book-1')).resolves.toBeNull()
    await expect(library.pickPartCover('book-1', 'part-1')).resolves.toBeNull()
    expect(imageMocks.saveImageAssetRecord).not.toHaveBeenCalled()
  })

  it('rejects content access after the desktop bridge disappears', async () => {
    const library = useImageLibrary()
    delete window.desktopImages
    library.refreshAvailability()

    expect(library.canStoreImages.value).toBe(false)
    await expect(library.getImageBlob(asset('image-1')))
      .rejects.toThrow('Image storage is not available on this platform')
  })
})
