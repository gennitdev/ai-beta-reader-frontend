// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '@/App.vue'

const runtime = vi.hoisted(() => ({
  route: null as null | { path: string; params: Record<string, string> },
}))
const routerPush = vi.hoisted(() => vi.fn())
const db = vi.hoisted(() => ({
  books: null as null | { value: Array<Record<string, unknown>> },
  chapters: null as null | { value: Array<Record<string, unknown>> },
  persistenceError: null as null | { value: string | null },
  isRetryingPersistence: null as null | { value: boolean },
  loadBooks: vi.fn(),
  loadChapters: vi.fn(),
  getParts: vi.fn(),
  getChapterRevisions: vi.fn(),
  findReplaceMatches: vi.fn(),
  replaceFindReplaceMatches: vi.fn(),
  restoreFindReplaceFields: vi.fn(),
  retryPersistence: vi.fn(),
}))
const settings = vi.hoisted(() => ({
  bardwallEnabled: null as null | { value: boolean },
}))
const themeState = vi.hoisted(() => ({
  theme: null as null | { value: 'light' | 'dark' },
  toggleTheme: vi.fn(),
}))

vi.mock('vue-router', async () => {
  const { defineComponent, h, reactive } = await import('vue')
  runtime.route = reactive({ path: '/', params: {} })

  const RouterLink = defineComponent({
    name: 'RouterLink',
    props: {
      to: { type: [String, Object], required: true },
      custom: Boolean,
    },
    setup(props, { slots }) {
      return () => {
        const href = typeof props.to === 'string' ? props.to : '#'
        const navigate = () => routerPush(href)
        if (props.custom) {
          return slots.default?.({
            href,
            navigate,
            isActive: runtime.route?.path === href,
          })
        }
        return h('a', { href, onClick: navigate }, slots.default?.())
      }
    },
  })

  return {
    RouterLink,
    RouterView: defineComponent({ name: 'RouterView', template: '<div data-testid="router-view" />' }),
    useRoute: () => runtime.route,
    useRouter: () => ({ push: routerPush }),
  }
})

vi.mock('@/composables/useDatabase', async () => {
  const { ref } = await import('vue')
  db.books = ref([])
  db.chapters = ref([])
  db.persistenceError = ref(null)
  db.isRetryingPersistence = ref(false)
  return { useDatabase: () => db }
})

vi.mock('@/composables/useBardwallSettings', async () => {
  const { ref } = await import('vue')
  settings.bardwallEnabled = ref(true)
  return { useBardwallSettings: () => settings }
})

vi.mock('@/composables/useTheme', async () => {
  const { ref } = await import('vue')
  themeState.theme = ref('light')
  return { useTheme: () => themeState }
})

vi.mock('@/components/SearchModal.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      name: 'SearchModal',
      props: ['show', 'bookId', 'initialScope', 'targetId', 'searchService'],
      emits: ['close'],
      template: '<div data-testid="search-modal" :data-show="String(show)" :data-book-id="bookId" :data-scope="initialScope" :data-target-id="targetId"><button data-testid="close-search" @click="$emit(\'close\')">Close</button></div>',
    }),
  }
})

vi.mock('@/components/BrowserStorageNotice.vue', async () => {
  const { defineComponent } = await import('vue')
  return { default: defineComponent({ template: '<div data-testid="storage-notice" />' }) }
})

vi.mock('@/components/PersistenceErrorNotice.vue', async () => {
  const { defineComponent } = await import('vue')
  return {
    default: defineComponent({
      props: ['message', 'retrying'],
      emits: ['retry'],
      template: '<button data-testid="persistence-error" :data-retrying="String(retrying)" @click="$emit(\'retry\')">{{ message }}</button>',
    }),
  }
})

let wrapper: VueWrapper | undefined

function setRoute(path: string, params: Record<string, string> = {}) {
  if (!runtime.route) throw new Error('route mock was not initialized')
  runtime.route.path = path
  runtime.route.params = params
}

