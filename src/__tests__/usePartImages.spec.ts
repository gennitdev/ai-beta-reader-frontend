// @vitest-environment jsdom
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '@/lib/database'
import { usePartImages } from '@/composables/usePartImages'

const h = vi.hoisted(() => ({
  canStoreImages: null as { value: boolean } | null,
  fetchPartImages: vi.fn(),
  getImageSource: vi.fn(),
  getWikiPages: vi.fn(),
  getImageWikiTags: vi.fn(),
  setImageWikiTags: vi.fn(),
  updateImageAssetNotes: vi.fn(),
}))

vi.mock('@/composables/useImageLibrary', async () => {
  const { ref } = await import('vue')
  const canStoreImages = ref(true)
  h.canStoreImages = canStoreImages
  return {
    useImageLibrary: () => ({
      canStoreImages,
      fetchPartImages: h.fetchPartImages,
      getImageSource: h.getImageSource,
    }),
  }
})

vi.mock('@/composables/useDatabase', () => ({
  useDatabase: () => ({
    getWikiPages: h.getWikiPages,
    getImageWikiTags: h.getImageWikiTags,
    setImageWikiTags: h.setImageWikiTags,
    updateImageAssetNotes: h.updateImageAssetNotes,
  }),
}))

function img(id: string, overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id,
    book_id: 'b1',
    chapter_id: null,
    asset_type: 'illustration' as ImageAsset['asset_type'],
    file_name: `${id}.png`,
    file_path: `images/${id}.png`,
    mime_type: 'image/png',
    image_data: null,
    notes: '',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  h.fetchPartImages.mockResolvedValue([])
  h.getImageSource.mockImplementation(async (image: ImageAsset) => `src:${image.id}`)
  h.getWikiPages.mockResolvedValue([])
  h.getImageWikiTags.mockResolvedValue([])
  h.setImageWikiTags.mockResolvedValue(undefined)
  h.updateImageAssetNotes.mockResolvedValue(undefined)
})

afterEach(() => {
  // Restore spies (e.g. document.createElement) so re-spying in a later test
  // does not stack into infinite recursion.
  vi.restoreAllMocks()
})

const setup = (partId: string | undefined = 'part-1', bookId: string | undefined = 'book-1') =>
  usePartImages(() => partId, () => bookId)

describe('refreshPartImages', () => {
  it('clears state when there is no part id', async () => {
    const c = usePartImages(() => undefined, () => undefined)
    c.partImages.value = [img('x')]
    await c.refreshPartImages()
    expect(c.partImages.value).toEqual([])
    expect(h.fetchPartImages).not.toHaveBeenCalled()
  })

  it('loads images, sources, tags, and wiki pages', async () => {
    h.fetchPartImages.mockResolvedValue([img('a'), img('b')])
    h.getImageWikiTags.mockResolvedValue([{ wiki_page_id: 'w1' }])
    h.getWikiPages.mockResolvedValue([{ id: 'w1', page_name: 'Alice', page_type: 'character' }])

    const c = setup()
    await c.refreshPartImages()

    expect(c.partImages.value.map((i) => i.id)).toEqual(['a', 'b'])
    expect(c.partImageSources.value).toEqual({ a: 'src:a', b: 'src:b' })
    expect(c.partImageTags.value.a).toEqual([{ wiki_page_id: 'w1' }])
    expect(c.bookWikiPages.value).toEqual([{ id: 'w1', page_name: 'Alice', page_type: 'character' }])
    expect(c.partImagesLoading.value).toBe(false)
  })

  it('records an error when loading fails', async () => {
    h.fetchPartImages.mockRejectedValue(new Error('boom'))
    const c = setup()
    await c.refreshPartImages()
    expect(c.partImageError.value).toBe('boom')
    expect(c.partImagesLoading.value).toBe(false)
  })
})

describe('modal + computed state', () => {
  it('opens an internal image only when a source exists', async () => {
    h.fetchPartImages.mockResolvedValue([img('a')])
    const c = setup()
    await c.refreshPartImages()

    c.openImageModal('missing')
    expect(c.showImageLightbox.value).toBe(false)

    c.openImageModal('a')
    expect(c.showImageLightbox.value).toBe(true)
    expect(c.activeImage.value?.id).toBe('a')
    expect(c.activeImageSource.value).toBe('src:a')
    expect(c.activeImageLabel.value).toBe('a.png')
  })

  it('opens an external asset and loads its tags', async () => {
    h.getImageWikiTags.mockResolvedValue([{ wiki_page_id: 'w9' }])
    const c = setup()
    await c.openImageAsset(img('cover'), 'src:cover')

    expect(c.showImageLightbox.value).toBe(true)
    expect(c.activeImage.value?.id).toBe('cover')
    expect(c.activeImageSource.value).toBe('src:cover')
    expect(c.activeImageTags.value).toEqual([{ wiki_page_id: 'w9' }])

    c.closeImageModal()
    expect(c.showImageLightbox.value).toBe(false)
    expect(c.activeImage.value).toBeNull()
  })
})

