// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
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
  downloadOrShareImage: vi.fn(),
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
      downloadOrShareImage: h.downloadOrShareImage,
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
  h.downloadOrShareImage.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
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

    await c.handleDownloadImage('a')
    expect(h.downloadOrShareImage).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))

    c.openHeroLightbox()
    expect(c.activeImageId.value).toBe('a')
    expect(c.chapterImageUploadAvailable.value).toBe(true)
  })

  it('exposes active-image computeds for the open image', async () => {
    h.fetchChapterImages.mockResolvedValue([img('a')])
    h.getImageWikiTags.mockResolvedValue([{ wiki_page_id: 'w1' }])
    const c = setup()
    await c.refreshChapterImages()

    expect(c.activeImageSource.value).toBeNull()
    expect(c.activeImageTags.value).toEqual([])
    expect(c.activeImageLabel.value).toBe('')

    c.openImageModal('a')
    expect(c.activeImageSource.value).toBe('src:a')
    expect(c.activeImageTags.value).toEqual([{ wiki_page_id: 'w1' }])
    expect(c.activeImageLabel.value).toBe('a.png')
  })
})

describe('warn and error branches', () => {
  it('warns but continues when source/tag/page loads fail during refresh', async () => {
    h.fetchChapterImages.mockResolvedValue([img('a')])
    h.getImageSource.mockRejectedValue(new Error('no source'))
    h.getImageWikiTags.mockRejectedValue(new Error('no tags'))
    h.getWikiPages.mockRejectedValue(new Error('no pages'))

    const c = setup()
    await c.refreshChapterImages()

    expect(c.chapterImageSources.value).toEqual({})
    expect(c.bookWikiPages.value).toEqual([])
    expect(c.chapterImages.value).toHaveLength(1)
  })

  it('warns when a preview fails for a newly added illustration', async () => {
    const c = setup()
    await c.refreshChapterImages()
    h.addImagesToChapter.mockResolvedValue([img('new')])
    h.getImageSource.mockRejectedValue(new Error('preview fail'))

    await c.handleAddIllustrations()
    expect(c.chapterImages.value.map((i) => i.id)).toEqual(['new'])
    expect(c.chapterImageSources.value.new).toBeUndefined()
  })

  it('closes the lightbox when the active image is deleted', async () => {
    h.fetchChapterImages.mockResolvedValue([img('a')])
    const c = setup()
    await c.refreshChapterImages()
    c.openImageModal('a')

    c.requestDeleteIllustration('a')
    await c.handleDeleteIllustration()
    expect(c.showImageLightbox.value).toBe(false)
    expect(c.activeImageId.value).toBeNull()
  })

  it('records errors when saving notes/tags or setting the cover fails', async () => {
    h.fetchChapterImages.mockResolvedValue([img('a')])
    const c = setup()
    await c.refreshChapterImages()
    c.openImageModal('a')

    h.updateImageAssetNotes.mockRejectedValue(new Error('notes fail'))
    await c.handleSaveActiveImageNotes('x')
    expect(c.chapterImageError.value).toBe('notes fail')

    h.setImageWikiTags.mockRejectedValue(new Error('tags fail'))
    await c.handleSaveActiveImageTags(['w'])
    expect(c.chapterImageError.value).toBe('tags fail')

    h.setChapterCoverImageId.mockRejectedValue(new Error('cover fail'))
    await c.handleSetAsCover('a')
    expect(c.chapterImageError.value).toBe('cover fail')
  })

  it('does not cancel a deletion while one is in progress', () => {
    const c = setup()
    c.requestDeleteIllustration('a')
    c.deletingIllustration.value = true
    c.cancelDeleteIllustration()
    expect(c.showDeleteIllustrationModal.value).toBe(true)
  })

  it('uses user-facing fallback messages for non-Error rejections', async () => {
    h.fetchChapterImages.mockRejectedValue('load failed')
    const loading = setup()
    await loading.refreshChapterImages()
    expect(loading.chapterImageError.value).toBe('Failed to load chapter illustrations')

    h.addImagesToChapter.mockRejectedValue('add failed')
    const adding = setup()
    await adding.handleAddIllustrations()
    expect(adding.chapterImageError.value).toBe('Failed to add illustrations')

    h.fetchChapterImages.mockResolvedValue([img('a')])
    h.getImageSource.mockResolvedValue('src:a')
    const actions = setup()
    await actions.refreshChapterImages()
    actions.openImageModal('a')

    h.updateImageAssetNotes.mockRejectedValue('notes failed')
    await actions.handleSaveActiveImageNotes('note')
    expect(actions.chapterImageError.value).toBe('Failed to save image notes')

    h.setImageWikiTags.mockRejectedValue('tags failed')
    await actions.handleSaveActiveImageTags(['w1'])
    expect(actions.chapterImageError.value).toBe('Failed to save image tags')

    h.setChapterCoverImageId.mockRejectedValue('cover failed')
    await actions.handleSetAsCover('a')
    expect(actions.chapterImageError.value).toBe('Failed to set cover image')

    h.deleteImage.mockRejectedValue('delete failed')
    actions.requestDeleteIllustration('a')
    await actions.handleDeleteIllustration()
    expect(actions.chapterImageError.value).toBe('Failed to delete illustration')
  })

  it('covers missing identifiers, images, sources, and inactive-image no-ops', async () => {
    const missingIds = setup('', '')
    await missingIds.handleAddIllustrations()
    await missingIds.handleSetAsCover('a')
    expect(h.addImagesToChapter).not.toHaveBeenCalled()
    expect(h.setChapterCoverImageId).not.toHaveBeenCalled()

    const c = setup()
    await c.refreshChapterImages()
    await c.handleDeleteIllustration()
    c.requestDeleteIllustration('missing')
    await c.handleDeleteIllustration()
    c.openImageModal('missing')
    await c.handleSaveActiveImageNotes('note')
    await c.handleSaveActiveImageTags(['w1'])
    c.goToNextImage()
    c.goToPrevImage()
    c.handleDownloadImage('missing')
    c.openHeroLightbox()

    expect(c.showImageLightbox.value).toBe(false)
    expect(h.deleteImage).not.toHaveBeenCalled()
    expect(h.updateImageAssetNotes).not.toHaveBeenCalled()
    expect(h.setImageWikiTags).not.toHaveBeenCalled()
  })

  it('falls back when cover, labels, tags, and navigation sources are missing', async () => {
    h.fetchChapterImages.mockResolvedValue([
      img('a', { file_name: '' }),
      img('b'),
      img('c'),
    ])
    h.fetchChapterCover.mockResolvedValue(img('not-in-list'))
    h.getImageSource.mockImplementation(async (image: ImageAsset) => image.id === 'b' ? 'src:b' : '')
    const c = setup('ch-1', '')
    await c.refreshChapterImages()

    expect(h.getWikiPages).not.toHaveBeenCalled()
    expect(c.heroImage.value?.id).toBe('a')
    expect(c.heroImageSrc.value).toBe('')

    c.activeImageId.value = 'a'
    expect(c.activeImageSource.value).toBe('')
    expect(c.activeImageTags.value).toEqual([])
    expect(c.activeImageLabel.value).toBe('')
    c.goToNextImage()
    expect(c.activeImageId.value).toBe('b')
    c.goToNextImage()
    expect(c.activeImageId.value).toBe('b')
    c.goToPrevImage()
    expect(c.activeImageId.value).toBe('b')
  })

  it('refreshes when image persistence capability changes', async () => {
    const c = setup()
    await c.refreshChapterImages()
    h.fetchChapterImages.mockClear()

    h.canStoreImages!.value = !h.canStoreImages!.value
    await nextTick()
    await vi.waitFor(() => expect(h.fetchChapterImages).toHaveBeenCalledWith('ch-1'))
  })
})
