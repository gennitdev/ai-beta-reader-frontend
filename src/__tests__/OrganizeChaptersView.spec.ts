// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import OrganizePartsBoard from '@/components/organize/OrganizePartsBoard.vue'

const h = vi.hoisted(() => ({
  route: { params: { bookId: 'book-1' } as Record<string, string | undefined> },
  push: vi.fn(),
  books: { value: [] as Array<Record<string, unknown>> },
  chapters: { value: [] as Array<Record<string, unknown>> },
  loadBooks: vi.fn(async () => {}),
  loadChapters: vi.fn(async () => {}),
  getSummary: vi.fn(async () => null as Record<string, unknown> | null),
  getParts: vi.fn(async () => [] as Array<Record<string, unknown>>),
  createPart: vi.fn(async () => {}),
  updatePart: vi.fn(async () => {}),
  deletePart: vi.fn(async () => {}),
  updatePartOrder: vi.fn(async () => {}),
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
    getSummary: h.getSummary,
    getParts: h.getParts,
    createPart: h.createPart,
    updatePart: h.updatePart,
    deletePart: h.deletePart,
    updatePartOrder: h.updatePartOrder,
    updateChapterOrders: h.updateChapterOrders,
  }),
}))

import OrganizeChaptersView from '@/views/OrganizeChaptersView.vue'

const wrappers: VueWrapper[] = []

const part = (id: string, createdAt: string, chapterOrder = '[]') => ({
  id,
  book_id: 'book-1',
  name: id === 'part-1' ? 'Beginning' : 'Ending',
  chapter_order: chapterOrder,
  cover_image_id: null,
  created_at: createdAt,
  updated_at: createdAt,
})

const chapter = (id: string, partId: string | null, wordCount = 100) => ({
  id,
  book_id: 'book-1',
  title: id,
  text: `${id} text`,
  part_id: partId,
  word_count: wordCount,
})

function mountView() {
  const wrapper = shallowMount(OrganizeChaptersView)
  wrappers.push(wrapper)
  return wrapper
}

function board(wrapper: VueWrapper) {
  return wrapper.findComponent(OrganizePartsBoard)
}

