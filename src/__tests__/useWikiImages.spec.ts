// @vitest-environment jsdom
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '@/lib/database'
import { useWikiImages } from '@/composables/useWikiImages'

const h = vi.hoisted(() => ({
  canStoreImages: null as { value: boolean } | null,
  getImageSource: vi.fn(),
  getWikiPageImageAssets: vi.fn(),
  getWikiPageCoverImageAsset: vi.fn(),
  setWikiPageCoverImageId: vi.fn(),
  getImageWikiTags: vi.fn(),
  getWikiPages: vi.fn(),
  setImageWikiTags: vi.fn(),
  updateImageAssetNotes: vi.fn(),
}))

vi.mock('@/composables/useImageLibrary', async () => {
  const { ref } = await import('vue')
  const canStoreImages = ref(true)
  h.canStoreImages = canStoreImages
  return { useImageLibrary: () => ({ canStoreImages, getImageSource: h.getImageSource }) }
})

vi.mock('@/composables/useDatabase', () => ({
  useDatabase: () => ({
    getWikiPageImageAssets: h.getWikiPageImageAssets,
    getWikiPageCoverImageAsset: h.getWikiPageCoverImageAsset,
    setWikiPageCoverImageId: h.setWikiPageCoverImageId,
    getImageWikiTags: h.getImageWikiTags,
    getWikiPages: h.getWikiPages,
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
  h.getWikiPageImageAssets.mockResolvedValue([])
  h.getImageSource.mockImplementation(async (image: ImageAsset) => `src:${image.id}`)
  h.getWikiPageCoverImageAsset.mockResolvedValue(null)
  h.setWikiPageCoverImageId.mockResolvedValue(undefined)
  h.getImageWikiTags.mockResolvedValue([])
  h.getWikiPages.mockResolvedValue([])
  h.setImageWikiTags.mockResolvedValue(undefined)
  h.updateImageAssetNotes.mockResolvedValue(undefined)
})

const setup = (wikiId = 'wiki-1', bookId = 'book-1') =>
  useWikiImages(() => wikiId, () => bookId)

describe('refreshWikiImages', () => {
  it('clears state when there is no wiki page id', async () => {
    const c = useWikiImages(() => undefined, () => undefined)
    c.wikiImages.value = [img('x')]
    await c.refreshWikiImages()
    expect(c.wikiImages.value).toEqual([])
    expect(h.getWikiPageImageAssets).not.toHaveBeenCalled()
  })

  it('loads images, sources, tags, cover, and wiki pages', async () => {
    h.getWikiPageImageAssets.mockResolvedValue([img('a'), img('b')])
    h.getWikiPageCoverImageAsset.mockResolvedValue(img('b'))
    h.getWikiPages.mockResolvedValue([{ id: 'w1', page_name: 'Alice', page_type: 'character' }])

    const c = setup()
    await c.refreshWikiImages()

    expect(c.wikiImages.value.map((i) => i.id)).toEqual(['a', 'b'])
    expect(c.wikiImageSources.value).toEqual({ a: 'src:a', b: 'src:b' })
    expect(c.wikiCoverImageId.value).toBe('b')
    expect(c.bookWikiPages.value).toHaveLength(1)
  })

  it('records an error when loading fails', async () => {
    h.getWikiPageImageAssets.mockRejectedValue(new Error('nope'))
    const c = setup()
    await c.refreshWikiImages()
    expect(c.wikiImageError.value).toBe('nope')
  })
})

describe('hero image', () => {
  it('prefers the cover image and falls back to the first image', async () => {
    h.getWikiPageImageAssets.mockResolvedValue([img('a'), img('b')])
    h.getWikiPageCoverImageAsset.mockResolvedValue(img('b'))
    const c = setup()
    await c.refreshWikiImages()

    expect(c.heroImage.value?.id).toBe('b')
    expect(c.heroImageSrc.value).toBe('src:b')

    c.wikiCoverImageId.value = null
    expect(c.heroImage.value?.id).toBe('a')
  })

  it('opens the hero image in the lightbox', async () => {
    h.getWikiPageImageAssets.mockResolvedValue([img('a')])
    const c = setup()
    await c.refreshWikiImages()

    c.openHeroLightbox()
    expect(c.showImageLightbox.value).toBe(true)
    expect(c.activeImageId.value).toBe('a')
  })
})

describe('cover, navigation, notes, tags, download', () => {
  it('sets an image as the cover', async () => {
    h.getWikiPageImageAssets.mockResolvedValue([img('a'), img('b')])
    const c = setup()
    await c.refreshWikiImages()

    await c.handleSetAsCover('b')
    expect(h.setWikiPageCoverImageId).toHaveBeenCalledWith('wiki-1', 'b')
    expect(c.wikiCoverImageId.value).toBe('b')
    expect(c.settingCoverId.value).toBeNull()
  })

  it('records an error when setting the cover fails', async () => {
    h.getWikiPageImageAssets.mockResolvedValue([img('a')])
    h.setWikiPageCoverImageId.mockRejectedValue(new Error('cover failed'))
    const c = setup()
    await c.refreshWikiImages()

    await c.handleSetAsCover('a')
    expect(c.wikiImageError.value).toBe('cover failed')
  })

  it('navigates between images', async () => {
    h.getWikiPageImageAssets.mockResolvedValue([img('a'), img('b')])
    const c = setup()
    await c.refreshWikiImages()

    c.openImageModal('a')
    c.goToNextImage()
    expect(c.activeImageId.value).toBe('b')
    c.goToPrevImage()
    expect(c.activeImageId.value).toBe('a')
    c.closeImageModal()
    expect(c.showImageLightbox.value).toBe(false)
  })

  it('saves notes and tags for the active image', async () => {
    h.getWikiPageImageAssets.mockResolvedValue([img('a')])
    const c = setup()
    await c.refreshWikiImages()
    c.openImageModal('a')

    await c.handleSaveActiveImageNotes('note')
    expect(h.updateImageAssetNotes).toHaveBeenCalledWith('a', 'note')
    expect(c.wikiImages.value[0].notes).toBe('note')

    h.getImageWikiTags.mockResolvedValue([{ wiki_page_id: 'w2' }])
    await c.handleSaveActiveImageTags(['w2'])
    expect(h.setImageWikiTags).toHaveBeenCalledWith('a', ['w2'])
    expect(c.wikiImageTags.value.a).toEqual([{ wiki_page_id: 'w2' }])
  })

  it('creates and clicks a download link', async () => {
    h.getWikiPageImageAssets.mockResolvedValue([img('a')])
    const c = setup()
    await c.refreshWikiImages()

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
    await c.refreshWikiImages()
    h.getWikiPageImageAssets.mockClear()
    h.getWikiPageImageAssets.mockResolvedValue([img('z')])

    h.canStoreImages!.value = false
    await nextTick()
    expect(h.getWikiPageImageAssets).toHaveBeenCalled()
  })
})
