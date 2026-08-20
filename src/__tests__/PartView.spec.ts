// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  route: { params: { bookId: 'book-1', partId: 'part-1' }, meta: {} as Record<string, unknown> },
  routeProxy: null as unknown as { params: Record<string, string>; meta: Record<string, unknown> },
  push: vi.fn(),
  books: [] as Array<Record<string, unknown>>,
  chapters: [] as Array<Record<string, unknown>>,
  parts: [] as Array<Record<string, unknown>>,
  entries: [] as Array<Record<string, unknown>>,
  summaries: [] as Array<Record<string, unknown>>,
  summary: { summary: '', characters: [] as string[], beats: [] as string[], updatedAt: null as string | null },
  canSelectImages: true,
  canStoreImagesRef: null as unknown as { value: boolean },
  entriesRef: null as unknown as { value: Array<Record<string, unknown>> },
  summariesRef: null as unknown as { value: Array<Record<string, unknown>> },
  summaryRef: null as unknown as { value: Record<string, unknown> },
  editedSummaryRef: null as unknown as { value: string },
  cover: null as Record<string, unknown> | null,
  pickedCover: null as Record<string, unknown> | null,
  loadBooks: vi.fn(async () => {}),
  loadChapters: vi.fn(async () => {}),
  getParts: vi.fn(async () => [] as Array<Record<string, unknown>>),
  savePartSummary: vi.fn(async () => {}),
  getImageSource: vi.fn(async () => 'blob:cover'),
  fetchPartCover: vi.fn(async () => null as Record<string, unknown> | null),
  pickPartCover: vi.fn(async () => null as Record<string, unknown> | null),
  fetchChapterThumbnails: vi.fn(async () => ({} as Record<string, string>)),
  deleteImage: vi.fn(async () => {}),
  setPartCoverImageId: vi.fn(async () => {}),
  refreshPartImages: vi.fn(async () => {}),
  openImageModal: vi.fn(),
  openImageAsset: vi.fn(),
  loadPartSummaryData: vi.fn(async () => {}),
  hydrateChapterEntries: vi.fn(async () => {}),
  loadApiKey: vi.fn(async () => 'sk-test' as string | null),
  generateSummary: vi.fn(async () => ({
    summary: 'Generated overview', characters: ['Alice'], beats: ['A turning point'],
  })),
}))

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  h.routeProxy = reactive(h.route)
  return { useRoute: () => h.routeProxy, useRouter: () => ({ push: h.push }) }
})

vi.mock('@/composables/useDatabase', async () => {
  const { computed } = await import('vue')
  return {
    useDatabase: () => ({
      books: computed(() => h.books),
      chapters: computed(() => h.chapters),
      loadBooks: h.loadBooks,
      loadChapters: h.loadChapters,
      getParts: h.getParts,
      getPartSummary: vi.fn(),
      savePartSummary: h.savePartSummary,
      getSummary: vi.fn(),
    }),
  }
})

vi.mock('@/composables/useImageLibrary', async () => {
  const { computed, ref } = await import('vue')
  return {
    useImageLibrary: () => {
      h.canStoreImagesRef = ref(true)
      return {
        canSelectImages: computed(() => h.canSelectImages),
        canStoreImages: h.canStoreImagesRef,
        getImageSource: h.getImageSource,
        fetchPartCover: h.fetchPartCover,
        pickPartCover: h.pickPartCover,
        fetchChapterThumbnails: h.fetchChapterThumbnails,
        deleteImage: h.deleteImage,
        setPartCoverImageId: h.setPartCoverImageId,
      }
    },
  }
})

vi.mock('@/composables/usePartImages', async () => {
  const { ref } = await import('vue')
  return {
    usePartImages: () => ({
      partImages: ref([]), partImagesLoading: ref(false), partImageSources: ref({}),
      partImageTags: ref({}), bookWikiPages: ref([]), partImageError: ref(null),
      showImageLightbox: ref(false), activeImage: ref(null), activeImageSource: ref(null),
      activeImageTags: ref([]), activeImageLabel: ref(''), savingImageNotes: ref(false),
      savingImageTags: ref(false), refreshPartImages: h.refreshPartImages,
      openImageModal: h.openImageModal, openImageAsset: h.openImageAsset,
      closeImageModal: vi.fn(), handleSaveActiveImageNotes: vi.fn(),
      handleSaveActiveImageTags: vi.fn(), handleDownloadImage: vi.fn(),
    }),
  }
})

