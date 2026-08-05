// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

// Characterization tests: capture BookView's current data-loading orchestration
// and the key handler functions it hands down to its layout child, so a later
// refactor (extracting composables) can be verified to preserve behavior.

const h = vi.hoisted(() => ({
  route: {
    params: { id: 'book-1' } as Record<string, string>,
    query: {} as Record<string, string>,
    path: '/books/book-1',
  },
  push: vi.fn(),
  books: [] as Array<Record<string, unknown>>,
  chapters: [] as Array<Record<string, unknown>>,
  wikiPages: [] as Array<Record<string, unknown>>,
  parts: [] as unknown[],
  loadBooks: vi.fn(async () => {}),
  loadChapters: vi.fn(async () => {}),
  getWikiPages: vi.fn(async () => h.wikiPages),
  getParts: vi.fn(async () => h.parts),
  saveBook: vi.fn(async () => {}),
  updateWikiPage: vi.fn(async () => {}),
  getBookRevisionActivity: vi.fn(async () => []),
  getWikiPageCoverImageAsset: vi.fn(async () => null),
}))

vi.mock('vue-router', () => ({
  useRoute: () => h.route,
  useRouter: () => ({ push: h.push }),
}))

vi.mock('@/composables/useDatabase', async () => {
  const { ref } = await import('vue')
  const noop = vi.fn(async () => {})
  return {
    useDatabase: () => ({
      books: ref(h.books),
      chapters: ref(h.chapters),
      loadBooks: h.loadBooks,
      loadChapters: h.loadChapters,
      getWikiPages: h.getWikiPages,
      getWikiPage: vi.fn(async () => null),
      createWikiPage: vi.fn(async () => 'wiki-new'),
      getSummary: vi.fn(async () => null),
      getNotes: vi.fn(async () => null),
      saveBook: h.saveBook,
      getParts: h.getParts,
      updateWikiPage: h.updateWikiPage,
      updateChapterOrders: noop,
      updatePartOrder: noop,
      findReplaceMatches: vi.fn(async () => []),
      replaceFindReplaceMatches: vi.fn(async () => ({ replacedCount: 0, fields: {} })),
      restoreFindReplaceFields: noop,
      setBookCoverImageId: noop,
      getBookImageAssets: vi.fn(async () => []),
      updateImageAssetNotes: noop,
      getImageWikiTags: vi.fn(async () => []),
      setImageWikiTags: noop,
      getWikiPageCoverImageAsset: h.getWikiPageCoverImageAsset,
      getBookRevisionActivity: h.getBookRevisionActivity,
    }),
  }
})

vi.mock('@/composables/useImageLibrary', async () => {
  const { ref } = await import('vue')
  return {
    useImageLibrary: () => ({
      canSelectImages: ref(false),
      canStoreImages: ref(false),
      fetchBookCover: vi.fn(async () => null),
      pickNewBookCover: vi.fn(async () => null),
      getImageSource: vi.fn(async () => ''),
      fetchChapterThumbnails: vi.fn(async () => ({})),
      fetchPartThumbnails: vi.fn(async () => ({})),
      deleteImage: vi.fn(async () => {}),
    }),
  }
})

import BookView from '@/views/BookView.vue'
import BookDesktopLayout from '@/components/book/BookDesktopLayout.vue'

const wrappers: VueWrapper[] = []

function mountView() {
  const wrapper = mount(BookView, {
    global: {
      stubs: {
        BookDesktopLayout: true,
        BookMobileSection: true,
        SearchModal: true,
        RouterView: true,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

function layoutProps(wrapper: VueWrapper) {
  return wrapper.findComponent(BookDesktopLayout).props() as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  h.route.params = { id: 'book-1' }
  h.route.query = {}
  h.route.path = '/books/book-1'
  h.books = [{
    id: 'book-1', title: 'Ghost Stories', chapter_order: '[]', part_order: '[]',
    cover_image_id: null, created_at: '2026-01-01T00:00:00.000Z',
  }]
  h.chapters = []
  h.parts = []
  h.wikiPages = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
})

describe('BookView', () => {
  it('loads the book, chapters, parts, wiki pages, and activity on mount', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(h.loadBooks).toHaveBeenCalled()
    expect(h.loadChapters).toHaveBeenCalledWith('book-1')
    expect(h.getParts).toHaveBeenCalledWith('book-1')
    expect(h.getWikiPages).toHaveBeenCalledWith('book-1')
    expect(h.getBookRevisionActivity).toHaveBeenCalledWith('book-1')

    expect((layoutProps(wrapper).book as { title: string }).title).toBe('Ghost Stories')
  })

  it('redirects to the book list when the book is missing', async () => {
    h.books = []
    mountView()
    await flushPromises()

    expect(h.push).toHaveBeenCalledWith('/books')
  })

  it('saves an edited book title through saveBook', async () => {
    const wrapper = mountView()
    await flushPromises()

    const props = layoutProps(wrapper)
    ;(props.startEditingBookTitle as () => void)()
    ;(props.updateEditingBookTitle as (v: string) => void)('  Renamed Book  ')
    await (props.saveBookTitle as () => Promise<void>)()

    expect(h.saveBook).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'book-1', title: 'Renamed Book' }),
    )
  })

  it('persists a wiki-page pin toggle through updateWikiPage', async () => {
    const wrapper = mountView()
    await flushPromises()

    const toggle = layoutProps(wrapper).toggleWikiPagePinned as (page: unknown) => Promise<void>
    await toggle({ id: 'wiki-7', is_pinned: false, updated_at: '' })

    expect(h.updateWikiPage).toHaveBeenCalledWith('wiki-7', { is_pinned: true })
  })

  it('exposes the current chapter count to the layout', async () => {
    h.chapters = [
      { id: 'c1', book_id: 'book-1', title: 'One', text: 'a b c', word_count: 3, part_id: null, created_at: '2026-01-01' },
      { id: 'c2', book_id: 'book-1', title: 'Two', text: 'd e', word_count: 2, part_id: null, created_at: '2026-01-02' },
    ]
    const wrapper = mountView()
    await flushPromises()

    expect(layoutProps(wrapper).chapterCount).toBe(2)
  })
})
