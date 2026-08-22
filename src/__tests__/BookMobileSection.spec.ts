// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import BookMobileSection from '@/components/book/BookMobileSection.vue'

const wrappers: VueWrapper[] = []

const RouterLinkStub = {
  props: ['to'],
  template: '<a :data-to="typeof to === \'string\' ? to : JSON.stringify(to)"><slot /></a>',
}

function chapter(id: string) {
  return { id, title: `Chapter ${id}`, summary: 'A summary', word_count: 250 }
}

function props(overrides: Record<string, unknown> = {}) {
  return {
    book: { id: 'book-1', title: 'A Test Book' },
    bookId: 'book-1',
    chaptersByPart: {
      parts: [{ id: 'part-1', name: 'Part One', chapters: [chapter('one')], wordCount: 250 }],
      uncategorized: [chapter('loose')],
    },
    sortedChapters: [chapter('one'), chapter('loose')],
    chapterCount: 2,
    totalWordCount: 500,
    expandedSummaries: new Set<string>(),
    formatWordCount: vi.fn((count: number) => String(count)),
    wordCountForChapters: vi.fn(() => 250),
    getSummaryPreview: vi.fn((summary: string) => summary),
    toggleSummary: vi.fn(),
    createNewChapter: vi.fn(),
    goToOrganizeChapters: vi.fn(),
    createNewChapterInPart: vi.fn(),
    editChapter: vi.fn(),
    startEditingBookTitle: vi.fn(),
    saveBookTitle: vi.fn(),
    cancelEditingBookTitle: vi.fn(),
    updateEditingBookTitle: vi.fn(),
    getTypeIcon: vi.fn(() => ({ template: '<i />' })),
    getTypeColor: vi.fn(() => 'type-color'),
    toggleWikiPagePinned: vi.fn(),
    selectBookCover: vi.fn(),
    ...overrides,
  }
}