beforeEach(() => {
  vi.clearAllMocks()
  h.route.params = { bookId: 'book-1' }
  h.books.value = [{
    id: 'book-1',
    title: 'Ghost Stories',
    part_order: '["part-2","deleted"]',
    chapter_order: '["chapter-2","chapter-1"]',
  }]
  h.chapters.value = [
    chapter('chapter-1', 'part-1', 250),
    chapter('chapter-2', null, 750),
  ]
  h.getParts.mockResolvedValue([
    part('part-1', '2026-01-01T00:00:00.000Z', '["chapter-1"]'),
    part('part-2', '2026-02-01T00:00:00.000Z'),
  ])
  h.getSummary.mockImplementation(async (id) => id === 'chapter-1'
    ? { summary: 'A useful summary' }
    : null)
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('OrganizeChaptersView', () => {
  it('loads chapters, repairs stale part order, and exposes organized board state', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(h.updatePartOrder).toHaveBeenCalledWith('book-1', ['part-2', 'part-1'])
    expect(h.getSummary).toHaveBeenCalledTimes(2)
    expect(board(wrapper).props('partOrder')).toEqual(['part-2', 'part-1'])
    const organized = board(wrapper).props('chaptersByPart') as {
      parts: Array<{ id: string; chapters: Array<{ id: string; has_summary: boolean }> }>
      uncategorized: Array<{ id: string }>
      uncategorizedWordCount: number
    }
    expect(organized.parts.map((item) => item.id)).toEqual(['part-2', 'part-1'])
    expect(organized.parts[1].chapters).toEqual([
      expect.objectContaining({ id: 'chapter-1', has_summary: true }),
    ])
    expect(organized.uncategorized.map((item) => item.id)).toEqual(['chapter-2'])
    expect(organized.uncategorizedWordCount).toBe(750)
  })

  it('reloads durable state after a chapter move cannot be persisted', async () => {
    h.updateChapterOrders.mockRejectedValueOnce(new Error('disk full'))
    const wrapper = mountView()
    await flushPromises()

    board(wrapper).vm.$emit('move-chapter-to-part', 'chapter-2', 'part-1')
    await flushPromises()

    expect(h.updateChapterOrders).toHaveBeenCalledWith(
      'book-1',
      ['chapter-1', 'chapter-2'],
      { null: [], 'part-2': [], 'part-1': ['chapter-1', 'chapter-2'] },
      ['part-2', 'part-1'],
    )
    expect(h.loadBooks).toHaveBeenCalledTimes(2)
    const organized = board(wrapper).props('chaptersByPart') as {
      parts: Array<{ id: string; chapters: Array<{ id: string }> }>
      uncategorized: Array<{ id: string }>
    }
    expect(organized.parts.find((item) => item.id === 'part-1')?.chapters.map((item) => item.id))
      .toEqual(['chapter-1'])
    expect(organized.uncategorized.map((item) => item.id)).toEqual(['chapter-2'])
  })

  it('does not cascade a part move when its order cannot be persisted', async () => {
    h.updatePartOrder
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('storage unavailable'))
    const wrapper = mountView()
    await flushPromises()
    h.updateChapterOrders.mockClear()

    board(wrapper).vm.$emit('move-part-down', 'part-2')
    await flushPromises()

    expect(h.updatePartOrder).toHaveBeenLastCalledWith('book-1', ['part-1', 'part-2'])
    expect(h.updateChapterOrders).not.toHaveBeenCalled()
    expect(board(wrapper).props('partOrder')).toEqual(['part-2', 'part-1'])
  })

  it('creates and renames trimmed part names, then reloads the board', async () => {
    const wrapper = mountView()
    await flushPromises()

    board(wrapper).vm.$emit('start-create-part')
    board(wrapper).vm.$emit('update:new-part-name', '  Middle  ')
    board(wrapper).vm.$emit('create-part')
    await flushPromises()
    expect(h.createPart).toHaveBeenCalledWith('book-1', 'Middle')

    board(wrapper).vm.$emit('start-edit-part', 'part-1')
    board(wrapper).vm.$emit('update:editingPartName', '  New Beginning  ')
    board(wrapper).vm.$emit('save-part', 'part-1')
    await flushPromises()
    expect(h.updatePart).toHaveBeenCalledWith('part-1', 'New Beginning')
    expect(h.loadBooks.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('requires confirmation before deleting a part and survives deletion failure', async () => {
    vi.mocked(confirm).mockReturnValueOnce(false).mockReturnValueOnce(true)
    h.deletePart.mockRejectedValueOnce(new Error('part still referenced'))
    const wrapper = mountView()
    await flushPromises()

    board(wrapper).vm.$emit('delete-part', 'part-1')
    await flushPromises()
    expect(h.deletePart).not.toHaveBeenCalled()

    board(wrapper).vm.$emit('delete-part', 'part-1')
    await flushPromises()
    expect(h.deletePart).toHaveBeenCalledWith('part-1')
    expect(console.error).toHaveBeenCalledWith('Failed to delete part:', expect.any(Error))
  })

  it('reports load failures without exposing stale board data', async () => {
    h.loadBooks.mockRejectedValueOnce(new Error('database locked'))
    const wrapper = mountView()
    await flushPromises()

    expect(board(wrapper).props('errorMessage')).toBe('Unable to load chapters. Please try again.')
    expect(board(wrapper).props('loading')).toBe(false)
  })

  it('redirects when the route has no book id or the book no longer exists', async () => {
    h.route.params = {}
    let wrapper = mountView()
    await flushPromises()
    expect(h.push).toHaveBeenCalledWith('/books')

    wrapper.unmount()
    h.route.params = { bookId: 'missing' }
    h.books.value = []
    wrapper = mountView()
    await flushPromises()
    expect(h.push).toHaveBeenCalledWith('/books')
  })
})