vi.mock('@/composables/usePartSummaryContext', async () => {
  const { computed, ref } = await import('vue')
  return {
    usePartSummaryContext: () => {
      h.entriesRef = ref([...h.entries])
      h.summariesRef = ref([...h.summaries])
      h.summaryRef = ref({ ...h.summary })
      h.editedSummaryRef = ref(h.summary.summary)
      const summarized = computed(() => h.entriesRef.value.filter((entry) => entry.summary).length)
      return {
        chapterEntries: h.entriesRef,
        partSummary: h.summaryRef,
        editedSummary: h.editedSummaryRef,
        partNumber: ref(2),
        totalWordCount: computed(() => h.entriesRef.value.reduce(
          (total, entry) => total + Number(entry.wordCount ?? 0), 0,
        )),
        summarizedChapterCount: summarized,
        summaryCoverage: computed(() => `${summarized.value}/${h.entriesRef.value.length}`),
        availableChapterSummaries: h.summariesRef,
        hasPartSummary: computed(() => Boolean((h.summaryRef.value.summary as string).trim())),
        chapterTitleMap: computed(() => new Map(h.entriesRef.value.map((entry) => [entry.id, entry.title]))),
        loadPartSummaryData: h.loadPartSummaryData,
        hydrateChapterEntries: h.hydrateChapterEntries,
      }
    },
  }
})

vi.mock('@/lib/apiKeyStorage', () => ({ loadOpenAIApiKey: h.loadApiKey }))
vi.mock('@/lib/openai', () => ({ generatePartSummary: h.generateSummary }))

import PartView from '@/views/PartView.vue'

const wrappers: VueWrapper[] = []
const cover = {
  id: 'cover-1', book_id: 'book-1', chapter_id: null, asset_type: 'part_cover',
  file_name: 'cover.png', file_path: 'covers/cover.png', mime_type: 'image/png',
  image_data: null, notes: '', created_at: '', updated_at: '',
}

function button(wrapper: VueWrapper, label: string) {
  const found = wrapper.findAll('button').find((candidate) => candidate.text().trim().includes(label))
  if (!found) throw new Error(`Button not found: ${label}`)
  return found
}

