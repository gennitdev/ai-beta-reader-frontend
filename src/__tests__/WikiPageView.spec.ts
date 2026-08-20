// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { CHAPTER_WIKI_LINKS_CHANGED_EVENT } from '@/utils/chapterWikiLinkEvents'

const h = vi.hoisted(() => ({
  route: {
    params: { bookId: 'book-1', wikiPageId: 'wiki-1' } as Record<string, string>,
    query: {} as Record<string, string>,
    meta: {} as Record<string, unknown>,
  },
  push: vi.fn(),
  back: vi.fn(),
  books: [] as Array<Record<string, unknown>>,
  chapters: [] as Array<Record<string, unknown>>,
  page: null as Record<string, unknown> | null,
  links: [] as Array<Record<string, unknown>>,
  loadBooks: vi.fn(async () => {}),
  loadChapters: vi.fn(async () => {}),
  getWikiPageById: vi.fn(),
  updateWikiPage: vi.fn(async () => {}),
  deleteWikiPage: vi.fn(async () => {}),
  getWikiPageChapterLinks: vi.fn(),
  setWikiPageChapterLinks: vi.fn(async () => {}),
  refreshWikiImages: vi.fn(async () => {}),
}))

vi.mock('vue-router', () => ({
  useRoute: () => h.route,
  useRouter: () => ({ push: h.push, back: h.back }),
}))

vi.mock('@/composables/useDatabase', async () => {
  const { ref } = await import('vue')
  return {
    useDatabase: () => ({
      books: ref(h.books),
      chapters: ref(h.chapters),
      loadBooks: h.loadBooks,
      loadChapters: h.loadChapters,
      getWikiPageById: h.getWikiPageById,
      updateWikiPage: h.updateWikiPage,
      deleteWikiPage: h.deleteWikiPage,
      getWikiPageChapterLinks: h.getWikiPageChapterLinks,
      setWikiPageChapterLinks: h.setWikiPageChapterLinks,
    }),
  }
})

vi.mock('@/composables/useWikiImages', async () => {
  const { ref, computed } = await import('vue')
  return {
    useWikiImages: () => ({
      wikiImages: ref([]),
      wikiImagesLoading: ref(false),
      wikiImageSources: ref({}),
      wikiImageTags: ref({}),
      bookWikiPages: ref([]),
      wikiImageError: ref(null),
      wikiCoverImageId: ref(null),
      settingCoverId: ref(null),
      showImageLightbox: ref(false),
      activeImageSource: ref(null),
      activeImage: ref(null),
      activeImageTags: ref([]),
      activeImageLabel: computed(() => ''),
      heroImageSrc: computed(() => null),
      savingImageNotes: ref(false),
      savingImageTags: ref(false),
      refreshWikiImages: h.refreshWikiImages,
      openImageModal: vi.fn(), closeImageModal: vi.fn(), handleSetAsCover: vi.fn(),
      handleDownloadImage: vi.fn(), handleSaveActiveImageNotes: vi.fn(),
      handleSaveActiveImageTags: vi.fn(), openHeroLightbox: vi.fn(),
    }),
  }
})

vi.mock('@/composables/useReadingFontSize', async () => {
  const { ref } = await import('vue')
  return { useReadingFontSize: () => ({ fontSize: ref('medium'), fontFamily: ref('system') }) }
})

import WikiPageView from '@/views/WikiPageView.vue'

const AutocompleteStub = {
  props: ['selectedIds'],
  emits: ['update:selectedIds'],
  template: '<button data-testid="select-chapters" @click="$emit(\'update:selectedIds\', [\'chapter-2\'])">Choose chapter two</button>',
}

const wrappers: VueWrapper[] = []