function mountSection(overrides: Record<string, unknown> = {}) {
  const wrapper = mount(BookMobileSection, {
    props: props(overrides),
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        Teleport: true,
        Transition: false,
        BookMobileChapterCard: { template: '<article data-testid="chapter-card" />' },
        BookActivityHeatmap: { template: '<div data-testid="heatmap" />' },
        IllustrationDetail: {
          emits: ['save-notes', 'save-tags', 'download'],
          template: '<button data-testid="image-detail" @click="$emit(\'save-notes\', \'note\'); $emit(\'save-tags\', [\'wiki-1\']); $emit(\'download\', \'image-1\')" />',
        },
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

describe('BookMobileSection', () => {
  it('renders chapter controls, expands parts, and drops removed expansion state', async () => {
    const input = props()
    const wrapper = mountSection(input)

    await wrapper.get('button[title="Rename book"]').trigger('click')
    const actionButtons = wrapper.findAll('button')
    await actionButtons.find(button => button.text().includes('New Chapter'))!.trigger('click')
    await actionButtons.find(button => button.text().includes('Organize Chapters'))!.trigger('click')
    await actionButtons.find(button => button.text().includes('Part One'))!.trigger('click')
    expect(wrapper.findAll('[data-testid="chapter-card"]')).toHaveLength(2)
    for (const button of actionButtons.filter(button => button.text().includes('Add Chapter'))) {
      await button.trigger('click')
    }

    expect(input.startEditingBookTitle).toHaveBeenCalled()
    expect(input.createNewChapter).toHaveBeenCalled()
    expect(input.goToOrganizeChapters).toHaveBeenCalled()
    expect(input.createNewChapterInPart).toHaveBeenCalledWith('part-1')

    await wrapper.setProps({ chaptersByPart: {
      parts: [{ ...input.chaptersByPart.parts[0], name: 'Part One Revised' }],
      uncategorized: input.chaptersByPart.uncategorized,
    } })
    await wrapper.findAll('button').find(button => button.text().includes('Part One Revised'))!.trigger('click')
    await wrapper.setProps({ chaptersByPart: { parts: [], uncategorized: [chapter('loose')] } })
    await wrapper.setProps({ chaptersByPart: input.chaptersByPart })
    expect(wrapper.findAll('[data-testid="chapter-card"]')).toHaveLength(1)
  })

  it('edits the title and opens and closes the cover lightbox', async () => {
    const input = props({
      isEditingBookTitle: true,
      editingBookTitle: 'Draft title',
      canSelectImages: true,
      coverImageSrc: 'data:image/png;base64,AQ==',
      deleteBookCover: vi.fn(),
    })
    const wrapper = mountSection(input)
    const titleInput = wrapper.get('input[placeholder="Book title"]')

    await titleInput.setValue('Final title')
    await titleInput.trigger('keyup', { key: 'Enter' })
    await titleInput.trigger('keyup', { key: 'Escape' })
    await wrapper.findAll('button').find(button => button.text() === 'Save')!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === 'Cancel')!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === 'Replace')!.trigger('click')
    await wrapper.findAll('button').find(button => button.attributes('class')?.includes('text-red-600'))!.trigger('click')
    await wrapper.get('img[alt="Book cover"]').trigger('click')
    expect(wrapper.find('.fixed.inset-0.z-50').exists()).toBe(true)
    await wrapper.get('button[title="Close"]').trigger('click')

    expect(input.updateEditingBookTitle).toHaveBeenCalledWith('Final title')
    expect(input.saveBookTitle).toHaveBeenCalled()
    expect(input.cancelEditingBookTitle).toHaveBeenCalled()
    expect(input.selectBookCover).toHaveBeenCalled()
    expect(input.deleteBookCover).toHaveBeenCalled()
  })

  it('filters wiki types and delegates wiki actions', async () => {
    const page = {
      id: 'wiki-1', page_name: 'Ada', summary: '', content_length: 0,
      updated_at: '2026-08-22T00:00:00.000Z', is_major: true, is_pinned: false,
      tags: ['one', 'two', 'three', 'four'],
    }
    const input = props({
      currentTab: 'wiki',
      wikiPagesByType: { character: [page], location: [] },
      wikiPageThumbnails: { 'wiki-1': 'thumb.png' },
      openCreateWikiModal: vi.fn(),
    })
    const wrapper = mountSection(input)

    await wrapper.findAll('button').find(button => button.text().includes('All Types'))!.trigger('click')
    await wrapper.get('.fixed.inset-0.z-0').trigger('click')
    await wrapper.findAll('button').find(button => button.text().includes('All Types'))!.trigger('click')
    const location = wrapper.findAll('button').find(button => button.text().includes('Locations'))!
    await location.trigger('click')
    expect(wrapper.text()).toContain('No location pages yet')
    await wrapper.findAll('button').find(button => button.text().includes('New Wiki Page'))!.trigger('click')

    await wrapper.findAll('button').find(button => button.text().includes('Locations'))!.trigger('click')
    await wrapper.findAll('button').find(button => button.text().includes('Characters'))!.trigger('click')
    await wrapper.get('button[aria-label="Pin wiki page"]').trigger('click')
    expect(input.openCreateWikiModal).toHaveBeenCalled()
    expect(input.toggleWikiPagePinned).toHaveBeenCalledWith(page)
  })

  it('offers creation actions for empty chapter and wiki collections', async () => {
    const createChapter = vi.fn()
    const emptyChapters = mountSection({
      chaptersByPart: { parts: [], uncategorized: [] }, sortedChapters: [], createNewChapter: createChapter,
    })
    await emptyChapters.findAll('button').find(button => button.text().includes('Add First Chapter'))!.trigger('click')
    expect(createChapter).toHaveBeenCalled()

    const createWiki = vi.fn()
    const emptyWiki = mountSection({ currentTab: 'wiki', wikiPagesByType: {}, openCreateWikiModal: createWiki })
    await emptyWiki.findAll('button').find(button => button.text().includes('Create Wiki Page'))!.trigger('click')
    expect(createWiki).toHaveBeenCalled()
  })

  it('renders image states and forwards detail actions when callbacks exist', async () => {
    const saveNotes = vi.fn()
    const saveTags = vi.fn()
    const download = vi.fn()
    const wrapper = mountSection({
      currentTab: 'images',
      selectedImageId: 'image-1',
      selectedImageSrc: 'image.png',
      selectedImage: { id: 'image-1', file_name: 'image.png' },
      saveSelectedImageNotes: saveNotes,
      saveSelectedImageTags: saveTags,
      downloadSelectedImage: download,
    })

    await wrapper.get('[data-testid="image-detail"]').trigger('click')
    expect(saveNotes).toHaveBeenCalledWith('note')
    expect(saveTags).toHaveBeenCalledWith(['wiki-1'])
    expect(download).toHaveBeenCalledWith('image-1')

    await wrapper.setProps({ selectedImageId: null, selectedImageSrc: null, bookImages: [
      { id: 'image-1', file_name: 'cover.png' }, { id: 'image-2', file_name: null },
    ], bookImageSources: { 'image-1': 'cover.png' } })
    expect(wrapper.text()).toContain('cover.png')
    expect(wrapper.text()).toContain('Untitled')
  })
})
