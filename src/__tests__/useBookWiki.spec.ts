import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const h = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: h.push }) }))

import { useBookWiki } from '@/composables/useBookWiki'

function dbPage(over: Record<string, unknown> = {}) {
  return {
    id: 'w1', page_name: 'Mara', page_type: 'character', summary: 'A ranger',
    aliases: '["The Ranger"]', tags: '["hero"]', is_major: 1, is_pinned: 0,
    created_by_ai: 0, created_at: '2026-01-01', updated_at: '2026-01-02',
    content: 'hello', cover_image_id: null, ...over,
  }
}

function setup(pages: Array<Record<string, unknown>> = [dbPage()]) {
  const bookId = ref('book-1')
  const deps = {
    bookId,
    getWikiPages: vi.fn(async () => pages),
    getWikiPage: vi.fn(async () => null as unknown),
    createWikiPage: vi.fn(async () => 'w-new'),
    updateWikiPage: vi.fn(async () => {}),
    getWikiPageCoverImageAsset: vi.fn(async () => null),
    getImageSource: vi.fn(async () => 'blob:thumb'),
  }
  return { deps, wiki: useBookWiki(deps) }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('useBookWiki', () => {
  it('loads and maps wiki rows, parsing arrays and booleans', async () => {
    const { wiki } = setup()
    await wiki.loadWiki()

    expect(wiki.wikiPages.value).toHaveLength(1)
    const page = wiki.wikiPages.value[0]
    expect(page.aliases).toEqual(['The Ranger'])
    expect(page.tags).toEqual(['hero'])
    expect(page.is_major).toBe(true)
    expect(page.is_pinned).toBe(false)
    expect(page.content_length).toBe('hello'.length)
    expect(wiki.hasWikiPages.value).toBe(true)
  })

  it('loads cover thumbnails for pages that have a cover image', async () => {
    const { deps, wiki } = setup([dbPage({ cover_image_id: 'img-9' })])
    deps.getWikiPageCoverImageAsset.mockResolvedValueOnce({ id: 'img-9' } as never)
    await wiki.loadWiki()

    expect(deps.getWikiPageCoverImageAsset).toHaveBeenCalledWith('w1')
    expect(wiki.wikiPageThumbnails.value.w1).toBe('blob:thumb')
  })

  it('resets to empty on a load failure', async () => {
    const { deps, wiki } = setup()
    deps.getWikiPages.mockRejectedValueOnce(new Error('offline'))
    await wiki.loadWiki()

    expect(wiki.wikiPages.value).toEqual([])
    expect(wiki.loadingWiki.value).toBe(false)
  })

  it('groups by type with pinned pages sorted first, then alphabetical', async () => {
    const { wiki } = setup([
      dbPage({ id: 'a', page_name: 'Zed', page_type: 'character', is_pinned: 0 }),
      dbPage({ id: 'b', page_name: 'Amy', page_type: 'character', is_pinned: 0 }),
      dbPage({ id: 'c', page_name: 'Bo', page_type: 'character', is_pinned: 1 }),
      dbPage({ id: 'd', page_name: 'Keep', page_type: 'location', is_pinned: 0 }),
    ])
    await wiki.loadWiki()

    const characters = wiki.wikiPagesByType.value.character.map((p) => p.page_name)
    expect(characters).toEqual(['Bo', 'Amy', 'Zed']) // pinned Bo first, then alpha
    expect(wiki.wikiPagesByType.value.location.map((p) => p.page_name)).toEqual(['Keep'])
  })

  it('validates an empty page name in the create flow', async () => {
    const { deps, wiki } = setup()
    wiki.openCreateWikiModal()
    wiki.newWikiPageName.value = '   '
    await wiki.handleCreateWikiPage()

    expect(wiki.createWikiPageError.value).toContain('Please enter a page name')
    expect(deps.createWikiPage).not.toHaveBeenCalled()
  })

  it('rejects a duplicate page name', async () => {
    const { deps, wiki } = setup()
    deps.getWikiPage.mockResolvedValueOnce({ id: 'existing' })
    wiki.newWikiPageName.value = 'Mara'
    await wiki.handleCreateWikiPage()

    expect(wiki.createWikiPageError.value).toContain('already exists')
    expect(deps.createWikiPage).not.toHaveBeenCalled()
  })

  it('creates a page then reloads and navigates to it', async () => {
    const { deps, wiki } = setup()
    wiki.newWikiPageName.value = 'New Hero'
    wiki.newWikiPageType.value = 'character'
    await wiki.handleCreateWikiPage()

    expect(deps.createWikiPage).toHaveBeenCalledWith(
      expect.objectContaining({ book_id: 'book-1', page_name: 'New Hero', page_type: 'character' }),
    )
    expect(deps.getWikiPages).toHaveBeenCalled() // reload
    expect(h.push).toHaveBeenCalledWith('/books/book-1/wiki/w-new')
    expect(wiki.showCreateWikiModal.value).toBe(false)
  })

  it('keeps the modal open while a create is in flight', () => {
    const { wiki } = setup()
    wiki.openCreateWikiModal()
    wiki.creatingWikiPage.value = true
    wiki.closeCreateWikiModal()
    expect(wiki.showCreateWikiModal.value).toBe(true)
  })

  it('optimistically toggles a pin and persists it', async () => {
    const { deps, wiki } = setup()
    await wiki.loadWiki()
    const page = wiki.wikiPages.value[0]
    await wiki.toggleWikiPagePinned(page)

    expect(page.is_pinned).toBe(true)
    expect(deps.updateWikiPage).toHaveBeenCalledWith('w1', { is_pinned: true })
  })

  it('rolls back the pin when persistence fails', async () => {
    const { deps, wiki } = setup()
    deps.updateWikiPage.mockRejectedValueOnce(new Error('offline'))
    await wiki.loadWiki()
    const page = wiki.wikiPages.value[0]
    await wiki.toggleWikiPagePinned(page)

    expect(page.is_pinned).toBe(false) // reverted
  })

  it('applies an external pin change to the matching page', async () => {
    const { wiki } = setup()
    await wiki.loadWiki()
    wiki.handleWikiPagePinChanged({ id: 'w1', isPinned: true, updatedAt: '2026-02-02' })

    expect(wiki.wikiPages.value[0].is_pinned).toBe(true)
    expect(wiki.wikiPages.value[0].updated_at).toBe('2026-02-02')
  })
})
