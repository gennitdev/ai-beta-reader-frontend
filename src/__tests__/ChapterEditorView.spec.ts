// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { CHAPTER_WIKI_LINKS_CHANGED_EVENT } from '@/utils/chapterWikiLinkEvents'

const h = vi.hoisted(() => ({
  route: {
    params: { bookId: 'book-1' } as Record<string, string>,
    query: {} as Record<string, string>,
  },
  push: vi.fn(),
  books: { value: [] as Array<Record<string, unknown>> },
  chapters: { value: [] as Array<Record<string, unknown>> },
  parts: [] as Array<Record<string, unknown>>,
  loadBooks: vi.fn(async () => {}),
  loadChapters: vi.fn(async () => {}),
  saveChapter: vi.fn(async () => null),
  getParts: vi.fn(async () => [] as Array<Record<string, unknown>>),
  updateChapterOrders: vi.fn(async () => {}),
}))

vi.mock('vue-router', () => ({
  useRoute: () => h.route,
  useRouter: () => ({ push: h.push }),
}))

vi.mock('@/composables/useDatabase', () => ({
  useDatabase: () => ({
    books: h.books,
    chapters: h.chapters,
    loadBooks: h.loadBooks,
    loadChapters: h.loadChapters,
    saveChapter: h.saveChapter,
    getParts: h.getParts,
    updateChapterOrders: h.updateChapterOrders,
  }),
}))

import ChapterEditorView from '@/views/ChapterEditorView.vue'

const TextEditorStub = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<textarea data-testid="chapter-text" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}

const wrappers: VueWrapper[] = []

