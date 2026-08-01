// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { CHAPTER_WIKI_LINKS_CHANGED_EVENT } from '@/utils/chapterWikiLinkEvents'

const h = vi.hoisted(() => ({
  route: {
    params: { bookId: 'book-1', chapterId: 'chapter-1' } as Record<string, string>,
    meta: {} as Record<string, unknown>,
  },
  push: vi.fn(),
  books: [] as Array<Record<string, unknown>>,
  chapters: [] as Array<Record<string, unknown>>,
  parts: [] as Array<Record<string, unknown>>,
  revisions: [] as Array<Record<string, unknown>>,
  links: [] as Array<Record<string, unknown>>,
  wikiPages: [] as Array<Record<string, unknown>>,
  reviews: [] as Array<Record<string, unknown>>,
  loadBooks: vi.fn(async () => {}), loadChapters: vi.fn(async () => {}),
  getParts: vi.fn(), saveChapter: vi.fn(async () => null), getChapterRevisions: vi.fn(),
  deleteChapter: vi.fn(async () => {}), getSummary: vi.fn(), getPartSummary: vi.fn(async () => null),
  getWikiPages: vi.fn(), getChapterWikiLinks: vi.fn(), setChapterWikiLinks: vi.fn(async () => {}),
  getCustomProfiles: vi.fn(async () => []), getReviews: vi.fn(), deleteReview: vi.fn(async () => {}),
  getNotes: vi.fn(), refreshChapterImages: vi.fn(async () => {}),
  saveSummary: vi.fn(async () => true), saveNotes: vi.fn(async () => true),
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
      getParts: h.getParts, saveChapter: h.saveChapter, getChapterRevisions: h.getChapterRevisions,
      deleteChapter: h.deleteChapter, saveSummary: vi.fn(), getSummary: h.getSummary,
      getPartSummary: h.getPartSummary, createWikiPage: vi.fn(), updateWikiPage: vi.fn(),
      getWikiPage: vi.fn(), getWikiPages: h.getWikiPages, trackWikiUpdate: vi.fn(),
      addChapterWikiMention: vi.fn(), getChapterWikiLinks: h.getChapterWikiLinks,
      setChapterWikiLinks: h.setChapterWikiLinks, ensureChapterWikiLinks: vi.fn(),
      getCustomProfiles: h.getCustomProfiles, saveReview: vi.fn(), getReviews: h.getReviews,
      deleteReview: h.deleteReview, getNotes: h.getNotes, saveNotes: vi.fn(),
    }),
  }
})

vi.mock('@/composables/useChapterImages', async () => {
  const { ref, computed } = await import('vue')
  return {
    useChapterImages: () => ({
      chapterImageUploadAvailable: ref(false), chapterImages: ref([]), chapterImagesLoading: ref(false),
      addingChapterImages: ref(false), chapterImageSources: ref({}), chapterImageTags: ref({}),
      bookWikiPages: ref([]), chapterImageError: ref(null), showImageLightbox: ref(false),
      showDeleteIllustrationModal: ref(false), deletingIllustration: ref(false), chapterCoverImageId: ref(null),
      settingCoverId: ref(null), activeImageSource: ref(null), activeImage: ref(null), activeImageTags: ref([]),
      activeImageLabel: computed(() => ''), savingImageNotes: ref(false), savingImageTags: ref(false),
      heroImageSrc: computed(() => null), illustrationToDeleteName: computed(() => ''),
      refreshChapterImages: h.refreshChapterImages, handleAddIllustrations: vi.fn(),
      requestDeleteIllustration: vi.fn(), cancelDeleteIllustration: vi.fn(), handleDeleteIllustration: vi.fn(),
      openImageModal: vi.fn(), closeImageModal: vi.fn(), handleSetAsCover: vi.fn(),
      handleDownloadImage: vi.fn(), handleSaveActiveImageNotes: vi.fn(), handleSaveActiveImageTags: vi.fn(),
      openHeroLightbox: vi.fn(),
    }),
  }
})

