// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  route: {
    params: { id: 'book-1' } as Record<string, string>,
    query: {} as Record<string, string>,
    path: '/books/book-1',
    fullPath: '/books/book-1',
    name: 'book',
  },
  push: vi.fn(),
  books: [] as Array<Record<string, unknown>>,
  chapters: [] as Array<Record<string, unknown>>,
  parts: [] as Array<Record<string, unknown>>,
  wikiPages: [] as Array<Record<string, unknown>>,
  activity: [] as Array<Record<string, unknown>>,
  loadBooks: vi.fn(async () => {}), loadChapters: vi.fn(async () => {}), getParts: vi.fn(),
  getSummary: vi.fn(), getPartSummary: vi.fn(), getNotes: vi.fn(), getWikiPages: vi.fn(), getWikiPage: vi.fn(),
  createWikiPage: vi.fn(async () => 'wiki-new'), saveBook: vi.fn(async () => {}),
  updateWikiPage: vi.fn(async () => {}), updateChapterOrders: vi.fn(async () => {}),
  updatePartOrder: vi.fn(async () => {}), getBookRevisionActivity: vi.fn(),
  getWikiPageCoverImageAsset: vi.fn(async () => null),
  fetchBookCover: vi.fn(async () => null), pickNewBookCover: vi.fn(async () => null),
  getImageSource: vi.fn(async () => 'image-src'), fetchChapterThumbnails: vi.fn(async () => ({})),
  fetchPartThumbnails: vi.fn(async () => ({})), deleteImage: vi.fn(async () => {}),
  setBookCoverImageId: vi.fn(async () => {}),
}))

vi.mock('vue-router', () => ({
  useRoute: () => h.route,
  useRouter: () => ({ push: h.push }),
}))

vi.mock('@/composables/useDatabase', async () => {
  const { ref } = await import('vue')
  return {
    useDatabase: () => ({
      books: ref(h.books), chapters: ref(h.chapters), loadBooks: h.loadBooks, loadChapters: h.loadChapters,
      getWikiPages: h.getWikiPages, getWikiPage: h.getWikiPage, createWikiPage: h.createWikiPage,
      getSummary: h.getSummary, getNotes: h.getNotes, saveBook: h.saveBook, getParts: h.getParts,
      getPartSummary: h.getPartSummary,
      updateWikiPage: h.updateWikiPage, updateChapterOrders: h.updateChapterOrders,
      updatePartOrder: h.updatePartOrder, findReplaceMatches: vi.fn(), replaceFindReplaceMatches: vi.fn(),
      restoreFindReplaceFields: vi.fn(), setBookCoverImageId: h.setBookCoverImageId,
      getBookImageAssets: vi.fn(async () => []), updateImageAssetNotes: vi.fn(),
      getImageWikiTags: vi.fn(async () => []), setImageWikiTags: vi.fn(),
      getWikiPageCoverImageAsset: h.getWikiPageCoverImageAsset,
      getBookRevisionActivity: h.getBookRevisionActivity,
    }),
  }
})

vi.mock('@/composables/useImageLibrary', async () => {
  const { ref } = await import('vue')
  return {
    useImageLibrary: () => ({
      canSelectImages: ref(true), canStoreImages: ref(true), fetchBookCover: h.fetchBookCover,
      pickNewBookCover: h.pickNewBookCover, getImageSource: h.getImageSource,
      fetchChapterThumbnails: h.fetchChapterThumbnails, fetchPartThumbnails: h.fetchPartThumbnails,
      deleteImage: h.deleteImage,
    }),
  }
})

import BookView from '@/views/BookView.vue'

const DesktopStub = {
  name: 'BookDesktopLayout',
  props: [
    'book', 'chapterCount', 'totalWordCount', 'chaptersByPart', 'partSummaries', 'sidebarPartLists',
    'sidebarUncategorized', 'wikiPagesByType', 'revisionActivity', 'currentTab',
    'createNewChapter', 'createNewChapterInPart', 'goToOrganizeChapters', 'openSearchModal',
    'editChapter', 'insertChapter', 'togglePart', 'onSidebarDragEnd', 'startEditingBookTitle',
    'saveBookTitle', 'cancelEditingBookTitle', 'updateEditingBookTitle', 'toggleWikiPagePinned',
    'openCreateWikiModal', 'selectBookCover', 'deleteBookCover',
  ],
  template: `<div data-testid="desktop">
    <span data-testid="book-title">{{ book?.title }}</span><span data-testid="chapter-count">{{ chapterCount }}</span>
    <span data-testid="total-words">{{ totalWordCount }}</span>
    <button data-testid="new-chapter" @click="createNewChapter()">New</button>
    <button data-testid="organize" @click="goToOrganizeChapters()">Organize</button>
    <button data-testid="search" @click="openSearchModal()">Search</button>
    <button data-testid="new-in-part" @click="createNewChapterInPart('part-1')">New in part</button>
    <button data-testid="edit-chapter" @click="editChapter('chapter-1')">Edit chapter</button>
    <button data-testid="insert-before" @click="insertChapter(chaptersByPart.parts[0].chapters[0], 'before')">Insert</button>
    <button data-testid="toggle-part" @click="togglePart('part-1')">Part</button>
    <button data-testid="rename" @click="startEditingBookTitle(); updateEditingBookTitle('Renamed Book'); saveBookTitle()">Rename</button>
    <button data-testid="create-wiki" @click="openCreateWikiModal()">Wiki</button>
  </div>`,
}

