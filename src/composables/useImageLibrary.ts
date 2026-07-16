import { computed, ref, onBeforeUnmount } from 'vue'
import type { ImageAsset, ImageAssetType } from '@/lib/database'
import type { DesktopImageMetadata } from '@/shims/desktop-images'
import { useDatabase } from './useDatabase'
import { isDesktopAppRuntime } from '@/utils/platform'
import {
  dataUrlToBlob,
  ElectronImageContentStore,
  IndexedDbImageContentStore,
  type ImageContentStore,
} from '@/lib/imageContentStore'
import {
  browserStorageError,
  requestPersistentBrowserStorage,
} from '@/lib/browserStorage'

function sanitizeBridgeAvailability(): boolean {
  return typeof window !== 'undefined' && Boolean(window.desktopImages) && isDesktopAppRuntime()
}

const SUPPORTED_BROWSER_IMAGE_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])
export const MAX_BROWSER_IMAGE_BYTES = 20 * 1024 * 1024

function browserImageStorageAvailable(): boolean {
  return typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && Boolean(globalThis.indexedDB)
    && typeof globalThis.crypto?.randomUUID === 'function'
}

export function validateBrowserImage(file: File): void {
  if (file.size === 0) {
    throw new Error(`${file.name} is empty and cannot be added.`)
  }
  if (!SUPPORTED_BROWSER_IMAGE_TYPES.has(file.type)) {
    throw new Error(`${file.name} is not a supported PNG, JPEG, GIF, or WebP image.`)
  }
  if (file.size > MAX_BROWSER_IMAGE_BYTES) {
    throw new Error(`${file.name} exceeds the 20 MB image limit.`)
  }
}

async function decodeBrowserImage(file: File): Promise<void> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    try {
      if (bitmap.width < 1 || bitmap.height < 1) throw new Error('Image has no pixels')
    } finally {
      bitmap.close()
    }
    return
  }

  await new Promise<void>((resolve, reject) => {
    const source = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(source)
      resolve()
    }
    image.onerror = () => {
      URL.revokeObjectURL(source)
      reject(new Error('Image could not be decoded'))
    }
    image.src = source
  })
}

export async function validateBrowserImageContents(
  file: File,
  decode: (candidate: File) => Promise<void> = decodeBrowserImage,
): Promise<void> {
  try {
    await decode(file)
  } catch {
    throw new Error(`${file.name} could not be read as an image.`)
  }
}

