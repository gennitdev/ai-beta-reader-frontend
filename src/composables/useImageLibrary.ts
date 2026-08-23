import { computed, ref, onBeforeUnmount } from 'vue'
import { Share } from '@capacitor/share'
import { logger } from '@/lib/logger'
import type { ImageAsset, ImageAssetType, PendingImageDeletion } from '@/lib/database'
import type { DesktopImageMetadata } from '@/shims/desktop-images'
import { useDatabase } from './useDatabase'
import { isDesktopAppRuntime } from '@/utils/platform'
import {
  dataUrlToBlob,
  CapacitorImageContentStore,
  cleanupOrphanedImageContent,
  deleteImageMetadataThenContent,
  ElectronImageContentStore,
  getNativeImageUri,
  inspectImageContent,
  IndexedDbImageContentStore,
  nativeImageStorageError,
  type ImageContentStore,
} from '@/lib/imageContentStore'
import { getImageStorageRuntime, type ImageStorageRuntime } from '@/lib/runtimeImageContentStore'
import {
  browserStorageError,
  requestPersistentBrowserStorage,
} from '@/lib/browserStorage'
import { hashImageContent, verifyImageContent } from '@/lib/imageContentHash'

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
  if (getImageStorageRuntime() !== 'android' && !browserImageStorageAvailable()) {
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
    updateImageAssetIntegrity,
  } = useDatabase()

  const electronImageStorageAvailable = ref(sanitizeBridgeAvailability())
  const imageStorageRuntime = ref<ImageStorageRuntime>(getImageStorageRuntime())
  const imageManagementAvailable = computed(
    () => imageStorageRuntime.value === 'android'
      || (imageStorageRuntime.value === 'electron' && electronImageStorageAvailable.value)
      || (imageStorageRuntime.value === 'browser' && browserImageStorageAvailable()),
  )
  const canSelectImages = imageManagementAvailable
  const canStoreImages = imageManagementAvailable
  const canDeleteImages = imageManagementAvailable
  const canDownloadImages = computed(() => true)
  const browserImageStore = new IndexedDbImageContentStore()
  const androidImageStore = new CapacitorImageContentStore()
  const imageSourceCache = new Map<string, { source: string; shouldRevoke: boolean }>()

  const refreshAvailability = () => {
    electronImageStorageAvailable.value = sanitizeBridgeAvailability()
    imageStorageRuntime.value = getImageStorageRuntime()
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
    if (!electronImageStorageAvailable.value || typeof window === 'undefined' || !window.desktopImages) {
      throw new Error('Image management is only available in the desktop build')
    }
    return window.desktopImages
  }

  function getContentStore(): ImageContentStore {
    refreshAvailability()
    if (electronImageStorageAvailable.value) {
      return new ElectronImageContentStore(ensureBridge())
    }
    if (imageStorageRuntime.value === 'android') return androidImageStore
    if (imageStorageRuntime.value !== 'browser') {
      throw new Error('Image storage is not available on this platform.')
    }
    return browserImageStore
  }

  function clearCachedSource(imageId: string) {
    const cached = imageSourceCache.get(imageId)
    if (cached?.shouldRevoke) URL.revokeObjectURL(cached.source)
    imageSourceCache.delete(imageId)
  }

  async function addContentIntegrity(asset: ImageAsset, blob: Blob): Promise<void> {
    Object.assign(asset, await hashImageContent(blob))
  }

  async function verifyContentIntegrity(image: ImageAsset, blob: Blob): Promise<void> {
    if (!image.content_hash) return
    if (!image.content_hash_algorithm || image.content_byte_length == null) {
      throw new Error(`The integrity metadata for ${image.file_name || 'this image'} is incomplete.`)
    }
    try {
      await verifyImageContent(blob, {
        content_hash: image.content_hash,
        content_hash_algorithm: image.content_hash_algorithm,
        content_byte_length: image.content_byte_length,
      })
    } catch (error) {
      throw new Error(
        `The image ${image.file_name || image.id} ${error instanceof Error ? error.message : String(error)}. Restore it from a known-good backup or replace it.`,
      )
    }
  }

  async function backfillContentIntegrity(image: ImageAsset, blob: Blob): Promise<void> {
    if (image.content_hash) return
    try {
      const integrity = await hashImageContent(blob)
      await updateImageAssetIntegrity(image.id, integrity)
      Object.assign(image, integrity)
    } catch (error) {
      logger.warn(
        `[ImageLibrary] Could not backfill integrity metadata for ${image.id}; it will be retried the next time the image is loaded.`,
        error,
      )
    }
  }

  async function getImageBlob(image: ImageAsset): Promise<Blob> {
    // Bundled/read-only libraries can carry their image bytes directly without
    // having a corresponding platform content-store entry.
    if (image.image_data && image.file_path.startsWith('example/')) {
      const embeddedBlob = dataUrlToBlob(image.image_data)
      await verifyContentIntegrity(image, embeddedBlob)
      await backfillContentIntegrity(image, embeddedBlob)
      return embeddedBlob
    }
    let storedBlob: Blob | null
    try {
      storedBlob = await getContentStore().read(image)
    } catch (error) {
      if (imageStorageRuntime.value === 'android') throw nativeImageStorageError(error, 'loaded')
      if (!electronImageStorageAvailable.value) throw browserStorageError(error, 'loaded')
      throw error
    }
    if (storedBlob) {
      await verifyContentIntegrity(image, storedBlob)
      await backfillContentIntegrity(image, storedBlob)
      return storedBlob
    }
    if (image.image_data) {
      const embeddedBlob = dataUrlToBlob(image.image_data)
      await verifyContentIntegrity(image, embeddedBlob)
      await backfillContentIntegrity(image, embeddedBlob)
      return embeddedBlob
    }
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

  async function downloadOrShareImage(image: ImageAsset): Promise<void> {
    refreshAvailability()
    if (imageStorageRuntime.value === 'android') {
      try {
        const blob = await getImageBlob(image)
        if (!(await androidImageStore.exists(image))) await androidImageStore.write(image, blob)
        await Share.share({
          title: image.file_name || 'Beta Bot image',
          url: await getNativeImageUri(image.id),
          dialogTitle: 'Save or share image',
        })
        return
      } catch (error) {
        throw nativeImageStorageError(error, 'shared')
      }
    }

    const source = await getImageSource(image)
    const link = document.createElement('a')
    link.href = source
    link.download = image.file_name || `illustration-${image.id}.jpg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  async function addImagesToChapter(bookId: string, chapterId: string) {
    if (!electronImageStorageAvailable.value) {
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
      const blob = await getContentStore().read(asset)
      if (!blob) throw new Error(`The selected image ${asset.file_name} could not be read after it was copied.`)
      await addContentIntegrity(asset, blob)
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
    refreshAvailability()
    const contentStore = getContentStore()
    if (imageStorageRuntime.value === 'browser') await requestPersistentBrowserStorage()
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
          file_path: imageStorageRuntime.value === 'android'
            ? `android/${id}`
            : `web/${id}/${encodeURIComponent(file.name)}`,
          mime_type: file.type || null,
          image_data: null,
          notes: '',
          created_at: now,
          updated_at: now,
        }

        await addContentIntegrity(asset, file)

        try {
          await contentStore.write(asset, file)
        } catch (error) {
          if (imageStorageRuntime.value === 'android') {
            throw nativeImageStorageError(error, 'saved')
          }
          throw browserStorageError(error, 'saved')
        }
        try {
          await saveImageAssetRecord(asset)
        } catch (error) {
          await contentStore.delete(asset).catch(() => undefined)
          throw error
        }
        saved.push(asset)
      }
    } catch (error) {
      await Promise.all(saved.map(async (asset) => {
        await deleteImageAssetRecord(asset.id).catch(() => undefined)
        await contentStore.delete(asset).catch(() => undefined)
      }))
      throw error
    }

    return saved
  }

  function canDisplayImages(): boolean {
    return true
  }

  async function deleteImage(image: ImageAsset) {
    const contentStore = getContentStore()
    const result = await deleteImageMetadataThenContent(
      image,
      deleteImageAssetRecord,
      contentStore,
      clearCachedSource,
    )
    if (result.orphanedContent) {
      logger.warn(
        `[ImageLibrary] Metadata for ${image.id} was deleted, but its content could not be removed. `
        + 'The unreferenced content will be eligible for reconciliation.',
        result.contentError,
      )
    }
  }

  async function deletePendingImageContent(pending: PendingImageDeletion): Promise<void> {
    const placeholder: ImageAsset = {
      id: pending.imageId,
      book_id: '',
      chapter_id: null,
      asset_type: 'chapter',
      file_name: '',
      file_path: pending.filePath,
      mime_type: pending.mimeType,
      image_data: null,
      notes: '',
      created_at: pending.createdAt,
      updated_at: pending.createdAt,
    }
    await getContentStore().delete(placeholder)
    clearCachedSource(pending.imageId)
  }

  async function reconcileImageContent(assets: ImageAsset[], removeOrphans = false) {
    const contentStore = getContentStore()
    return removeOrphans
      ? cleanupOrphanedImageContent(contentStore, assets)
      : inspectImageContent(contentStore, assets)
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
    logger.log('[ImageLibrary] fetchChapterThumbnails called for', chapterIds.length, 'chapters')
    for (const chapterId of chapterIds) {
      const firstImage = await fetchFirstChapterImage(chapterId)
      logger.log('[ImageLibrary] Chapter', chapterId, 'firstImage:', firstImage ? { id: firstImage.id, hasImageData: !!firstImage.image_data } : null)
      if (firstImage) {
        try {
          // Works on desktop (filesystem) or web (image_data)
          thumbnails[chapterId] = await getImageSource(firstImage)
        } catch (error) {
          console.warn('[ImageLibrary] Failed to get image source for chapter', chapterId, error)
        }
      }
    }
    logger.log('[ImageLibrary] Returning', Object.keys(thumbnails).length, 'thumbnails')
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

    if (electronImageStorageAvailable.value) {
      const response = await ensureBridge().pickBookCover({ bookId })
      if (response.canceled || !response.image) return null
      asset = createAssetFromMetadata(response.image, {
        bookId,
        chapterId: null,
        assetType: 'cover',
      })
      const blob = await getContentStore().read(asset)
      if (!blob) throw new Error(`The selected image ${asset.file_name} could not be read after it was copied.`)
      await addContentIntegrity(asset, blob)
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

    if (electronImageStorageAvailable.value) {
      const response = await ensureBridge().pickBookCover({ bookId })
      if (response.canceled || !response.image) return null
      asset = createAssetFromMetadata(response.image, {
        bookId,
        chapterId: null,
        assetType: 'part_cover',
      })
      const blob = await getContentStore().read(asset)
      if (!blob) throw new Error(`The selected image ${asset.file_name} could not be read after it was copied.`)
      await addContentIntegrity(asset, blob)
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
    logger.log('[ImageLibrary] fetchPartThumbnails called for', partIds.length, 'parts')
    for (const partId of partIds) {
      const cover = await fetchPartCover(partId)
      logger.log('[ImageLibrary] Part', partId, 'cover:', cover ? { id: cover.id, hasImageData: !!cover.image_data } : null)
      if (cover) {
        try {
          // Works on desktop (filesystem) or web (image_data)
          thumbnails[partId] = await getImageSource(cover)
        } catch (error) {
          console.warn('[ImageLibrary] Failed to get image source for part', partId, error)
        }
      }
    }
    logger.log('[ImageLibrary] Returning', Object.keys(thumbnails).length, 'part thumbnails')
    return thumbnails
  }

  async function fetchChapterCover(chapterId: string) {
    return getChapterCoverImageAsset(chapterId)
  }

  return {
    electronImageStorageAvailable,
    canSelectImages,
    canStoreImages,
    canDeleteImages,
    canDownloadImages,
    refreshAvailability,
    addImagesToChapter,
    addImagesFromFiles,
    canDisplayImages,
    deleteImage,
    deletePendingImageContent,
    reconcileImageContent,
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
    downloadOrShareImage,
    setPartCoverImageId,
  }
}
