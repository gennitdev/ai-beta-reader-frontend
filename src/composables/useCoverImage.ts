import { ref, type Ref } from 'vue'
import type { ImageAsset } from '@/lib/database'

/** Any entity that owns a single cover image (Book, Part, ...). */
export interface CoverEntity {
  id: string
  cover_image_id?: string | null
}

interface CoverMessages {
  load: string
  update: string
  remove: string
}

export interface UseCoverImageDeps<E extends CoverEntity> {
  entity: Ref<E | null>
  fetchCover: (entityId: string) => Promise<ImageAsset | null>
  getImageSource: (asset: ImageAsset) => Promise<string>
  pickCover: (entityId: string) => Promise<ImageAsset | null>
  deleteImage: (asset: ImageAsset) => Promise<void>
  setCoverImageId: (entityId: string, imageId: string | null) => Promise<void>
  messages?: Partial<CoverMessages>
}

/**
 * Shared cover-image behavior for any entity that owns a single cover: loading
 * it, picking a new one, and removing it, plus the derived source URL and
 * loading/error state. Callers own their own delete-confirmation UX and call
 * {@link removeCover} once confirmed.
 */
export function useCoverImage<E extends CoverEntity>(deps: UseCoverImageDeps<E>) {
  const messages: CoverMessages = {
    load: 'Failed to load cover',
    update: 'Failed to update cover',
    remove: 'Failed to delete cover',
    ...deps.messages,
  }

  const coverImage = ref<ImageAsset | null>(null)
  const coverSrc = ref<string | null>(null)
  const coverLoading = ref(false)
  const coverError = ref<string | null>(null)

  const loadCover = async (entityId: string) => {
    coverLoading.value = true
    coverError.value = null
    try {
      const asset = await deps.fetchCover(entityId)
      coverImage.value = asset
      coverSrc.value = asset ? await deps.getImageSource(asset) : null
    } catch (error) {
      coverError.value = error instanceof Error ? error.message : messages.load
    } finally {
      coverLoading.value = false
    }
  }

  const selectCover = async () => {
    if (!deps.entity.value) return

    coverLoading.value = true
    coverError.value = null
    try {
      const asset = await deps.pickCover(deps.entity.value.id)
      if (asset) {
        coverImage.value = asset
        coverSrc.value = await deps.getImageSource(asset)
        deps.entity.value.cover_image_id = asset.id
      }
    } catch (error) {
      coverError.value = error instanceof Error ? error.message : messages.update
    } finally {
      coverLoading.value = false
    }
  }

  /**
   * Delete the current cover. Performs no confirmation of its own — the caller
   * confirms first (via a native prompt or a modal). Returns whether it removed
   * a cover.
   */
  const removeCover = async (): Promise<boolean> => {
    if (!deps.entity.value || !coverImage.value) return false

    coverLoading.value = true
    coverError.value = null
    try {
      await deps.deleteImage(coverImage.value)
      await deps.setCoverImageId(deps.entity.value.id, null)
      coverImage.value = null
      coverSrc.value = null
      deps.entity.value.cover_image_id = null
      return true
    } catch (error) {
      coverError.value = error instanceof Error ? error.message : messages.remove
      return false
    } finally {
      coverLoading.value = false
    }
  }

  return {
    coverImage,
    coverSrc,
    coverLoading,
    coverError,
    loadCover,
    selectCover,
    removeCover,
  }
}