function selectBrowserImages(allowMultiple: boolean): Promise<File[]> {
  if (!browserImageStorageAvailable()) {
    throw new Error('Image storage is not available in this browser context.')
  }

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = [...SUPPORTED_BROWSER_IMAGE_TYPES].join(',')
    input.multiple = allowMultiple
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])), { once: true })
    input.addEventListener('cancel', () => resolve([]), { once: true })
    input.click()
  })
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
    notes: '',
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
  const imageManagementAvailable = computed(
    () => desktopImagesAvailable.value || browserImageStorageAvailable(),
  )
  const browserImageStore = new IndexedDbImageContentStore()
  const imageSourceCache = new Map<string, { source: string; shouldRevoke: boolean }>()

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
    for (const cached of imageSourceCache.values()) {
      if (cached.shouldRevoke) URL.revokeObjectURL(cached.source)
    }
    imageSourceCache.clear()
  })

  function ensureBridge() {
    refreshAvailability()
    if (!desktopImagesAvailable.value || typeof window === 'undefined' || !window.desktopImages) {
      throw new Error('Image management is only available in the desktop build')
    }
    return window.desktopImages
  }

  function getContentStore(): ImageContentStore {
    refreshAvailability()
    if (desktopImagesAvailable.value) {
      return new ElectronImageContentStore(ensureBridge())
    }
    return browserImageStore
  }

  function clearCachedSource(imageId: string) {
    const cached = imageSourceCache.get(imageId)
    if (cached?.shouldRevoke) URL.revokeObjectURL(cached.source)
    imageSourceCache.delete(imageId)
  }

  async function getImageBlob(image: ImageAsset): Promise<Blob> {
    let storedBlob: Blob | null
    try {
      storedBlob = await getContentStore().read(image)
    } catch (error) {
      if (!desktopImagesAvailable.value) throw browserStorageError(error, 'loaded')
      throw error
    }
    if (storedBlob) return storedBlob
    if (image.image_data) return dataUrlToBlob(image.image_data)
    throw new Error(
      `The image data for ${image.file_name || 'this image'} is missing from this device. Restore a backup that includes the image or remove the broken image entry.`,
    )
  }

  async function getImageSource(image: ImageAsset): Promise<string> {
    const cached = imageSourceCache.get(image.id)
    if (cached) return cached.source

    const blob = await getImageBlob(image)
    const source = URL.createObjectURL(blob)
    imageSourceCache.set(image.id, { source, shouldRevoke: true })
    return source
  }

  async function addImagesToChapter(bookId: string, chapterId: string) {
    if (!desktopImagesAvailable.value) {
      const files = await selectBrowserImages(true)
      return files.length > 0
        ? addImagesFromFiles(files, { bookId, chapterId, assetType: 'chapter' })
        : []
    }

    const response = await ensureBridge().pickChapterImages({ bookId, chapterId, allowMultiple: true })
    if (response.canceled || !response.images.length) return []
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

  async function addImagesFromFiles(
    files: FileList | File[],
    options: { bookId: string; chapterId?: string | null; assetType: ImageAssetType }
  ): Promise<ImageAsset[]> {
    const selectedFiles = Array.from(files)
    selectedFiles.forEach(validateBrowserImage)
    await Promise.all(selectedFiles.map((file) => validateBrowserImageContents(file)))
    await requestPersistentBrowserStorage()
    const saved: ImageAsset[] = []

    try {
      for (const file of selectedFiles) {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        const asset: ImageAsset = {
          id,
          book_id: options.bookId,
          chapter_id: options.chapterId ?? null,
          asset_type: options.assetType,
          file_name: file.name,
          file_path: `web/${id}/${encodeURIComponent(file.name)}`,
          mime_type: file.type || null,
          image_data: null,
          notes: '',
          created_at: now,
          updated_at: now,
        }

        try {
          await browserImageStore.write(asset, file)
        } catch (error) {
          throw browserStorageError(error, 'saved')
        }
        try {
          await saveImageAssetRecord(asset)
        } catch (error) {
          await browserImageStore.delete(asset).catch(() => undefined)
          throw error
        }
        saved.push(asset)
      }
    } catch (error) {
      await Promise.all(saved.map(async (asset) => {
        await deleteImageAssetRecord(asset.id).catch(() => undefined)
        await browserImageStore.delete(asset).catch(() => undefined)
      }))
      throw error
    }

    return saved
  }

  function canDisplayImages(): boolean {
    return true
  }

  // Check if new images can be uploaded
  function canUploadImages(): boolean {
    return imageManagementAvailable.value
  }

  async function deleteImage(image: ImageAsset) {
    const contentStore = getContentStore()
    await deleteImageAssetRecord(image.id)
    clearCachedSource(image.id)

    try {
      await contentStore.delete(image)
    } catch (error) {
      console.warn('Failed to delete image content', error)
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
    const previousCover = await getBookCoverImageAsset(bookId)
    let asset: ImageAsset

    if (desktopImagesAvailable.value) {
      const response = await ensureBridge().pickBookCover({ bookId })
      if (response.canceled || !response.image) return null
      asset = createAssetFromMetadata(response.image, {
        bookId,
        chapterId: null,
        assetType: 'cover',
      })
      await saveImageAssetRecord(asset)
    } else {
      const files = await selectBrowserImages(false)
      if (files.length === 0) return null
      const saved = await addImagesFromFiles(files, { bookId, assetType: 'cover' })
      asset = saved[0]
    }

    try {
      await setBookCoverImageId(bookId, asset.id)
    } catch (error) {
      await deleteImage(asset)
      throw error
    }

    if (previousCover) {
      await deleteImage(previousCover)
    }

    return asset
  }

  async function fetchPartCover(partId: string) {
    return getPartCoverImageAsset(partId)
  }

  async function pickPartCover(bookId: string, partId: string) {
    const previousCover = await getPartCoverImageAsset(partId)
    let asset: ImageAsset

    if (desktopImagesAvailable.value) {
      const response = await ensureBridge().pickBookCover({ bookId })
      if (response.canceled || !response.image) return null
      asset = createAssetFromMetadata(response.image, {
        bookId,
        chapterId: null,
        assetType: 'part_cover',
      })
      await saveImageAssetRecord(asset)
    } else {
      const files = await selectBrowserImages(false)
      if (files.length === 0) return null
      const saved = await addImagesFromFiles(files, { bookId, assetType: 'part_cover' })
      asset = saved[0]
    }

    try {
      await setPartCoverImageId(partId, asset.id)
    } catch (error) {
      await deleteImage(asset)
      throw error
    }

    if (previousCover) {
      await deleteImage(previousCover)
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
    imageManagementAvailable,
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
    getImageBlob,
    setPartCoverImageId,
  }
}