vi.mock('@/composables/useChapterSummaryContext', () => ({
  useChapterSummaryContext: () => ({
    getPartNumber: () => 1, clearSummaryCaches: vi.fn(), primeChapterSummary: vi.fn(),
    invalidateChapterSummary: vi.fn(), buildPriorPartSummaries: vi.fn(async () => []),
    buildPriorChapterSummariesInPart: vi.fn(async () => []),
    buildPriorChapterSummariesInBook: vi.fn(async () => []),
  }),
}))

vi.mock('@/composables/useChapterMutationFlow', async () => {
  const { ref } = await import('vue')
  return {
    useChapterMutationFlow: () => ({
      generatingReview: ref(false), generatingSummary: ref(false), savingSummary: ref(false), savingNotes: ref(false),
      summaryProgress: ref(null), summaryError: ref(null), wikiUpdateResults: ref([]), showWikiUpdateResults: ref(false),
      saveSummary: h.saveSummary, saveNotes: h.saveNotes, generateSummary: vi.fn(), generateReview: vi.fn(),
    }),
  }
})

vi.mock('@/composables/useReadingFontSize', async () => {
  const { ref } = await import('vue')
  return { useReadingFontSize: () => ({ fontSize: ref('18') }) }
})

import ChapterView from '@/views/ChapterView.vue'

const HeaderStub = {
  props: ['chapterTitle', 'wordCount', 'isEditing', 'editedTitle'],
  emits: ['goBack', 'startEdit', 'cancelEdit', 'saveChapter', 'deleteChapter', 'update:editedTitle'],
  template: `<header><span data-testid="header-title">{{ chapterTitle }}</span><span data-testid="word-count">{{ wordCount }}</span>
    <input data-testid="edited-title" :value="editedTitle" @input="$emit('update:editedTitle', $event.target.value)" />
    <button data-testid="back" @click="$emit('goBack')">Back</button><button data-testid="edit" @click="$emit('startEdit')">Edit</button>
    <button data-testid="save-chapter" @click="$emit('saveChapter')">Save</button><button data-testid="delete-chapter" @click="$emit('deleteChapter')">Delete</button></header>`,
}

const ContentStub = {
  props: ['chapterText', 'editedText', 'truncatedChapterText'], emits: ['update:editedText'],
  template: '<section><span data-testid="chapter-text">{{ chapterText }}</span><textarea data-testid="edited-text" :value="editedText" @input="$emit(\'update:editedText\', $event.target.value)" /></section>',
}

const StatusStub = {
  emits: ['toggleSummaryPanel', 'toggleNotesPanel'],
  template: '<div><button data-testid="summary-toggle" @click="$emit(\'toggleSummaryPanel\')">Summary</button><button data-testid="notes-toggle" @click="$emit(\'toggleNotesPanel\')">Notes</button></div>',
}

const SummaryStub = {
  props: ['chapterSummary'], emits: ['startEdit', 'save', 'characterClick'],
  template: '<div data-testid="summary">{{ chapterSummary }}<button data-testid="save-summary" @click="$emit(\'startEdit\'); $emit(\'save\')">Save summary</button><button data-testid="character" @click="$emit(\'characterClick\', \'Alice Liddell\')">Alice</button></div>',
}

const NotesStub = {
  props: ['chapterNotes'], emits: ['startEdit', 'save'],
  template: '<div data-testid="notes">{{ chapterNotes }}<button data-testid="save-notes" @click="$emit(\'startEdit\'); $emit(\'save\')">Save notes</button></div>',
}

const LinksStub = {
  props: ['links', 'selectedIds'], emits: ['startEdit', 'update:selectedIds', 'save'],
  template: '<div data-testid="links"><span v-for="link in links" :key="link.wiki_page_id">{{ link.page_name }}</span><button data-testid="save-links" @click="$emit(\'startEdit\'); $emit(\'update:selectedIds\', [\'wiki-2\']); $emit(\'save\')">Save links</button></div>',
}

const ReviewsStub = {
  props: ['savedReviews'], emits: ['deleteReview'],
  template: '<div data-testid="reviews"><span v-for="review in savedReviews" :key="review.id">{{ review.review_text }}</span><button data-testid="delete-review" @click="$emit(\'deleteReview\', \'review-1\')">Delete review</button></div>',
}