const MobileStub = { name: 'BookMobileSection', props: ['book'], template: '<div data-testid="mobile">{{ book?.title }}</div>' }
const SearchStub = {
  name: 'SearchModal', props: ['show', 'initialScope', 'targetId'], emits: ['close'],
  template: '<div v-if="show" data-testid="search-modal">{{ initialScope }}:{{ targetId }}<button @click="$emit(\'close\')">Close</button></div>',
}

const wrappers: VueWrapper[] = []

function book(overrides: Record<string, unknown> = {}) {
  return {
    id: 'book-1', title: 'Ghost Stories', chapter_order: '["chapter-2","chapter-1"]',
    part_order: '["missing-part","part-2"]', cover_image_id: null,
    created_at: '2026-01-01T00:00:00.000Z', ...overrides,
  }
}

function chapter(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, book_id: 'book-1', title: `Chapter ${id}`, text: 'Text', word_count: id === 'chapter-1' ? 400 : 600,
    part_id: id === 'chapter-1' ? 'part-1' : 'part-2', created_at: '2026-01-01T00:00:00.000Z', ...overrides,
  }
}

function part(id: string, createdAt: string, order: string) {
  return { id, book_id: 'book-1', name: id, chapter_order: order, cover_image_id: null, created_at: createdAt, updated_at: createdAt }
}