function mountApp() {
  wrapper = mount(App, { attachTo: document.body })
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  setRoute('/')
  db.books!.value = []
  db.chapters!.value = []
  db.persistenceError!.value = null
  db.isRetryingPersistence!.value = false
  settings.bardwallEnabled!.value = true
  themeState.theme!.value = 'light'
  db.loadBooks.mockResolvedValue(undefined)
  db.loadChapters.mockResolvedValue(undefined)
  db.getParts.mockResolvedValue([])
  db.getChapterRevisions.mockResolvedValue([])
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('App shell', () => {
  it('starts the database, renders global shell services, and toggles its theme and navigation', async () => {
    const app = mountApp()

    expect(db.loadBooks).toHaveBeenCalledOnce()
    expect(app.find('[data-testid="router-view"]').exists()).toBe(true)
    expect(app.find('[data-testid="storage-notice"]').exists()).toBe(true)
    expect(app.text()).toContain('My Books')
    expect(app.find('[data-testid="header-theme-toggle"]').attributes('aria-label')).toBe('Switch to dark theme')

    await app.find('[data-testid="header-theme-toggle"]').trigger('click')
    expect(themeState.toggleTheme).toHaveBeenCalledOnce()

    await app.find('button[aria-label="Toggle navigation"]').trigger('click')
    expect(document.body.querySelector('#side-nav')).not.toBeNull()
    document.body.querySelector<HTMLButtonElement>('button[aria-label="Close navigation"]')?.click()
    await nextTick()
    expect(document.body.querySelector('#side-nav')).toBeNull()
  })

  it('loads book context, sorts the book navigation, and exposes chapter and search actions', async () => {
    db.books!.value = [
      { id: 'older', title: 'Older Book', created_at: '2024-01-01T00:00:00Z' },
      { id: 'book-1', title: 'Current Book', created_at: '2025-01-01T00:00:00Z' },
    ]
    db.getParts.mockResolvedValue([{ id: 'part-1', name: 'Opening Act' }])
    setRoute('/books/book-1', { id: 'book-1' })

    const app = mountApp()
    await flushPromises()

    expect(db.loadChapters).toHaveBeenCalledWith('book-1')
    expect(db.getParts).toHaveBeenCalledWith('book-1')
    expect(app.text()).toContain('Books > Current Book')

    await app.find('button[aria-label="Create new chapter"]').trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/books/book-1/chapter-editor')

    const shortcut = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
    window.dispatchEvent(shortcut)
    await nextTick()
    expect(shortcut.defaultPrevented).toBe(true)
    expect(app.find('[data-testid="search-modal"]').attributes('data-show')).toBe('true')
    expect(app.find('[data-testid="search-modal"]').attributes('data-scope')).toBe('book')

    await app.find('[data-testid="close-search"]').trigger('click')
    expect(app.find('[data-testid="search-modal"]').attributes('data-show')).toBe('false')

    await app.find('button[aria-label="Toggle navigation"]').trigger('click')
    const navText = document.body.querySelector('#side-nav')?.textContent ?? ''
    expect(navText.indexOf('Current Book')).toBeLessThan(navText.indexOf('Older Book'))
    expect(document.body.querySelector('a[aria-current="page"]')?.textContent).toContain('Current Book')
  })

  it('builds contextual chapter revision breadcrumbs and search scope', async () => {
    db.books!.value = [{ id: 'book-1', title: 'The Book' }]
    db.chapters!.value = [{ id: 'chapter-1', title: 'First Chapter', part_id: 'part-1' }]
    db.getParts.mockResolvedValue([{ id: 'part-1', name: 'Part One' }])
    db.getChapterRevisions.mockResolvedValue([
      {
        id: 'revision-1',
        revision_kind: 'baseline',
        created_at: '2025-01-01T00:00:00Z',
      },
    ])
    setRoute('/books/book-1/chapters/chapter-1/versions/revision-1', {
      id: 'book-1',
      chapterId: 'chapter-1',
      revisionId: 'revision-1',
    })

    const app = mountApp()
    await flushPromises()

    expect(db.getChapterRevisions).toHaveBeenCalledWith('chapter-1')
    expect(app.text()).toContain('Books > The Book > Part One > First Chapter > Revisions > Original version')
    expect(app.find('[data-testid="search-modal"]').attributes('data-scope')).toBe('chapter')
    expect(app.find('[data-testid="search-modal"]').attributes('data-target-id')).toBe('chapter-1')
  })

  it('updates breadcrumbs across part, wiki, organize, and editor routes', async () => {
    db.books!.value = [{ id: 'book-1', title: 'The Book' }]
    db.getParts.mockResolvedValue([{ id: 'part-1', name: 'Part One' }])
    setRoute('/books/book-1/parts/part-1', { bookId: 'book-1', partId: 'part-1' })
    const app = mountApp()
    await flushPromises()
    expect(app.text()).toContain('Books > The Book > Part One')

    setRoute('/books/book-1/wiki/wiki-1', { bookId: 'book-1', wikiPageId: 'wiki-1' })
    await flushPromises()
    expect(app.text()).toContain('Books > The Book > Wiki')
    expect(app.find('[data-testid="search-modal"]').attributes('data-scope')).toBe('wikiPage')
    expect(app.find('[data-testid="search-modal"]').attributes('data-target-id')).toBe('wiki-1')

    setRoute('/books/book-1/organize', { bookId: 'book-1' })
    await flushPromises()
    expect(app.text()).toContain('Books > The Book > Organize Chapters')

    setRoute('/books/book-1/chapter-editor', { bookId: 'book-1' })
    await flushPromises()
    expect(app.text()).toContain('Books > The Book > Chapter Editor')
  })

  it('handles global search shortcut boundaries and closes navigation after routing', async () => {
    const app = mountApp()
    await app.find('button[aria-label="Toggle navigation"]').trigger('click')
    expect(document.body.querySelector('#side-nav')).not.toBeNull()

    const unavailableFind = new KeyboardEvent('keydown', {
      key: 'f', ctrlKey: true, bubbles: true, cancelable: true,
    })
    window.dispatchEvent(unavailableFind)
    expect(unavailableFind.defaultPrevented).toBe(false)

    setRoute('/books/book-1', { bookId: 'book-1' })
    await flushPromises()
    expect(document.body.querySelector('#side-nav')).toBeNull()

    const input = document.createElement('input')
    document.body.appendChild(input)
    const typingSlash = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
    input.dispatchEvent(typingSlash)
    expect(typingSlash.defaultPrevented).toBe(false)

    const explicitFind = new KeyboardEvent('keydown', {
      key: 'F', metaKey: true, bubbles: true, cancelable: true,
    })
    input.dispatchEvent(explicitFind)
    await nextTick()
    expect(explicitFind.defaultPrevented).toBe(true)
    expect(app.find('[data-testid="search-modal"]').attributes('data-show')).toBe('true')
  })

  it('surfaces persistence recovery and logs non-fatal breadcrumb loading failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.persistenceError!.value = 'Could not save your changes'
    db.isRetryingPersistence!.value = true
    db.getParts.mockRejectedValueOnce(new Error('parts unavailable'))
    db.getChapterRevisions.mockRejectedValueOnce(new Error('revisions unavailable'))
    setRoute('/books/book-1/chapters/chapter-1/versions/revision-1', {
      bookId: 'book-1', chapterId: 'chapter-1', revisionId: 'revision-1',
    })

    const app = mountApp()
    await flushPromises()

    const errorNotice = app.find('[data-testid="persistence-error"]')
    expect(errorNotice.text()).toBe('Could not save your changes')
    expect(errorNotice.attributes('data-retrying')).toBe('true')
    await errorNotice.trigger('click')
    expect(db.retryPersistence).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledWith('Failed to load parts for breadcrumbs:', expect.any(Error))
    expect(consoleError).toHaveBeenCalledWith('Failed to load revision for breadcrumbs:', expect.any(Error))

    consoleError.mockRestore()
  })

  it('uses Bardwall navigation chrome without the standard header', async () => {
    setRoute('/bardwall/market', { location: 'market' })
    const app = mountApp()

    expect(app.find('header').exists()).toBe(false)
    const open = app.find('button[aria-label="Open site navigation"]')
    expect(open.exists()).toBe(true)
    await open.trigger('click')
    expect(document.body.querySelector('#side-nav')).not.toBeNull()
  })
})