function mountView() {
  const wrapper = mount(ChapterEditorView, {
    global: {
      stubs: {
        TextEditor: TextEditorStub,
        ArrowLeftIcon: true,
        CheckIcon: true,
        XMarkIcon: true,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

function part(id: string, chapterOrder = '[]') {
  return {
    id,
    book_id: 'book-1',
    name: id === 'part-1' ? 'Part One' : 'Part Two',
    chapter_order: chapterOrder,
    cover_image_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.route.params = { bookId: 'book-1' }
  h.route.query = {}
  h.books.value = [{ id: 'book-1', title: 'Ghost Stories', chapter_order: '[]' }]
  h.chapters.value = []
  h.parts = [part('part-1'), part('part-2')]
  h.getParts.mockImplementation(async () => h.parts)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
})

describe('ChapterEditorView', () => {
  it('creates a chapter with a generated slug, word count, and selected part', async () => {
    h.route.query = { partId: 'part-1' }
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('#title').setValue('The Haunted Gate')
    await wrapper.get('[data-testid="chapter-text"]').setValue('One ghost waits beyond the gate.')
    await wrapper.findAll('button').find((button) => button.text().includes('Save Chapter'))!.trigger('click')
    await flushPromises()

    expect(h.saveChapter).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.stringMatching(/^the-haunted-gate-/),
      book_id: 'book-1',
      part_id: 'part-1',
      title: 'The Haunted Gate',
      text: 'One ghost waits beyond the gate.',
      word_count: 6,
    }))
    const savedId = h.saveChapter.mock.calls[0][0].id
    expect(h.push).toHaveBeenCalledWith(`/books/book-1/chapters/${savedId}`)
  })

  it('loads and saves an existing chapter without changing its id', async () => {
    h.route.params = { bookId: 'book-1', chapterId: 'chapter-1' }
    h.chapters.value = [{
      id: 'chapter-1', book_id: 'book-1', title: 'Old title', text: 'Old text', part_id: 'part-2',
    }]
    const wrapper = mountView()
    await flushPromises()

    expect((wrapper.get('#title').element as HTMLInputElement).value).toBe('Old title')
    expect((wrapper.get('#part').element as HTMLSelectElement).value).toBe('part-2')

    await wrapper.get('#title').setValue('Revised title')
    await wrapper.get('[data-testid="chapter-text"]').setValue('A thoroughly revised chapter.')
    await wrapper.findAll('button').find((button) => button.text().includes('Save Chapter'))!.trigger('click')
    await flushPromises()

    expect(h.saveChapter).toHaveBeenCalledWith(expect.objectContaining({
      id: 'chapter-1',
      title: 'Revised title',
      text: 'A thoroughly revised chapter.',
      word_count: 4,
      part_id: 'part-2',
    }))
    expect(h.updateChapterOrders).not.toHaveBeenCalled()
  })

  it('keeps save disabled until both title and content are present', async () => {
    const wrapper = mountView()
    await flushPromises()
    const saveButton = wrapper.findAll('button').find((button) => button.text().includes('Save Chapter'))!

    expect(saveButton.attributes('disabled')).toBeDefined()
    await wrapper.get('#title').setValue('A title')
    expect(saveButton.attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="chapter-text"]').setValue('Some text')
    expect(saveButton.attributes('disabled')).toBeUndefined()
  })

  it('inserts a new chapter before its neighbor in book and part order', async () => {
    h.route.query = { partId: 'part-1', insertRelativeTo: 'chapter-2', insertPlacement: 'before' }
    h.books.value = [{ id: 'book-1', title: 'Ghost Stories', chapter_order: '["stale","chapter-1","chapter-2"]' }]
    h.chapters.value = [
      { id: 'chapter-1', book_id: 'book-1', title: 'One', text: 'One', part_id: 'part-1' },
      { id: 'chapter-2', book_id: 'book-1', title: 'Two', text: 'Two', part_id: 'part-1' },
    ]
    h.parts = [part('part-1', '["chapter-1","chapter-2"]')]
    h.saveChapter.mockImplementationOnce(async (saved) => {
      h.chapters.value.push(saved)
      return null
    })
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('#title').setValue('Inserted')
    await wrapper.get('[data-testid="chapter-text"]').setValue('A new middle chapter')
    await wrapper.findAll('button').find((button) => button.text().includes('Save Chapter'))!.trigger('click')
    await flushPromises()

    const savedId = h.saveChapter.mock.calls[0][0].id
    expect(h.updateChapterOrders).toHaveBeenCalledWith(
      'book-1',
      ['chapter-1', savedId, 'chapter-2'],
      expect.objectContaining({ 'part-1': ['chapter-1', savedId, 'chapter-2'] }),
    )
  })

  it('redirects to the book when an edited chapter cannot be found', async () => {
    h.route.params = { bookId: 'book-1', chapterId: 'missing' }
    mountView()
    await flushPromises()

    expect(h.push).toHaveBeenCalledWith('/books/book-1')
  })

  it('reloads an externally changed clean editor but preserves dirty text', async () => {
    h.route.params = { bookId: 'book-1', chapterId: 'chapter-1' }
    h.chapters.value = [{ id: 'chapter-1', book_id: 'book-1', title: 'One', text: 'Original', part_id: null }]
    const wrapper = mountView()
    await flushPromises()

    h.chapters.value = [{ id: 'chapter-1', book_id: 'book-1', title: 'One', text: 'Replaced elsewhere', part_id: null }]
    window.dispatchEvent(new CustomEvent(CHAPTER_WIKI_LINKS_CHANGED_EVENT, {
      detail: { chapterIds: ['chapter-1'], wikiPageIds: [] },
    }))
    await flushPromises()
    expect((wrapper.get('[data-testid="chapter-text"]').element as HTMLTextAreaElement).value).toBe('Replaced elsewhere')

    await wrapper.get('[data-testid="chapter-text"]').setValue('My unsaved draft')
    h.chapters.value = [{ id: 'chapter-1', book_id: 'book-1', title: 'One', text: 'Another external edit', part_id: null }]
    window.dispatchEvent(new CustomEvent(CHAPTER_WIKI_LINKS_CHANGED_EVENT, {
      detail: { chapterIds: ['chapter-1'], wikiPageIds: [] },
    }))
    await flushPromises()
    expect((wrapper.get('[data-testid="chapter-text"]').element as HTMLTextAreaElement).value).toBe('My unsaved draft')
  })

  it('re-enables save and stays in the editor after a failed save', async () => {
    h.saveChapter.mockRejectedValueOnce(new Error('disk full'))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('#title').setValue('Unlucky chapter')
    await wrapper.get('[data-testid="chapter-text"]').setValue('Still here')
    const saveButton = wrapper.findAll('button').find((button) => button.text().includes('Save Chapter'))!

    await saveButton.trigger('click')
    await flushPromises()

    expect(h.push).not.toHaveBeenCalled()
    expect(saveButton.attributes('disabled')).toBeUndefined()
    expect(saveButton.text()).toContain('Save Chapter')
  })
})
