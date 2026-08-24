// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
const nativeMocks = vi.hoisted(() => ({
  share: vi.fn(),
  getUri: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true },
}))
vi.mock('@capacitor/share', () => ({ Share: { share: nativeMocks.share } }))
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Filesystem: {
    mkdir: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(), deleteFile: vi.fn(), readdir: vi.fn(),
    getUri: nativeMocks.getUri,
  },
}))
vi.mock('@/composables/useDatabase', () => ({ useDatabase: () => imageMocks }))
vi.mock('@/utils/platform', () => ({ isDesktopAppRuntime: () => false }))
vi.mock('@/lib/logger', () => ({ logger: { log: vi.fn(), warn: vi.fn() } }))

import { useImageLibrary } from '@/composables/useImageLibrary'
import { CapacitorImageContentStore } from '@/lib/imageContentStore'
import type { ImageAsset } from '@/lib/database'

function file(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })
}

function asset(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: 'image-1', book_id: 'book-1', chapter_id: null, asset_type: 'cover',
    file_name: 'cover.png', file_path: 'android/image-1', mime_type: 'image/png',
    image_data: null, notes: '', created_at: '', updated_at: '', ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  imageMocks.saveImageAssetRecord.mockResolvedValue(undefined)
  imageMocks.deleteImageAssetRecord.mockResolvedValue(undefined)
  imageMocks.updateImageAssetIntegrity.mockResolvedValue(undefined)
  nativeMocks.share.mockResolvedValue(undefined)
  nativeMocks.getUri.mockResolvedValue({ uri: 'content://beta-bot/images/image-1' })
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useImageLibrary Android lifecycle', () => {
  it('exposes image capabilities and writes native content before SQLite metadata', async () => {
    const write = vi.spyOn(CapacitorImageContentStore.prototype, 'write').mockResolvedValue(undefined)
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')
    const library = useImageLibrary()

    expect(library.canSelectImages.value).toBe(true)
    expect(library.canStoreImages.value).toBe(true)
    expect(library.canDeleteImages.value).toBe(true)

    const [saved] = await library.addImagesFromFiles([file('cover.png')], {
      bookId: 'book-1', assetType: 'cover',
    })

    expect(saved).toMatchObject({
      id: '00000000-0000-4000-8000-000000000001',
      file_path: 'android/00000000-0000-4000-8000-000000000001',
      image_data: null,
    })
    expect(write).toHaveBeenCalledWith(saved, expect.any(File))
    expect(write.mock.invocationCallOrder[0])
      .toBeLessThan(imageMocks.saveImageAssetRecord.mock.invocationCallOrder[0])
  })

  it('removes native content when the SQLite metadata write fails', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000002')
    vi.spyOn(CapacitorImageContentStore.prototype, 'write').mockResolvedValue(undefined)
    const remove = vi.spyOn(CapacitorImageContentStore.prototype, 'delete').mockResolvedValue(undefined)
    imageMocks.saveImageAssetRecord.mockRejectedValue(new Error('SQLite unavailable'))

    await expect(useImageLibrary().addImagesFromFiles([file('scene.png')], {
      bookId: 'book-1', chapterId: 'chapter-1', assetType: 'chapter',
    })).rejects.toThrow('SQLite unavailable')

    expect(remove).toHaveBeenCalledWith(expect.objectContaining({
      id: '00000000-0000-4000-8000-000000000002',
    }))
  })

  it('opens the Android share sheet for saving or sharing an image', async () => {
    const read = vi.spyOn(CapacitorImageContentStore.prototype, 'read')
      .mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }))
    vi.spyOn(CapacitorImageContentStore.prototype, 'exists').mockResolvedValue(true)
    const library = useImageLibrary()
    const image = asset()

    await library.downloadOrShareImage(image)

    expect(read).toHaveBeenCalledWith(image)
    expect(nativeMocks.getUri).toHaveBeenCalledWith({
      path: 'images/image-1', directory: 'DATA',
    })
    expect(nativeMocks.share).toHaveBeenCalledWith({
      title: 'cover.png',
      url: 'content://beta-bot/images/image-1',
      dialogTitle: 'Save or share image',
    })
  })

  it('reports full device storage without writing SQLite metadata', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000003')
    vi.spyOn(CapacitorImageContentStore.prototype, 'write')
      .mockRejectedValue(new Error('ENOSPC: no space left on device'))

    await expect(useImageLibrary().addImagesFromFiles([file('large.png')], {
      bookId: 'book-1', assetType: 'cover',
    })).rejects.toThrow(/storage is full.*Free device space/i)

    expect(imageMocks.saveImageAssetRecord).not.toHaveBeenCalled()
  })

  it('materializes legacy embedded bytes before opening the native share sheet', async () => {
    const read = vi.spyOn(CapacitorImageContentStore.prototype, 'read').mockResolvedValue(null)
    const write = vi.spyOn(CapacitorImageContentStore.prototype, 'write').mockResolvedValue(undefined)
    const legacy = asset({ image_data: 'data:image/png;base64,AQID' })

    await useImageLibrary().downloadOrShareImage(legacy)

    expect(read).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenCalledWith(legacy, expect.any(Blob))
    const restored = write.mock.calls[0][1]
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(nativeMocks.share).toHaveBeenCalledOnce()
  })

  it('surfaces native read permission failures as actionable errors', async () => {
    vi.spyOn(CapacitorImageContentStore.prototype, 'read')
      .mockRejectedValue(new Error('Permission denied'))

    await expect(useImageLibrary().downloadOrShareImage(asset()))
      .rejects.toThrow(/could not access app image storage.*Restart the app/i)
    expect(nativeMocks.share).not.toHaveBeenCalled()
  })
})
