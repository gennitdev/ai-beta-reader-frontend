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
  options: { bookId: string; chapterId?: string | null; assetType: ImageAssetType; imageData?: string | null },
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
    image_data: options.imageData ?? null,
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
    getChapterCoverImageAsset,
    setChapterCoverImageId,
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
    // Check cache first
    if (imageSourceCache.has(image.id)) {
      return imageSourceCache.get(image.id)!
    }

    // On desktop, read from filesystem
    if (desktopImagesAvailable.value && image.file_path) {
      const bridge = ensureBridge()
      const payload = await bridge.readImageData({
        relativePath: image.file_path,
        mimeType: image.mime_type ?? undefined,
      })
      imageSourceCache.set(image.id, payload.dataUrl)
      return payload.dataUrl
    }

    // On web, use image_data from database (restored from backup)
    if (image.image_data) {
      imageSourceCache.set(image.id, image.image_data)
      return image.image_data
    }

    throw new Error('Image data not available')
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

  // Web-based image upload using File API
  async function addImagesFromFiles(
    files: FileList | File[],
    options: { bookId: string; chapterId?: string | null; assetType: ImageAssetType }
  ): Promise<ImageAsset[]> {
    const saved: ImageAsset[] = []

    for (const file of Array.from(files)) {
      // Convert file to base64 data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const asset: ImageAsset = {
        id,
        book_id: options.bookId,
        chapter_id: options.chapterId ?? null,
        asset_type: options.assetType,
        file_name: file.name,
        file_path: `web/${id}/${file.name}`, // Virtual path for web
        mime_type: file.type || null,
        image_data: dataUrl,
        created_at: now,
        updated_at: now,
      }

      await saveImageAssetRecord(asset)
      imageSourceCache.set(asset.id, dataUrl)
      saved.push(asset)
    }

    return saved
  }

  // Check if images can be displayed (desktop filesystem or web with image_data)
  function canDisplayImages(): boolean {
    return desktopImagesAvailable.value || true // Web can display if image_data exists
  }

  // Check if new images can be uploaded
  function canUploadImages(): boolean {
    return desktopImagesAvailable.value || typeof window !== 'undefined'
  }

  async function deleteImage(image: ImageAsset) {
    await deleteImageAssetRecord(image.id)
    imageSourceCache.delete(image.id)

    // Only delete from filesystem on desktop
    if (desktopImagesAvailable.value && image.file_path && !image.file_path.startsWith('web/')) {
      try {
        const bridge = ensureBridge()
        await bridge.deleteImageFile({ relativePath: image.file_path })
      } catch (error) {
        console.warn('Failed to delete image file', error)
      }
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
    const thumbnails: Record<string, string> = {}
    console.log('[ImageLibrary] fetchChapterThumbnails called for', chapterIds.length, 'chapters')
    for (const chapterId of chapterIds) {
      const firstImage = await fetchFirstChapterImage(chapterId)
      console.log('[ImageLibrary] Chapter', chapterId, 'firstImage:', firstImage ? { id: firstImage.id, hasImageData: !!firstImage.image_data } : null)
      if (firstImage) {
        try {
          // Works on desktop (filesystem) or web (image_data)
          thumbnails[chapterId] = await getImageSource(firstImage)
        } catch (error) {
          console.warn('[ImageLibrary] Failed to get image source for chapter', chapterId, error)
        }
      }
    }
    console.log('[ImageLibrary] Returning', Object.keys(thumbnails).length, 'thumbnails')
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
    const thumbnails: Record<string, string> = {}
    console.log('[ImageLibrary] fetchPartThumbnails called for', partIds.length, 'parts')
    for (const partId of partIds) {
      const cover = await fetchPartCover(partId)
      console.log('[ImageLibrary] Part', partId, 'cover:', cover ? { id: cover.id, hasImageData: !!cover.image_data } : null)
      if (cover) {
        try {
          // Works on desktop (filesystem) or web (image_data)
          thumbnails[partId] = await getImageSource(cover)
        } catch (error) {
          console.warn('[ImageLibrary] Failed to get image source for part', partId, error)
        }
      }
    }
    console.log('[ImageLibrary] Returning', Object.keys(thumbnails).length, 'part thumbnails')
    return thumbnails
  }

  async function fetchChapterCover(chapterId: string) {
    return getChapterCoverImageAsset(chapterId)
  }

  return {
    desktopImagesAvailable,
    refreshAvailability,
    addImagesToChapter,
    addImagesFromFiles,
    canDisplayImages,
    canUploadImages,
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
    fetchChapterCover,
    setChapterCoverImageId,
    getImageSource,
    setPartCoverImageId,
  }
}