const DeleteModalStub = {
  props: ['show', 'title'], emits: ['cancel', 'confirm'],
  template: '<div v-if="show" data-testid="delete-modal"><span>{{ title }}</span><button data-testid="cancel-delete" @click="$emit(\'cancel\')">Cancel</button><button data-testid="confirm-delete" @click="$emit(\'confirm\')">Confirm</button></div>',
}

const wrappers: VueWrapper[] = []

function chapter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chapter-1', book_id: 'book-1', title: 'The Gate', text: 'A ghost waits at the gate.',
    word_count: 6, part_id: 'part-1', created_at: '2026-01-01T00:00:00.000Z', ...overrides,
  }
}

function mountView() {
  const wrapper = mount(ChapterView, {
    global: {
      stubs: {
        ChapterHeaderBar: HeaderStub, ChapterHeroSection: true, ChapterStatusBar: StatusStub,
        ChapterSummaryPanel: SummaryStub, ChapterNotesPanel: NotesStub, ChapterContentSection: ContentStub,
        ChapterReviewsSection: ReviewsStub, ChapterWikiLinksCard: LinksStub, ChapterVersionHistory: true,
        ChapterIllustrationsSection: true, FontSizeControl: true, IllustrationDetail: true,
        ConfirmDeleteModal: DeleteModalStub, Modal: { template: '<div><slot /></div>' },
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  h.route.params = { bookId: 'book-1', chapterId: 'chapter-1' }
  h.route.meta = {}
  h.books.splice(0, h.books.length, { id: 'book-1', title: 'Ghost Stories', chapter_order: '["chapter-1"]' })
  h.chapters.splice(0, h.chapters.length, chapter())
  h.parts = [{ id: 'part-1', book_id: 'book-1', name: 'Part One', chapter_order: '["chapter-1"]' }]
  h.revisions = [{ id: 'revision-1', chapter_id: 'chapter-1', title: 'The Gate', text: 'Old', word_count: 1 }]
  h.links = [{ wiki_page_id: 'wiki-1', page_name: 'Heliconia', page_type: 'character', link_source: 'manual' }]
  h.wikiPages = [{ id: 'wiki-1', page_name: 'Alice Liddell', page_type: 'character', aliases: '["Alice"]' }]
  h.reviews = [{ id: 'review-1', review_text: 'Specific and vivid.', created_at: '2026-01-01', updated_at: '2026-01-01' }]
  h.getParts.mockImplementation(async () => h.parts)
  h.getChapterRevisions.mockImplementation(async () => h.revisions)
  h.getSummary.mockResolvedValue({ summary: 'A useful summary.', pov: 'Alice', characters: '["Alice"]', beats: '["Opening"]', spoilers_ok: false })
  h.getNotes.mockResolvedValue({ notes: 'Remember the iron gate.' })
  h.getWikiPages.mockImplementation(async () => h.wikiPages)
  h.getChapterWikiLinks.mockImplementation(async () => h.links)
  h.getReviews.mockImplementation(async () => h.reviews)
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.stubGlobal('alert', vi.fn())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ChapterView', () => {
  it('loads and renders the chapter authoring context', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(h.loadBooks).toHaveBeenCalled()
    expect(h.loadChapters).toHaveBeenCalledWith('book-1')
    expect(h.refreshChapterImages).toHaveBeenCalled()
    expect(wrapper.get('[data-testid="header-title"]').text()).toBe('The Gate')
    expect(wrapper.get('[data-testid="chapter-text"]').text()).toBe('A ghost waits at the gate.')
    expect(wrapper.text()).toContain('Specific and vivid.')
    expect(wrapper.text()).toContain('Heliconia')
  })

  it('saves edited title and text, recalculates words, and reloads revisions', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="edit"]').trigger('click')
    await wrapper.get('[data-testid="edited-title"]').setValue('The Open Gate')
    await wrapper.get('[data-testid="edited-text"]').setValue('The ghost finally steps through.')
    await wrapper.get('[data-testid="save-chapter"]').trigger('click')
    await flushPromises()

    expect(h.saveChapter).toHaveBeenCalledWith(expect.objectContaining({
      id: 'chapter-1', title: 'The Open Gate', text: 'The ghost finally steps through.', word_count: 5,
    }))
    expect(h.getChapterRevisions).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid="header-title"]').text()).toBe('The Open Gate')
  })

  it('opens summary and notes panels and delegates their saves', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('[data-testid="summary-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="summary"]').text()).toContain('A useful summary.')
    await wrapper.get('[data-testid="save-summary"]').trigger('click')
    await wrapper.get('[data-testid="notes-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="notes"]').text()).toContain('Remember the iron gate.')
    await wrapper.get('[data-testid="save-notes"]').trigger('click')

    expect(h.saveSummary).toHaveBeenCalled()
    expect(h.saveNotes).toHaveBeenCalled()
  })

  it('navigates from a summarized character to the canonical wiki page', async () => {
    h.route.meta = { mobile: true }
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="summary-toggle"]').trigger('click')
    await wrapper.get('[data-testid="character"]').trigger('click')

    expect(h.push).toHaveBeenCalledWith({
      path: '/m/books/book-1/wiki/wiki-1', query: { fromChapterId: 'chapter-1' },
    })
  })

  it('saves manually selected wiki links and refreshes their labels', async () => {
    const wrapper = mountView()
    await flushPromises()
    h.links = [{ wiki_page_id: 'wiki-2', page_name: 'Bardwall', page_type: 'location', link_source: 'manual' }]
    await wrapper.findAll('[data-testid="save-links"]')[0].trigger('click')
    await flushPromises()

    expect(h.setChapterWikiLinks).toHaveBeenCalledWith('chapter-1', ['wiki-2'], 'manual')
    expect(wrapper.text()).toContain('Bardwall')
  })

  it('confirms deletion and returns to the book', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="delete-chapter"]').trigger('click')
    expect(wrapper.get('[data-testid="delete-modal"]').text()).toContain('Delete chapter?')
    await wrapper.get('[data-testid="confirm-delete"]').trigger('click')
    await flushPromises()

    expect(h.deleteChapter).toHaveBeenCalledWith('chapter-1', 'book-1')
    expect(h.push).toHaveBeenCalledWith('/books/book-1')
  })

  it('deletes a saved review only after confirmation', async () => {
    h.getReviews.mockImplementation(async () => h.reviews)
    h.deleteReview.mockImplementationOnce(async () => { h.reviews = [] })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('[data-testid="delete-review"]').trigger('click')
    await flushPromises()

    expect(confirm).toHaveBeenCalled()
    expect(h.deleteReview).toHaveBeenCalledWith('review-1')
  })

  it('refreshes clean text after an external change but preserves an unsaved buffer', async () => {
    const wrapper = mountView()
    await flushPromises()
    h.chapters.splice(0, h.chapters.length, chapter({ text: 'Changed by find and replace.', word_count: 5 }))
    window.dispatchEvent(new CustomEvent(CHAPTER_WIKI_LINKS_CHANGED_EVENT, {
      detail: { chapterIds: ['chapter-1'], wikiPageIds: [] },
    }))
    await flushPromises()
    expect(wrapper.get('[data-testid="chapter-text"]').text()).toBe('Changed by find and replace.')

    await wrapper.get('[data-testid="edited-text"]').setValue('My unsaved prose.')
    h.chapters.splice(0, h.chapters.length, chapter({ text: 'A second external change.', word_count: 4 }))
    window.dispatchEvent(new CustomEvent(CHAPTER_WIKI_LINKS_CHANGED_EVENT, {
      detail: { chapterIds: ['chapter-1'], wikiPageIds: [] },
    }))
    await flushPromises()
    expect((wrapper.get('[data-testid="edited-text"]').element as HTMLTextAreaElement).value).toBe('My unsaved prose.')
    expect(wrapper.get('[data-testid="chapter-text"]').text()).toBe('A second external change.')
  })

  it('redirects safely when the chapter is missing or loading fails', async () => {
    h.chapters.splice(0)
    mountView()
    await flushPromises()
    expect(h.push).toHaveBeenCalledWith('/books/book-1')
  })
})
