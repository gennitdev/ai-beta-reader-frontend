// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import BooksView from '@/views/BooksView.vue'

const h = vi.hoisted(() => ({
  books: [] as Array<{ id: string; title: string; cover_image_id?: string | null }>,
  loadBooks: vi.fn(async () => {}),
  createBook: vi.fn(async () => ({ id: 'new', title: 'New' })),
  fetchBookCover: vi.fn(async () => null),
  getImageSource: vi.fn(async () => 'src'),
  push: vi.fn(),
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: h.push }) }))

vi.mock('@/composables/useBooks', async () => {
  const { ref } = await import('vue')
  return {
    useBooks: () => ({
      books: ref(h.books),
      loading: ref(false),
      error: ref(null),
      loadBooks: h.loadBooks,
      createBook: h.createBook,
    }),
  }
})

vi.mock('@/composables/useImageLibrary', async () => {
  const { ref } = await import('vue')
  return {
    useImageLibrary: () => ({
      canStoreImages: ref(false),
      fetchBookCover: h.fetchBookCover,
      getImageSource: h.getImageSource,
    }),
  }
})

function mountView() {
  return mount(BooksView, { global: { stubs: { RouterLink: true } } })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.books = []
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('BooksView', () => {
  it('loads books on mount and renders the empty state when there are none', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(h.loadBooks).toHaveBeenCalled()
    expect(wrapper.text()).toContain('No books yet')
  })

  it('renders the book list when books exist', async () => {
    h.books = [
      { id: 'b1', title: 'The First Book', cover_image_id: null },
      { id: 'b2', title: 'The Second Book', cover_image_id: null },
    ]
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('The First Book')
    expect(wrapper.text()).toContain('The Second Book')
    expect(wrapper.text()).not.toContain('No books yet')
  })

  it('navigates to a book when its card is clicked', async () => {
    h.books = [{ id: 'b1', title: 'The First Book', cover_image_id: null }]
    const wrapper = mountView()
    await flushPromises()

    const card = wrapper.findAll('[class*="cursor-pointer"]').find((el) => el.text().includes('The First Book'))
      ?? wrapper.findAll('div').find((el) => el.text().includes('The First Book'))
    await card!.trigger('click')

    expect(h.push).toHaveBeenCalledWith('/books/b1')
  })

  it('records an error when a cover fails to load', async () => {
    h.books = [{ id: 'b1', title: 'The First Book', cover_image_id: 'img-1' }]
    h.fetchBookCover.mockRejectedValueOnce(new Error('cover fail'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('Some covers could not be loaded.')
  })

  it('creates a book through the modal form', async () => {
    const wrapper = mountView()
    await flushPromises()

    // Open the create modal.
    const newBookBtn = wrapper.findAll('button').find((b) => b.text().includes('New Book'))
    await newBookBtn!.trigger('click')

    // Fill the title; @input auto-generates the id.
    const titleInput = wrapper.find('input[placeholder="Enter book title"]')
    await titleInput.setValue('Fresh Book')

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(h.createBook).toHaveBeenCalledOnce()
    const arg = h.createBook.mock.calls[0][0] as { id: string; title: string }
    expect(arg.title).toBe('Fresh Book')
    expect(arg.id).toContain('fresh-book')
  })
})
