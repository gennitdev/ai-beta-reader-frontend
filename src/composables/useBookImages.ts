import { computed, ref, watch, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import type { ImageAsset, ImageWikiTag } from '@/lib/database'

interface UseBookImagesDeps {
  bookId: Ref<string>
  wikiPages: Ref<{ length: number }>
  loadWiki: () => Promise<void>
  getBookImageAssets: (bookId: string) => Promise<ImageAsset[]>
  getImageSource: (asset: ImageAsset) => Promise<string>
  getImageWikiTags: (imageId: string) => Promise<ImageWikiTag[]>
  updateImageAssetNotes: (imageId: string, notes: string) => Promise<void>
  setImageWikiTags: (imageId: string, wikiPageIds: string[]) => Promise<void>
  downloadOrShareImage: (image: ImageAsset) => Promise<void>
}

/**
 * The book's illustration gallery (Images tab): loading assets with their source
 * URLs and wiki tags, the route-selected image, and saving notes/tags/downloads.
 */
export function useBookImages(deps: UseBookImagesDeps) {
  const {
    bookId,
    wikiPages,
    loadWiki,
    getBookImageAssets,
    getImageSource,
    getImageWikiTags,
    updateImageAssetNotes,
    setImageWikiTags,
    downloadOrShareImage,
  } = deps
  const route = useRoute()

  const bookImages = ref<ImageAsset[]>([])
  const bookImageSources = ref<Record<string, string>>({})
  const bookImageTags = ref<Record<string, ImageWikiTag[]>>({})
  const loadingImages = ref(false)
  const savingSelectedImageNotes = ref(false)
  const savingSelectedImageTags = ref(false)

  const selectedImageId = ref<string | null>((route.query.imageId as string) || null)

  watch(
    () => route.query.imageId,
    (imageId) => {
      selectedImageId.value = typeof imageId === 'string' ? imageId : null
    },
  )

  const selectedImageSrc = computed(() => {
    if (!selectedImageId.value) return null
    return bookImageSources.value[selectedImageId.value] || null
  })

  const selectedImage = computed(() => {
    if (!selectedImageId.value) return null
    return bookImages.value.find(img => img.id === selectedImageId.value) || null
  })

  const selectedImageTags = computed(() => {
    if (!selectedImageId.value) return []
    return bookImageTags.value[selectedImageId.value] ?? []
  })

  const loadBookImages = async () => {
    if (!bookId.value) return

    try {
      loadingImages.value = true
      if (!wikiPages.value.length) {
        await loadWiki()
      }
      const images = await getBookImageAssets(bookId.value)
      bookImages.value = images

      // Load image sources for gallery display
      const sources: Record<string, string> = {}
      const tags: Record<string, ImageWikiTag[]> = {}
      for (const image of images) {
        try {
          sources[image.id] = await getImageSource(image)
        } catch (err) {
          console.warn('Failed to load image source for', image.id, err)
        }
        try {
          tags[image.id] = await getImageWikiTags(image.id)
        } catch (err) {
          console.warn('Failed to load image tags for', image.id, err)
        }
      }
      bookImageSources.value = sources
      bookImageTags.value = tags
    } catch (error) {
      console.error('Failed to load book images:', error)
      bookImages.value = []
      bookImageSources.value = {}
      bookImageTags.value = {}
    } finally {
      loadingImages.value = false
    }
  }

  const saveSelectedImageNotes = async (notes: string) => {
    const image = selectedImage.value
    if (!image) return

    savingSelectedImageNotes.value = true
    try {
      await updateImageAssetNotes(image.id, notes)
      const updatedImage = {
        ...image,
        notes,
        updated_at: new Date().toISOString(),
      }
      bookImages.value = bookImages.value.map((item) =>
        item.id === image.id ? updatedImage : item,
      )
    } catch (error) {
      console.error('Failed to save image notes:', error)
    } finally {
      savingSelectedImageNotes.value = false
    }
  }

  const saveSelectedImageTags = async (wikiPageIds: string[]) => {
    const image = selectedImage.value
    if (!image) return

    savingSelectedImageTags.value = true
    try {
      await setImageWikiTags(image.id, wikiPageIds)
      bookImageTags.value = {
        ...bookImageTags.value,
        [image.id]: await getImageWikiTags(image.id),
      }
    } catch (error) {
      console.error('Failed to save image tags:', error)
    } finally {
      savingSelectedImageTags.value = false
    }
  }

  const downloadSelectedImage = async (imageId: string) => {
    const image = bookImages.value.find((item) => item.id === imageId)
    if (!image) return
    await downloadOrShareImage(image)
  }

  const selectBookImage = (imageId: string | null) => {
    selectedImageId.value = imageId
  }

  return {
    bookImages,
    bookImageSources,
    bookImageTags,
    loadingImages,
    savingSelectedImageNotes,
    savingSelectedImageTags,
    selectedImageId,
    selectedImageSrc,
    selectedImage,
    selectedImageTags,
    loadBookImages,
    saveSelectedImageNotes,
    saveSelectedImageTags,
    downloadSelectedImage,
    selectBookImage,
  }
}