function wikiPage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wiki-1', book_id: 'book-1', page_name: 'Heliconia', page_type: 'character',
    content: 'Goddess of lost causes.', summary: 'She takes persistence seriously.',
    aliases: '["The Unreasonable Goddess"]', tags: '["deity"]', is_major: 1, is_pinned: 0,
    created_by_ai: 0, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function mountView() {
  const wrapper = mount(WikiPageView, {
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        MarkdownRenderer: { props: ['text'], template: '<div data-testid="markdown">{{ text }}</div>' },
        FontSizeControl: true,
        WikiPageHeroSection: true,
        WikiPageIllustrationsSection: true,
        IllustrationDetail: true,
        AutocompleteMultiSelect: AutocompleteStub,
        Modal: { template: '<div><slot /></div>' },
        ArrowLeftIcon: true, PencilIcon: true, ClockIcon: true, UserIcon: true,
        MapPinIcon: true, LightBulbIcon: true, BookOpenIcon: true, TrashIcon: true, BookmarkIcon: true,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

function button(wrapper: VueWrapper, label: string) {
  const match = wrapper.findAll('button').find((candidate) => candidate.text().trim() === label)
  if (!match) throw new Error(`Button not found: ${label}`)
  return match
}

beforeEach(() => {
  vi.clearAllMocks()
  h.route.params = { bookId: 'book-1', wikiPageId: 'wiki-1' }
  h.route.query = {}
  h.route.meta = {}
  h.books = [{ id: 'book-1', title: 'Ghost Stories', chapter_order: '["chapter-1","chapter-2"]' }]
  h.chapters = [
    { id: 'chapter-1', title: 'First Chapter' },
    { id: 'chapter-2', title: 'Second Chapter' },
  ]
  h.page = wikiPage()
  h.links = [{
    wiki_page_id: 'wiki-1', chapter_id: 'chapter-1', chapter_title: 'First Chapter', link_source: 'manual',
  }]
  h.getWikiPageById.mockImplementation(async () => h.page)
  h.getWikiPageChapterLinks.mockImplementation(async () => h.links)
  vi.stubGlobal('alert', vi.fn())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('WikiPageView', () => {
  it('loads the page, alternate names, tags, and linked chapters', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(h.loadBooks).toHaveBeenCalled()
    expect(h.loadChapters).toHaveBeenCalledWith('book-1')
    expect(h.refreshWikiImages).toHaveBeenCalled()
    expect(wrapper.text()).toContain('Heliconia')
    expect(wrapper.get('[data-testid="markdown"]').text()).toBe('Goddess of lost causes.')
    expect(wrapper.text()).toContain('The Unreasonable Goddess')
    expect(wrapper.text()).toContain('deity')
    expect(wrapper.text()).toContain('First Chapter')
  })

  it('edits and saves page content and its name', async () => {
    const wrapper = mountView()
    await flushPromises()

    await button(wrapper, 'Edit').trigger('click')
    await wrapper.get('textarea[placeholder="Enter wiki content in Markdown format..."]').setValue('Patron of impossible books.')
    await button(wrapper, 'Save Changes').trigger('click')
    await flushPromises()
    expect(h.updateWikiPage).toHaveBeenCalledWith('wiki-1', { content: 'Patron of impossible books.' })
    expect(wrapper.get('[data-testid="markdown"]').text()).toBe('Patron of impossible books.')

    await wrapper.get('button[title="Rename page"]').trigger('click')
    await wrapper.get('input[placeholder="Page name"]').setValue('Heliconia the Patient')
    await button(wrapper, 'Save').trigger('click')
    await flushPromises()
    expect(h.updateWikiPage).toHaveBeenCalledWith('wiki-1', { page_name: 'Heliconia the Patient' })
    expect(wrapper.text()).toContain('Heliconia the Patient')
  })

  it('normalizes alternate names and rejects the canonical name as an alias', async () => {
    const wrapper = mountView()
    await flushPromises()

    await button(wrapper, 'Edit names').trigger('click')
    const input = wrapper.get('input[placeholder="Add an alternate name"]')
    await input.setValue('Lady of Lost Causes')
    await button(wrapper, 'Add').trigger('click')
    await input.setValue('lady of lost causes')
    await button(wrapper, 'Add').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('must be unique')

    await input.setValue('Heliconia')
    await button(wrapper, 'Add').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('different from the page name')
    await button(wrapper, 'Save names').trigger('click')
    await flushPromises()

    expect(h.updateWikiPage).toHaveBeenCalledWith('wiki-1', {
      aliases: ['The Unreasonable Goddess', 'Lady of Lost Causes'],
    })
  })

  it('keeps alias editing open and reports a persistence error', async () => {
    h.updateWikiPage.mockRejectedValueOnce(new Error('That name belongs to another page.'))
    const wrapper = mountView()
    await flushPromises()

    await button(wrapper, 'Edit names').trigger('click')
    await button(wrapper, 'Save names').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('That name belongs to another page.')
    expect(wrapper.find('input[placeholder="Add an alternate name"]').exists()).toBe(true)
  })

  it('deduplicates tags and saves linked chapters', async () => {
    const wrapper = mountView()
    await flushPromises()

    await button(wrapper, 'Edit tags').trigger('click')
    const tagInput = wrapper.get('input[placeholder="Add a tag"]')
    await tagInput.setValue('Persistence')
    await button(wrapper, 'Add').trigger('click')
    await tagInput.setValue('persistence')
    await button(wrapper, 'Add').trigger('click')
    await button(wrapper, 'Save tags').trigger('click')
    await flushPromises()
    expect(h.updateWikiPage).toHaveBeenCalledWith('wiki-1', { tags: '["deity","Persistence"]' })

    await button(wrapper, 'Edit links').trigger('click')
    await wrapper.get('[data-testid="select-chapters"]').trigger('click')
    h.links = [{ wiki_page_id: 'wiki-1', chapter_id: 'chapter-2', chapter_title: 'Second Chapter', link_source: 'manual' }]
    await button(wrapper, 'Save links').trigger('click')
    await flushPromises()
    expect(h.setWikiPageChapterLinks).toHaveBeenCalledWith('wiki-1', ['chapter-2'], 'manual')
    expect(wrapper.text()).toContain('Second Chapter')
  })

  it('optimistically pins the page and rolls back when persistence fails', async () => {
    h.updateWikiPage.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountView()
    await flushPromises()

    await button(wrapper, 'Pin').trigger('click')
    await flushPromises()

    expect(h.updateWikiPage).toHaveBeenCalledWith('wiki-1', { is_pinned: true })
    expect(wrapper.emitted('wiki-page-pin-changed')).toHaveLength(2)
    expect(wrapper.emitted('wiki-page-pin-changed')?.[0]?.[0]).toMatchObject({ isPinned: true })
    expect(wrapper.emitted('wiki-page-pin-changed')?.[1]?.[0]).toMatchObject({ isPinned: false })
    expect(alert).toHaveBeenCalledWith('Failed to update pin')
  })

  it('returns to an originating mobile chapter and deletes to the wiki index', async () => {
    h.route.query = { fromChapterId: 'chapter-1' }
    h.route.meta = { mobile: true }
    const wrapper = mountView()
    await flushPromises()

    await button(wrapper, 'Back to chapter').trigger('click')
    expect(h.push).toHaveBeenCalledWith('/m/books/book-1/chapters/chapter-1')

    await button(wrapper, 'Delete').trigger('click')
    expect(wrapper.text()).toContain('Delete Wiki Page')
    const modalDelete = wrapper.findAll('button').filter((candidate) => candidate.text().trim() === 'Delete').at(-1)!
    await modalDelete.trigger('click')
    await flushPromises()

    expect(h.deleteWikiPage).toHaveBeenCalledWith('wiki-1')
    expect(h.push).toHaveBeenCalledWith('/books/book-1?tab=wiki')
  })

  it('refreshes clean content after an external link event without overwriting a draft', async () => {
    const wrapper = mountView()
    await flushPromises()

    h.page = wikiPage({ content: 'Updated elsewhere.' })
    window.dispatchEvent(new CustomEvent(CHAPTER_WIKI_LINKS_CHANGED_EVENT, {
      detail: { chapterIds: [], wikiPageIds: ['wiki-1'] },
    }))
    await flushPromises()
    expect(wrapper.get('[data-testid="markdown"]').text()).toBe('Updated elsewhere.')

    await button(wrapper, 'Edit').trigger('click')
    const textarea = wrapper.get('textarea[placeholder="Enter wiki content in Markdown format..."]')
    await textarea.setValue('My unsaved version.')
    h.page = wikiPage({ content: 'A second outside edit.' })
    window.dispatchEvent(new CustomEvent(CHAPTER_WIKI_LINKS_CHANGED_EVENT, {
      detail: { chapterIds: [], wikiPageIds: ['wiki-1'] },
    }))
    await flushPromises()
    expect((textarea.element as HTMLTextAreaElement).value).toBe('My unsaved version.')
  })

  it('redirects safely when the wiki page is missing', async () => {
    h.page = null
    mountView()
    await flushPromises()
    expect(h.push).toHaveBeenCalledWith('/books/book-1?tab=wiki')
  })
})