describe('navigation', () => {
  it('moves between images that have sources', async () => {
    h.fetchPartImages.mockResolvedValue([img('a'), img('b'), img('c')])
    const c = setup()
    await c.refreshPartImages()

    c.openImageModal('a')
    expect(c.hasPrevImage.value).toBe(false)
    expect(c.hasNextImage.value).toBe(true)

    c.goToNextImage()
    expect(c.activeImageId.value).toBe('b')
    c.goToNextImage()
    expect(c.activeImageId.value).toBe('c')
    expect(c.hasNextImage.value).toBe(false)

    c.goToPrevImage()
    expect(c.activeImageId.value).toBe('b')
  })
})

describe('saving notes and tags', () => {
  it('saves notes for an internal image', async () => {
    h.fetchPartImages.mockResolvedValue([img('a')])
    const c = setup()
    await c.refreshPartImages()
    c.openImageModal('a')

    await c.handleSaveActiveImageNotes('new note')

    expect(h.updateImageAssetNotes).toHaveBeenCalledWith('a', 'new note')
    expect(c.partImages.value[0].notes).toBe('new note')
    expect(c.savingImageNotes.value).toBe(false)
  })

  it('saves tags and refreshes them', async () => {
    h.fetchPartImages.mockResolvedValue([img('a')])
    const c = setup()
    await c.refreshPartImages()
    c.openImageModal('a')

    h.getImageWikiTags.mockResolvedValue([{ wiki_page_id: 'w2' }])
    await c.handleSaveActiveImageTags(['w2'])

    expect(h.setImageWikiTags).toHaveBeenCalledWith('a', ['w2'])
    expect(c.partImageTags.value.a).toEqual([{ wiki_page_id: 'w2' }])
  })

  it('records an error when saving notes fails', async () => {
    h.fetchPartImages.mockResolvedValue([img('a')])
    h.updateImageAssetNotes.mockRejectedValue(new Error('save failed'))
    const c = setup()
    await c.refreshPartImages()
    c.openImageModal('a')

    await c.handleSaveActiveImageNotes('x')
    expect(c.partImageError.value).toBe('save failed')
  })
})

describe('warn branches and external-image flows', () => {
  it('warns but continues when a source or tag load fails during refresh', async () => {
    h.fetchPartImages.mockResolvedValue([img('a'), img('b')])
    h.getImageSource.mockImplementation(async (image: ImageAsset) => {
      if (image.id === 'a') throw new Error('no source')
      return `src:${image.id}`
    })
    h.getImageWikiTags.mockRejectedValueOnce(new Error('no tags'))
    h.getWikiPages.mockRejectedValue(new Error('no pages'))

    const c = setup()
    await c.refreshPartImages()

    expect(c.partImageSources.value).toEqual({ b: 'src:b' })
    expect(c.bookWikiPages.value).toEqual([])
    expect(c.partImages.value).toHaveLength(2)
  })

  it('warns when loading tags fails while opening an external asset', async () => {
    h.getImageWikiTags.mockRejectedValue(new Error('tag load failed'))
    const c = setup()
    await c.openImageAsset(img('ext'), 'src:ext')
    expect(c.activeImageTags.value).toEqual([])
    expect(c.activeImageLabel.value).toBe('ext.png')
  })

  it('saves notes and tags for an external image and downloads it', async () => {
    const c = setup()
    await c.openImageAsset(img('ext'), 'src:ext')

    await c.handleSaveActiveImageNotes('external note')
    expect(h.updateImageAssetNotes).toHaveBeenCalledWith('ext', 'external note')
    expect(c.activeImage.value?.notes).toBe('external note')

    h.getImageWikiTags.mockResolvedValue([{ wiki_page_id: 'w5' }])
    await c.handleSaveActiveImageTags(['w5'])
    expect(c.activeImageTags.value).toEqual([{ wiki_page_id: 'w5' }])

    const click = vi.fn()
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLAnchorElement
      if (tag === 'a') el.click = click
      return el
    })
    c.handleDownloadImage('ext')
    expect(click).toHaveBeenCalled()
  })

  it('does nothing when saving notes/tags with no active image', async () => {
    const c = setup()
    await c.handleSaveActiveImageNotes('x')
    await c.handleSaveActiveImageTags(['w'])
    expect(h.updateImageAssetNotes).not.toHaveBeenCalled()
    expect(h.setImageWikiTags).not.toHaveBeenCalled()
  })
})

describe('download + watch', () => {
  it('creates and clicks a download link', async () => {
    h.fetchPartImages.mockResolvedValue([img('a')])
    const c = setup()
    await c.refreshPartImages()

    const click = vi.fn()
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLAnchorElement
      if (tag === 'a') el.click = click
      return el
    })

    c.handleDownloadImage('a')
    expect(click).toHaveBeenCalled()
  })

  it('refreshes when the storage capability changes', async () => {
    const c = setup()
    await c.refreshPartImages()
    h.fetchPartImages.mockClear()
    h.fetchPartImages.mockResolvedValue([img('z')])

    h.canStoreImages!.value = false
    await nextTick()

    expect(h.fetchPartImages).toHaveBeenCalled()
  })
})
