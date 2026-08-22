// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { ImageAsset } from '@/lib/database'

const h = vi.hoisted(() => ({ route: { query: {} as Record<string, string> } }))
vi.mock('vue-router', () => ({ useRoute: () => h.route }))

import { useBookImages } from '@/composables/useBookImages'

const asset = (over: Partial<ImageAsset> = {}): ImageAsset => ({
  id: 'img-1', book_id: 'book-1', chapter_id: null, asset_type: 'chapter',
  file_name: 'pic.png', file_path: '/pic.png', mime_type: 'image/png',
  image_data: null, notes: '', created_at: '2026-01-01', updated_at: '2026-01-01', ...over,
})

function setup(opts: { images?: ImageAsset[]; wikiCount?: number } = {}) {
  const bookId = ref('book-1')
  const wikiPages = ref<{ length: number }>({ length: opts.wikiCount ?? 1 })
  const deps = {
    bookId,
    wikiPages,
    loadWiki: vi.fn(async () => {}),
    getBookImageAssets: vi.fn(async () => opts.images ?? [asset()]),
    getImageSource: vi.fn(async () => 'blob:img'),
    getImageWikiTags: vi.fn(async () => [{ image_id: 'img-1', wiki_page_id: 'w1', page_name: 'Mara', page_type: 'character', created_at: '2026-01-01' }]),
    updateImageAssetNotes: vi.fn(async () => {}),
    setImageWikiTags: vi.fn(async () => {}),
    downloadOrShareImage: vi.fn(async () => {}),
  }
  return { deps, images: useBookImages(deps) }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.route.query = {}
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('useBookImages', () => {
  it('loads image assets with their sources and wiki tags', async () => {
    const { deps, images } = setup()
    await images.loadBookImages()

    expect(deps.getBookImageAssets).toHaveBeenCalledWith('book-1')
    expect(images.bookImages.value).toHaveLength(1)
    expect(images.bookImageSources.value['img-1']).toBe('blob:img')
    expect(deps.getImageWikiTags).toHaveBeenCalledWith('img-1')
    expect(images.loadingImages.value).toBe(false)
  })

  it('loads wiki pages first when none are loaded yet', async () => {
    const { deps, images } = setup({ wikiCount: 0 })
    await images.loadBookImages()
    expect(deps.loadWiki).toHaveBeenCalled()
  })

  it('does not reload wiki pages when some are already present', async () => {
    const { deps, images } = setup({ wikiCount: 3 })
    await images.loadBookImages()
    expect(deps.loadWiki).not.toHaveBeenCalled()
  })

  it('resets to empty on a load failure', async () => {
    const { deps, images } = setup()
    deps.getBookImageAssets.mockRejectedValueOnce(new Error('offline'))
    await images.loadBookImages()

    expect(images.bookImages.value).toEqual([])
    expect(images.bookImageSources.value).toEqual({})
  })

  it('derives the selected image from the route query', async () => {
    h.route.query = { imageId: 'img-1' }
    const { images } = setup()
    await images.loadBookImages()

    expect(images.selectedImageId.value).toBe('img-1')
    expect(images.selectedImage.value?.id).toBe('img-1')
    expect(images.selectedImageSrc.value).toBe('blob:img')
    expect(images.selectedImageTags.value).toHaveLength(1)
  })

  it('has no selection when the route carries no imageId', () => {
    const { images } = setup()
    expect(images.selectedImageId.value).toBeNull()
    expect(images.selectedImage.value).toBeNull()
    expect(images.selectedImageTags.value).toEqual([])
  })

  it('saves notes for the selected image and updates it in place', async () => {
    h.route.query = { imageId: 'img-1' }
    const { deps, images } = setup()
    await images.loadBookImages()
    await images.saveSelectedImageNotes('a fresh caption')

    expect(deps.updateImageAssetNotes).toHaveBeenCalledWith('img-1', 'a fresh caption')
    expect(images.bookImages.value[0].notes).toBe('a fresh caption')
  })

  it('saves wiki tags for the selected image', async () => {
    h.route.query = { imageId: 'img-1' }
    const { deps, images } = setup()
    await images.loadBookImages()
    await images.saveSelectedImageTags(['w1', 'w2'])

    expect(deps.setImageWikiTags).toHaveBeenCalledWith('img-1', ['w1', 'w2'])
  })

  it('downloads or shares a known image through the image library', async () => {
    const { deps, images } = setup()
    await images.loadBookImages()

    await images.downloadSelectedImage('img-1')
    expect(deps.downloadOrShareImage).toHaveBeenCalledWith(expect.objectContaining({ id: 'img-1' }))
  })

  it('does nothing when downloading an image with no source', async () => {
    const { deps, images } = setup()
    await images.downloadSelectedImage('missing')
    expect(deps.downloadOrShareImage).not.toHaveBeenCalled()
  })
})
