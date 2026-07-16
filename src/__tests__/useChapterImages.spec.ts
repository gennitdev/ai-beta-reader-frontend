// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '@/lib/database'
import { useChapterImages } from '@/composables/useChapterImages'

const h = vi.hoisted(() => ({
  canSelectImages: null as { value: boolean } | null,
  canStoreImages: null as { value: boolean } | null,
  addImagesToChapter: vi.fn(),
  deleteImage: vi.fn(),
  fetchChapterImages: vi.fn(),
  fetchChapterCover: vi.fn(),
  setChapterCoverImageId: vi.fn(),
  getImageSource: vi.fn(),
  getWikiPages: vi.fn(),
  getImageWikiTags: vi.fn(),
  setImageWikiTags: vi.fn(),
  updateImageAssetNotes: vi.fn(),
}))

vi.mock('@/composables/useImageLibrary', async () => {
  const { ref } = await import('vue')
  const canSelectImages = ref(true)
  const canStoreImages = ref(true)
  h.canSelectImages = canSelectImages
  h.canStoreImages = canStoreImages
  return {
    useImageLibrary: () => ({
      canSelectImages,
      canStoreImages,
      addImagesToChapter: h.addImagesToChapter,
      deleteImage: h.deleteImage,
      fetchChapterImages: h.fetchChapterImages,
      fetchChapterCover: h.fetchChapterCover,
      setChapterCoverImageId: h.setChapterCoverImageId,
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
    chapter_id: 'ch-1',
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
  h.fetchChapterImages.mockResolvedValue([])
  h.fetchChapterCover.mockResolvedValue(null)
  h.getImageSource.mockImplementation(async (image: ImageAsset) => `src:${image.id}`)
  h.getWikiPages.mockResolvedValue([])
  h.getImageWikiTags.mockResolvedValue([])
  h.setImageWikiTags.mockResolvedValue(undefined)
  h.updateImageAssetNotes.mockResolvedValue(undefined)
  h.setChapterCoverImageId.mockResolvedValue(undefined)
  h.deleteImage.mockResolvedValue(undefined)
  h.addImagesToChapter.mockResolvedValue([])
})

const setup = (chapterId = 'ch-1', bookId = 'book-1') =>
  useChapterImages(() => chapterId, () => bookId)

describe('refreshChapterImages', () => {
  it('clears state when there is no chapter id', async () => {
    const c = useChapterImages(() => undefined, () => undefined)
    c.chapterImages.value = [img('x')]
    await c.refreshChapterImages()
    expect(c.chapterImages.value).toEqual([])
    expect(h.fetchChapterImages).not.toHaveBeenCalled()
  })

  it('loads images, sources, tags, wiki pages, and cover', async () => {
    h.fetchChapterImages.mockResolvedValue([img('a'), img('b')])
    h.fetchChapterCover.mockResolvedValue(img('a'))
    h.getWikiPages.mockResolvedValue([{ id: 'w1', page_name: 'Alice', page_type: 'character' }])

    const c = setup()
    await c.refreshChapterImages()

    expect(c.chapterImages.value.map((i) => i.id)).toEqual(['a', 'b'])
    expect(c.chapterImageSources.value).toEqual({ a: 'src:a', b: 'src:b' })
    expect(c.chapterCoverImageId.value).toBe('a')
    expect(c.bookWikiPages.value).toHaveLength(1)
    expect(c.heroImage.value?.id).toBe('a')
  })

  it('records an error when loading fails', async () => {
    h.fetchChapterImages.mockRejectedValue(new Error('load fail'))
    const c = setup()
    await c.refreshChapterImages()
    expect(c.chapterImageError.value).toBe('load fail')
  })
})

describe('handleAddIllustrations', () => {
  it('prepends newly added images with their sources', async () => {
    h.fetchChapterImages.mockResolvedValue([img('a')])
    const c = setup()
    await c.refreshChapterImages()

    h.addImagesToChapter.mockResolvedValue([img('new')])
    await c.handleAddIllustrations()

    expect(h.addImagesToChapter).toHaveBeenCalledWith('book-1', 'ch-1')
    expect(c.chapterImages.value.map((i) => i.id)).toEqual(['new', 'a'])
    expect(c.chapterImageSources.value.new).toBe('src:new')
    expect(c.addingChapterImages.value).toBe(false)
  })

  it('does nothing when no images are returned', async () => {
    const c = setup()
    await c.refreshChapterImages()
    h.addImagesToChapter.mockResolvedValue([])
    await c.handleAddIllustrations()
    expect(c.chapterImages.value).toEqual([])
  })

  it('records an error when adding fails', async () => {
    const c = setup()
    h.addImagesToChapter.mockRejectedValue(new Error('add fail'))
    await c.handleAddIllustrations()
    expect(c.chapterImageError.value).toBe('add fail')
  })
})

describe('delete flow', () => {
  it('requests then cancels a deletion', () => {
    const c = setup()
    c.requestDeleteIllustration('a')
    expect(c.showDeleteIllustrationModal.value).toBe(true)
    expect(c.illustrationToDelete.value).toBe('a')

    c.cancelDeleteIllustration()
    expect(c.showDeleteIllustrationModal.value).toBe(false)
    expect(c.illustrationToDelete.value).toBeNull()
  })

  it('deletes an illustration and clears its cover when it was the cover', async () => {
    h.fetchChapterImages.mockResolvedValue([img('a'), img('b')])
    h.fetchChapterCover.mockResolvedValue(img('a'))
    const c = setup()
    await c.refreshChapterImages()

    c.requestDeleteIllustration('a')
    await c.handleDeleteIllustration()

    expect(h.deleteImage).toHaveBeenCalled()
    expect(c.chapterImages.value.map((i) => i.id)).toEqual(['b'])
    expect(c.chapterImageSources.value.a).toBeUndefined()
    expect(h.setChapterCoverImageId).toHaveBeenCalledWith('ch-1', null)
    expect(c.chapterCoverImageId.value).toBeNull()
    expect(c.showDeleteIllustrationModal.value).toBe(false)
  })

  it('records an error when deletion fails', async () => {
    h.fetchChapterImages.mockResolvedValue([img('a')])
    h.deleteImage.mockRejectedValue(new Error('delete fail'))
    const c = setup()
    await c.refreshChapterImages()

    c.requestDeleteIllustration('a')
    await c.handleDeleteIllustration()
    expect(c.chapterImageError.value).toBe('delete fail')
  })
})

describe('cover, modal, notes, tags, download', () => {
  it('sets an image as the cover', async () => {
    h.fetchChapterImages.mockResolvedValue([img('a')])
    const c = setup()
    await c.refreshChapterImages()

    await c.handleSetAsCover('a')
    expect(h.setChapterCoverImageId).toHaveBeenCalledWith('ch-1', 'a')
    expect(c.chapterCoverImageId.value).toBe('a')
  })

  it('opens/closes the modal and navigates', async () => {
    h.fetchChapterImages.mockResolvedValue([img('a'), img('b')])
    const c = setup()
    await c.refreshChapterImages()

    c.openImageModal('a')
    expect(c.showImageLightbox.value).toBe(true)
    c.goToNextImage()
    expect(c.activeImageId.value).toBe('b')
    c.goToPrevImage()
    expect(c.activeImageId.value).toBe('a')
    c.closeImageModal()
    expect(c.showImageLightbox.value).toBe(false)
  })

  it('saves notes and tags', async () => {
    h.fetchChapterImages.mockResolvedValue([img('a')])
    const c = setup()
    await c.refreshChapterImages()
    c.openImageModal('a')

    await c.handleSaveActiveImageNotes('note')
    expect(c.chapterImages.value[0].notes).toBe('note')

    h.getImageWikiTags.mockResolvedValue([{ wiki_page_id: 'w2' }])
    await c.handleSaveActiveImageTags(['w2'])
    expect(h.setImageWikiTags).toHaveBeenCalledWith('a', ['w2'])
    expect(c.chapterImageTags.value.a).toEqual([{ wiki_page_id: 'w2' }])
  })

  it('downloads and opens the hero image', async () => {
    h.fetchChapterImages.mockResolvedValue([img('a')])
    const c = setup()
    await c.refreshChapterImages()

    const click = vi.fn()
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLAnchorElement
      if (tag === 'a') el.click = click
      return el
    })

    c.handleDownloadImage('a')
    expect(click).toHaveBeenCalled()

    c.openHeroLightbox()
    expect(c.activeImageId.value).toBe('a')
    expect(c.chapterImageUploadAvailable.value).toBe(true)
  })
})
