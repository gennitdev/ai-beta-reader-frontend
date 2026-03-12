import { ref, onBeforeUnmount } from 'vue'
import type { ImageAsset, ImageAssetType } from '@/lib/database'
import type { DesktopImageMetadata } from '@/shims/desktop-images'
import { useDatabase } from './useDatabase'
import { isDesktopAppRuntime } from '@/utils/platform'

const imageSourceCache = new Map<string, string>()

function sanitizeBridgeAvailability(): boolean {
  return typeof window !== 'undefined' && Boolean(window.desktopImages) && isDesktopAppRuntime()
}

function createAssetFromMetadata(
  metadata: DesktopImageMetadata,
  options: { bookId: string; chapterId?: string | null; assetType: ImageAssetType },
): ImageAsset {
  const now = new Date().toISOString()
  return {
    id: metadata.id,
    book_id: options.bookId,
    chapter_id: options.chapterId ?? null,
    asset_type: options.assetType,
    file_name: metadata.fileName,
    file_path: metadata.relativePath,
    mime_type: metadata.mimeType ?? null,
    created_at: now,
    updated_at: now,
  }
}

export function useImageLibrary() {
  const {
    saveImageAssetRecord,
    deleteImageAssetRecord,
    getChapterImageAssets,
    getPartImageAssets,
    getBookCoverImageAsset,
    setBookCoverImageId,
    getPartCoverImageAsset,
    setPartCoverImageId,
  } = useDatabase()

  const desktopImagesAvailable = ref(sanitizeBridgeAvailability())

  const refreshAvailability = () => {
    desktopImagesAvailable.value = sanitizeBridgeAvailability()
  }

  const availabilityListener = () => refreshAvailability()

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', availabilityListener)
  }

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', availabilityListener)
    }
  })

  function ensureBridge() {
    refreshAvailability()
    if (!desktopImagesAvailable.value || typeof window === 'undefined' || !window.desktopImages) {
      throw new Error('Image management is only available in the desktop build')
    }
    return window.desktopImages
  }

  async function getImageSource(image: ImageAsset): Promise<string> {
    if (!desktopImagesAvailable.value || !image.file_path) {
      throw new Error('Image previews are only available in the desktop build')
    }
    if (imageSourceCache.has(image.id)) {
      return imageSourceCache.get(image.id)!
    }
    const bridge = ensureBridge()
    const payload = await bridge.readImageData({
      relativePath: image.file_path,
      mimeType: image.mime_type ?? undefined,
    })
    imageSourceCache.set(image.id, payload.dataUrl)
    return payload.dataUrl
  }

  async function addImagesToChapter(bookId: string, chapterId: string) {
    const bridge = ensureBridge()
    const response = await bridge.pickChapterImages({
      bookId,
      chapterId,
      allowMultiple: true,
    })
    if (response.canceled || !response.images.length) {
      return []
    }
    const saved: ImageAsset[] = []
    for (const item of response.images) {
      const asset = createAssetFromMetadata(item, {
        bookId,
        chapterId,
        assetType: 'chapter',
      })
      await saveImageAssetRecord(asset)
      saved.push(asset)
    }
    return saved
  }

  async function deleteImage(image: ImageAsset) {
    const bridge = ensureBridge()
    await deleteImageAssetRecord(image.id)
    imageSourceCache.delete(image.id)
    try {
      await bridge.deleteImageFile({ relativePath: image.file_path })
    } catch (error) {
      console.warn('Failed to delete image file', error)
    }
  }

  async function fetchChapterImages(chapterId: string) {
    return getChapterImageAssets(chapterId)
  }

  async function fetchFirstChapterImage(chapterId: string): Promise<ImageAsset | null> {
    const images = await getChapterImageAssets(chapterId)
    return images.length > 0 ? images[0] : null
  }

  async function fetchChapterThumbnails(chapterIds: string[]): Promise<Record<string, string>> {
    if (!desktopImagesAvailable.value) {
      return {}
    }
    const thumbnails: Record<string, string> = {}
    for (const chapterId of chapterIds) {
      const firstImage = await fetchFirstChapterImage(chapterId)
      if (firstImage) {
        try {
          thumbnails[chapterId] = await getImageSource(firstImage)
        } catch (error) {
          console.warn(`Failed to load thumbnail for chapter ${chapterId}`, error)
        }
      }
    }
    return thumbnails
  }

  async function fetchPartImages(partId: string) {
    return getPartImageAssets(partId)
  }

  async function fetchBookCover(bookId: string) {
    return getBookCoverImageAsset(bookId)
  }

  async function pickNewBookCover(bookId: string) {
    const bridge = ensureBridge()
    const previousCover = await getBookCoverImageAsset(bookId)
    const response = await bridge.pickBookCover({ bookId })
    if (response.canceled || !response.image) {
      return null
    }

    const asset = createAssetFromMetadata(response.image, {
      bookId,
      chapterId: null,
      assetType: 'cover',
    })
    await saveImageAssetRecord(asset)
    await setBookCoverImageId(bookId, asset.id)

    if (previousCover) {
      imageSourceCache.delete(previousCover.id)
      await deleteImageAssetRecord(previousCover.id)
      try {
        await bridge.deleteImageFile({ relativePath: previousCover.file_path })
      } catch (error) {
        console.warn('Failed to delete old cover image', error)
      }
    }

    return asset
  }

  async function fetchPartCover(partId: string) {
    return getPartCoverImageAsset(partId)
  }

  async function pickPartCover(bookId: string, partId: string) {
    const bridge = ensureBridge()
    const previousCover = await getPartCoverImageAsset(partId)
    // Reuse pickBookCover dialog - it just picks an image
    const response = await bridge.pickBookCover({ bookId })
    if (response.canceled || !response.image) {
      return null
    }

    const asset = createAssetFromMetadata(response.image, {
      bookId,
      chapterId: null,
      assetType: 'part_cover',
    })
    await saveImageAssetRecord(asset)
    await setPartCoverImageId(partId, asset.id)

    if (previousCover) {
      imageSourceCache.delete(previousCover.id)
      await deleteImageAssetRecord(previousCover.id)
      try {
        await bridge.deleteImageFile({ relativePath: previousCover.file_path })
      } catch (error) {
        console.warn('Failed to delete old part cover image', error)
      }
    }

    return asset
  }

  async function fetchPartThumbnails(partIds: string[]): Promise<Record<string, string>> {
    if (!desktopImagesAvailable.value) {
      return {}
    }
    const thumbnails: Record<string, string> = {}
    for (const partId of partIds) {
      const cover = await fetchPartCover(partId)
      if (cover) {
        try {
          thumbnails[partId] = await getImageSource(cover)
        } catch (error) {
          console.warn(`Failed to load thumbnail for part ${partId}`, error)
        }
      }
    }
    return thumbnails
  }

  return {
    desktopImagesAvailable,
    refreshAvailability,
    addImagesToChapter,
    deleteImage,
    fetchChapterImages,
    fetchFirstChapterImage,
    fetchChapterThumbnails,
    fetchPartImages,
    fetchBookCover,
    pickNewBookCover,
    fetchPartCover,
    pickPartCover,
    fetchPartThumbnails,
    getImageSource,
  }
}