function mountView() {
  const wrapper = mount(BookView, {
    global: {
      stubs: {
        BookDesktopLayout: DesktopStub, BookMobileSection: MobileStub, SearchModal: SearchStub,
        RouterView: true, teleport: true, BookOpenIcon: true, UserIcon: true, MapPinIcon: true, LightBulbIcon: true,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  h.route.params = { id: 'book-1' }
  h.route.query = {}
  h.route.path = '/books/book-1'
  h.route.fullPath = '/books/book-1'
  h.route.name = 'book'
  h.books.splice(0, h.books.length, book())
  h.chapters.splice(0, h.chapters.length, chapter('chapter-1'), chapter('chapter-2'))
  h.parts = [
    part('part-1', '2026-01-01T00:00:00.000Z', '["chapter-1"]'),
    part('part-2', '2026-01-02T00:00:00.000Z', '["chapter-2"]'),
  ]
  h.wikiPages = []
  h.activity = [{ id: 'revision-1', chapter_id: 'chapter-1', chapter_title: 'One', activity_type: 'save' }]
  h.getParts.mockImplementation(async () => h.parts)
  h.getSummary.mockImplementation(async (id: string) => id === 'chapter-1' ? { summary: 'Summary one.' } : null)
  h.getPartSummary.mockImplementation(async (id: string) => id === 'part-1' ? { summary: 'The opening bargain.' } : null)
  h.getNotes.mockImplementation(async (id: string) => id === 'chapter-2' ? { notes: 'Note two.' } : null)
  h.getWikiPages.mockImplementation(async () => h.wikiPages)
  h.getWikiPage.mockResolvedValue(null)
  h.getBookRevisionActivity.mockImplementation(async () => h.activity)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
})

describe('BookView', () => {
  it('loads, orders, and summarizes the book workspace', async () => {
    const wrapper = mountView()
    await flushPromises()
    const desktop = wrapper.getComponent(DesktopStub)

    expect(h.loadBooks).toHaveBeenCalled()
    expect(h.loadChapters).toHaveBeenCalledWith('book-1')
    expect(h.updatePartOrder).toHaveBeenCalledWith('book-1', ['part-2', 'part-1'])
    expect(desktop.props('chapterCount')).toBe(2)
    expect(desktop.props('totalWordCount')).toBe(1000)
    expect(desktop.props('chaptersByPart').parts.map((item: { id: string }) => item.id)).toEqual(['part-2', 'part-1'])
    expect(desktop.props('chaptersByPart').parts[0].chapters[0].id).toBe('chapter-2')
    expect(desktop.props('partSummaries')).toEqual({ 'part-1': 'The opening bargain.' })
    expect(desktop.props('revisionActivity')).toEqual(h.activity)
  })

  it('redirects to the library when the requested book is missing', async () => {
    h.books.splice(0)
    mountView()
    await flushPromises()
    expect(h.push).toHaveBeenCalledWith('/books')
  })

  it('navigates to chapter creation, editing, insertion, and organization routes', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="new-chapter"]').trigger('click')
    await wrapper.get('[data-testid="organize"]').trigger('click')
    await wrapper.get('[data-testid="new-in-part"]').trigger('click')
    await wrapper.get('[data-testid="edit-chapter"]').trigger('click')
    await wrapper.get('[data-testid="insert-before"]').trigger('click')

    expect(h.push).toHaveBeenCalledWith('/books/book-1/chapter-editor')
    expect(h.push).toHaveBeenCalledWith('/books/book-1/organize')
    expect(h.push).toHaveBeenCalledWith({ path: '/books/book-1/chapter-editor', query: { partId: 'part-1' } })
    expect(h.push).toHaveBeenCalledWith('/books/book-1/chapter-editor/chapter-1')
    expect(h.push).toHaveBeenCalledWith({
      path: '/books/book-1/chapter-editor',
      query: { partId: 'part-2', insertRelativeTo: 'chapter-2', insertPlacement: 'before' },
    })
  })

  it('expands a part and navigates to its detail route', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="toggle-part"]').trigger('click')
    expect(h.push).toHaveBeenCalledWith('/books/book-1/parts/part-1')
  })

  it('renames the book while preserving its ordering metadata', async () => {
    const wrapper = mountView()
    await flushPromises()
    const desktop = wrapper.getComponent(DesktopStub)

    desktop.props('startEditingBookTitle')()
    desktop.props('updateEditingBookTitle')('  Renamed Book  ')
    await desktop.props('saveBookTitle')()
    await flushPromises()

    expect(h.saveBook).toHaveBeenCalledWith(expect.objectContaining({
      id: 'book-1', title: 'Renamed Book', chapter_order: '["chapter-2","chapter-1"]',
    }))
    expect(wrapper.get('[data-testid="book-title"]').text()).toBe('Renamed Book')
  })

  it('opens search with chapter context and closes it cleanly', async () => {
    h.route.params = { id: 'book-1', chapterId: 'chapter-1' }
    h.route.name = 'chapter'
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="search"]').trigger('click')

    expect(wrapper.get('[data-testid="search-modal"]').text()).toContain('chapter:chapter-1')
    await wrapper.get('[data-testid="search-modal"] button').trigger('click')
    expect(wrapper.find('[data-testid="search-modal"]').exists()).toBe(false)
  })

  it('creates a wiki page and navigates to it', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="create-wiki"]').trigger('click')
    await wrapper.get('#wiki-page-name').setValue('The Stone Amphitheater')
    await wrapper.get('#wiki-page-type').setValue('location')
    await wrapper.findAll('button').find((candidate) => candidate.text().trim() === 'Create Page')!.trigger('click')
    await flushPromises()

    expect(h.createWikiPage).toHaveBeenCalledWith({
      book_id: 'book-1', page_name: 'The Stone Amphitheater', page_type: 'location',
      content: '', summary: '', created_by_ai: false,
    })
    expect(h.push).toHaveBeenCalledWith('/books/book-1/wiki/wiki-new')
  })

  it('rejects a duplicate wiki page name without creating another page', async () => {
    h.getWikiPage.mockResolvedValueOnce({ id: 'wiki-existing' })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="create-wiki"]').trigger('click')
    await wrapper.get('#wiki-page-name').setValue('Heliconia')
    await wrapper.findAll('button').find((candidate) => candidate.text().trim() === 'Create Page')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('A wiki page named "Heliconia" already exists.')
    expect(h.createWikiPage).not.toHaveBeenCalled()
  })

  it('groups wiki pages with pinned entries first and rolls back failed pinning', async () => {
    h.wikiPages = [
      { id: 'wiki-b', page_name: 'Bardwall', page_type: 'location', aliases: '[]', tags: '[]', is_pinned: 0, created_at: '2026-01-01', updated_at: '2026-01-01', content: '' },
      { id: 'wiki-a', page_name: 'Amphitheater', page_type: 'location', aliases: '[]', tags: '[]', is_pinned: 1, created_at: '2026-01-01', updated_at: '2026-01-01', content: '' },
    ]
    h.updateWikiPage.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountView()
    await flushPromises()
    const desktop = wrapper.getComponent(DesktopStub)
    const locations = desktop.props('wikiPagesByType').location
    expect(locations.map((page: { page_name: string }) => page.page_name)).toEqual(['Amphitheater', 'Bardwall'])

    await desktop.props('toggleWikiPagePinned')(locations[1])
    expect(h.updateWikiPage).toHaveBeenCalledWith('wiki-b', { is_pinned: true })
    expect(locations[1].is_pinned).toBe(false)
  })

  it('persists sidebar chapter order after drag completion', async () => {
    const wrapper = mountView()
    await flushPromises()
    const desktop = wrapper.getComponent(DesktopStub)
    const lists = desktop.props('sidebarPartLists') as Record<string, Array<{ id: string }>>
    lists['part-1'] = [{ ...lists['part-1'][0], id: 'chapter-1' }]
    await desktop.props('onSidebarDragEnd')()
    await flushPromises()

    expect(h.updateChapterOrders).toHaveBeenCalledWith(
      'book-1', ['chapter-2', 'chapter-1'],
      { null: [], 'part-2': ['chapter-2'], 'part-1': ['chapter-1'] },
      ['part-2', 'part-1'],
    )
  })
})