function mountView() {
  const wrapper = shallowMount(PartView, {
    global: {
      stubs: {
        teleport: true,
        RouterLink: { template: '<a><slot /></a>' },
        MarkdownRenderer: { props: ['text'], template: '<div data-testid="summary">{{ text }}</div>' },
        CoverHeroImage: false,
        Modal: { template: '<div><slot /></div>' },
        IllustrationDetail: true,
        ArrowLeftIcon: true, ArrowDownTrayIcon: true, SparklesIcon: true,
        PencilIcon: true, PlusIcon: true, CheckCircleIcon: true, ClockIcon: true, TrashIcon: true,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  h.routeProxy.params = { bookId: 'book-1', partId: 'part-1' }
  h.routeProxy.meta = {}
  h.books = [{ id: 'book-1', title: 'Ghost Stories' }]
  h.parts = [{ id: 'part-1', book_id: 'book-1', name: 'The Crossing', cover_image_id: null }]
  h.entries = [{
    id: 'chapter-1', title: 'Arrival', position: 1, wordCount: 1200,
    summary: 'A summary that helps the model.', characters: ['Alice'],
  }]
  h.summaries = [{ chapterTitle: 'Arrival', summary: 'A summary' }]
  h.summary = {
    summary: 'Existing overview', characters: ['Alice'], beats: ['Arrival'],
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  h.canSelectImages = true
  h.cover = null
  h.pickedCover = null
  h.getParts.mockImplementation(async () => h.parts)
  h.fetchPartCover.mockImplementation(async () => h.cover)
  h.pickPartCover.mockImplementation(async () => h.pickedCover)
  h.hydrateChapterEntries.mockImplementation(async () => {
    h.entriesRef.value = [...h.entries]
    h.summariesRef.value = [...h.summaries]
  })
  h.loadPartSummaryData.mockImplementation(async () => {
    h.summaryRef.value = { ...h.summary }
    h.editedSummaryRef.value = h.summary.summary
  })
  h.loadApiKey.mockResolvedValue('sk-test')
  h.generateSummary.mockResolvedValue({
    summary: 'Generated overview', characters: ['Alice'], beats: ['A turning point'],
  })
  vi.stubGlobal('alert', vi.fn())
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PartView', () => {
  it('loads the part, summary, cover, and chapter thumbnails', async () => {
    h.cover = cover
    h.fetchChapterThumbnails.mockResolvedValueOnce({ 'chapter-1': 'blob:chapter' })
    const wrapper = mountView()
    await flushPromises()

    expect(h.loadChapters).toHaveBeenCalledWith('book-1')
    expect(h.refreshPartImages).toHaveBeenCalled()
    expect(h.fetchPartCover).toHaveBeenCalledWith('part-1')
    expect(h.fetchChapterThumbnails).toHaveBeenCalledWith(['chapter-1'])
    expect(wrapper.text()).toContain('Part 2: The Crossing')
    expect(wrapper.text()).toContain('1/1')
    expect(wrapper.get('img[alt="Part cover"]').attributes('src')).toBe('blob:cover')
    expect(wrapper.get('img[alt="Arrival thumbnail"]').attributes('src')).toBe('blob:chapter')
  })

  it('shows missing and failed-load states', async () => {
    h.parts = []
    let wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Part not found.')

    wrapper.unmount()
    h.loadBooks.mockRejectedValueOnce(new Error('database locked'))
    wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Failed to load part details.')
  })

  it('preserves the page when cover and thumbnail reads fail', async () => {
    h.cover = cover
    h.getImageSource.mockRejectedValueOnce(new Error('missing blob'))
    h.fetchChapterThumbnails.mockRejectedValueOnce(new Error('storage unavailable'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('img[alt="Part cover"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Part 2: The Crossing')
    expect(console.warn).toHaveBeenCalledWith('Failed to load chapter thumbnails:', expect.any(Error))
  })

  it('adds a cover and reports later selection failures', async () => {
    h.pickedCover = cover
    const wrapper = mountView()
    await flushPromises()
    await button(wrapper, 'Add cover image').trigger('click')
    await flushPromises()
    expect(h.pickPartCover).toHaveBeenCalledWith('book-1', 'part-1')
    expect(wrapper.find('img[alt="Part cover"]').exists()).toBe(true)

    h.pickPartCover.mockRejectedValueOnce(new Error('picker unavailable'))
    await button(wrapper, 'Change cover').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('picker unavailable')
  })

  it('opens and downloads the active cover', async () => {
    h.cover = cover
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('img[alt="Part cover"]').trigger('click')
    expect(h.openImageAsset).toHaveBeenCalledWith(cover, 'blob:cover')

    await wrapper.get('button[title="Download cover"]').trigger('click')
    expect(click).toHaveBeenCalledOnce()
  })

  it('shows cover lookup failures and skips thumbnail work for an empty part', async () => {
    h.entries = []
    h.fetchPartCover.mockRejectedValueOnce(new Error('cover index unavailable'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('cover index unavailable')
    expect(wrapper.text()).toContain('No chapters are currently assigned to this part.')
    expect(h.fetchChapterThumbnails).not.toHaveBeenCalled()
  })

  it('deletes a cover only after confirmation and retains it on failure', async () => {
    h.cover = cover
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('button[title="Delete cover"]').trigger('click')
    await button(wrapper, 'Cancel').trigger('click')
    expect(wrapper.text()).not.toContain('Delete part cover?')

    await wrapper.get('button[title="Delete cover"]').trigger('click')
    await button(wrapper, 'Delete').trigger('click')
    await flushPromises()
    expect(h.deleteImage).toHaveBeenCalledWith(cover)
    expect(h.setPartCoverImageId).toHaveBeenCalledWith('part-1', null)
    expect(wrapper.find('img[alt="Part cover"]').exists()).toBe(false)

    wrapper.unmount()
    h.cover = cover
    h.deleteImage.mockRejectedValueOnce(new Error('disk read-only'))
    const failed = mountView()
    await flushPromises()
    await failed.get('button[title="Delete cover"]').trigger('click')
    await button(failed, 'Delete').trigger('click')
    await flushPromises()
    expect(failed.text()).toContain('disk read-only')
    expect(failed.find('img[alt="Part cover"]').exists()).toBe(true)
  })

  it('edits, validates, cancels, and recovers from failed summary saves', async () => {
    const wrapper = mountView()
    await flushPromises()
    await button(wrapper, 'Edit').trigger('click')
    await wrapper.get('textarea').setValue('  Revised overview  ')
    await button(wrapper, 'Save Summary').trigger('click')
    await flushPromises()
    expect(h.savePartSummary).toHaveBeenCalledWith({
      part_id: 'part-1', summary: 'Revised overview', characters: ['Alice'], beats: ['Arrival'],
      generated_by: 'user',
    })

    await button(wrapper, 'Edit').trigger('click')
    await wrapper.get('textarea').setValue('   ')
    await button(wrapper, 'Save Summary').trigger('click')
    expect(alert).toHaveBeenCalledWith('Part summary cannot be empty.')
    await wrapper.get('textarea').setValue('Unsaved')
    await button(wrapper, 'Cancel').trigger('click')
    expect(wrapper.find('textarea').exists()).toBe(false)

    await button(wrapper, 'Edit').trigger('click')
    await wrapper.get('textarea').setValue('Will fail')
    h.savePartSummary.mockRejectedValueOnce(new Error('write failed'))
    await button(wrapper, 'Save Summary').trigger('click')
    await flushPromises()
    expect(alert).toHaveBeenCalledWith('Failed to save part summary.')
    expect(wrapper.find('textarea').exists()).toBe(true)
  })

  it('guards generation when summaries or credentials are missing', async () => {
    h.summaries = []
    let wrapper = mountView()
    await flushPromises()
    await button(wrapper, 'Regenerate Summary').trigger('click')
    await flushPromises()
    expect(alert).toHaveBeenCalledWith(
      'Add chapter summaries within this part before generating a part summary.',
    )
    expect(h.generateSummary).not.toHaveBeenCalled()

    wrapper.unmount()
    h.summaries = [{ chapterTitle: 'Arrival', summary: 'A summary' }]
    h.loadApiKey.mockResolvedValueOnce(null)
    wrapper = mountView()
    await flushPromises()
    await button(wrapper, 'Regenerate Summary').trigger('click')
    await flushPromises()
    expect(alert).toHaveBeenCalledWith('Please add your OpenAI API key in Settings first.')
    expect(h.push).toHaveBeenCalledWith('/settings')
  })

  it('generates and persists a summary while surfacing AI failures', async () => {
    const wrapper = mountView()
    await flushPromises()
    await button(wrapper, 'Regenerate Summary').trigger('click')
    await flushPromises()
    expect(h.generateSummary).toHaveBeenCalledWith(
      'sk-test', 'Ghost Stories', 'The Crossing', 'part-1', h.summaries, 2,
    )
    expect(h.savePartSummary).toHaveBeenCalledWith({
      part_id: 'part-1', summary: 'Generated overview', characters: ['Alice'], beats: ['A turning point'],
      generated_by: 'ai',
    })

    h.generateSummary.mockRejectedValueOnce(new Error('rate limited'))
    await button(wrapper, 'Regenerate Summary').trigger('click')
    await flushPromises()
    expect(alert).toHaveBeenCalledWith('Failed to generate part summary: rate limited')
  })

  it('routes back, opens chapters on desktop/mobile, and creates chapters', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('button')[0].trigger('click')
    await wrapper.find('div.cursor-pointer').trigger('click')
    await button(wrapper, 'Add Chapter in Part').trigger('click')
    expect(h.push).toHaveBeenCalledWith('/books/book-1')
    expect(h.push).toHaveBeenCalledWith('/books/book-1/chapters/chapter-1')
    expect(h.push).toHaveBeenCalledWith({
      path: '/books/book-1/chapter-editor', query: { partId: 'part-1' },
    })

    h.routeProxy.meta.mobile = true
    await flushPromises()
    await wrapper.find('div.cursor-pointer').trigger('click')
    expect(h.push).toHaveBeenCalledWith('/m/books/book-1/chapters/chapter-1')
  })

  it('refreshes image state when storage capability changes', async () => {
    mountView()
    await flushPromises()
    h.refreshPartImages.mockClear()
    h.fetchPartCover.mockClear()
    h.canStoreImagesRef.value = false
    await flushPromises()
    expect(h.refreshPartImages).toHaveBeenCalledOnce()
    expect(h.fetchPartCover).toHaveBeenCalledWith('part-1')
  })

  it('reloads all part-bound data when the route changes', async () => {
    h.parts.push({ id: 'part-2', book_id: 'book-1', name: 'The Return', cover_image_id: null })
    mountView()
    await flushPromises()
    h.loadChapters.mockClear()
    h.fetchPartCover.mockClear()

    h.routeProxy.params = { bookId: 'book-1', partId: 'part-2' }
    await flushPromises()

    expect(h.loadChapters).toHaveBeenCalledWith('book-1')
    expect(h.fetchPartCover).toHaveBeenCalledWith('part-2')
  })
})
