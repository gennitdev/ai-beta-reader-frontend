// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import HomeView from '@/views/HomeView.vue'

// Shared, per-test-mutable state for the mocked composable + router.
const state = vi.hoisted(() => ({ books: [] as Array<{ id: string }> }))
const loadBooks = vi.hoisted(() => vi.fn(async () => {}))
const routerReplace = vi.hoisted(() => vi.fn())
const routerPush = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: routerReplace, push: routerPush }),
}))

vi.mock('@/composables/useDatabase', async () => {
  const { ref } = await import('vue')
  return {
    useDatabase: () => ({ books: ref(state.books), loadBooks }),
  }
})

function mountHome() {
  return mount(HomeView, {
    global: { stubs: { RouterLink: true } },
  })
}

beforeEach(() => {
  state.books = []
  vi.clearAllMocks()
})

describe('HomeView', () => {
  it('loads books on mount and shows the landing page when there are none', async () => {
    const wrapper = mountHome()
    await flushPromises()

    expect(loadBooks).toHaveBeenCalledOnce()
    expect(routerReplace).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Start Writing Now')
    // The brand wordmark is rendered as the logo image, not body text.
    expect(wrapper.find('img[alt="Beta-bot"]').exists()).toBe(true)
  })

  it('redirects to /books when the user already has books', async () => {
    state.books = [{ id: 'book-1' }]
    const wrapper = mountHome()
    await flushPromises()

    expect(routerReplace).toHaveBeenCalledWith('/books')
    // Still on the loading state, so the landing CTA is not rendered.
    expect(wrapper.text()).not.toContain('Start Writing Now')
  })

  it('navigates to /books when "Start Writing Now" is clicked', async () => {
    const wrapper = mountHome()
    await flushPromises()

    const cta = wrapper.findAll('button').find((b) => b.text().includes('Start Writing Now'))
    expect(cta).toBeTruthy()
    await cta!.trigger('click')

    expect(routerPush).toHaveBeenCalledWith('/books')
  })
})
