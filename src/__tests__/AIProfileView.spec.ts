// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

// AIProfileView is a read-only detail view: given a route :id it resolves either a
// built-in profile (keyed by tone_key) or a custom profile (numeric id), then sweeps
// every book/chapter for reviews attributed to that profile and lists them.

const h = vi.hoisted(() => {
  const longPrompt =
    'You are a developmental editor giving thorough structural feedback on pacing, ' +
    'character arcs, and plot across the whole chapter, always offering concrete ' +
    'suggestions and questions for the writer to consider during revision. FINAL_MARKER_TAIL'
  return {
    route: { params: { id: 'editorial' } as Record<string, string> },
    push: vi.fn(),
    back: vi.fn(),
    books: [] as Array<Record<string, unknown>>,
    chapters: [] as Array<Record<string, unknown>>,
    loadBooks: vi.fn(async () => {}),
    loadChapters: vi.fn(async () => {}),
    getCustomProfiles: vi.fn(async () => [] as Array<Record<string, unknown>>),
    getReviews: vi.fn(async () => [] as Array<Record<string, unknown>>),
    builtInProfiles: {
      editorial: {
        id: 'editorial',
        name: 'Developmental Editor',
        tone_key: 'editorial',
        description: 'Professional developmental editor feedback',
        system_prompt: longPrompt,
        is_system: true,
      },
      fanficnet: {
        id: 'fanficnet',
        name: 'Fan Reader',
        tone_key: 'fanficnet',
        description: 'Enthusiastic reviewer',
        system_prompt: 'Short and sweet.',
        is_system: true,
      },
    } as Record<string, unknown>,
  }
})

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
      getCustomProfiles: h.getCustomProfiles,
      getReviews: h.getReviews,
    }),
  }
})

vi.mock('@/lib/openai', () => ({
  get BUILT_IN_PROFILES() {
    return h.builtInProfiles
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import AIProfileView from '@/views/AIProfileView.vue'

const wrappers: VueWrapper[] = []

function mountView() {
  const wrapper = mount(AIProfileView, {
    global: {
      stubs: {
        MarkdownRenderer: { props: ['text'], template: '<div data-testid="review-md">{{ text }}</div>' },
        AvatarComponent: { props: ['text', 'size'], template: '<div data-testid="avatar">{{ text }}</div>' },
        ArrowLeftIcon: true, ClockIcon: true, SparklesIcon: true,
        ChatBubbleLeftRightIcon: true, UserCircleIcon: true, CodeBracketIcon: true,
      },
    },
  })
  wrappers.push(wrapper)
  return wrapper
}

function review(overrides: Record<string, unknown> = {}) {
  return {
    id: 'review-1',
    review_text: 'A thoughtful note about the chapter.',
    created_at: '2026-01-01T12:00:00.000Z',
    updated_at: '2026-01-01T12:00:00.000Z',
    tone_key: 'editorial',
    profile_id: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.route.params = { id: 'editorial' }
  h.books = [{ id: 'book-1', title: 'Ghost Stories' }]
  h.chapters = [{ id: 'chapter-1', title: 'Arrival' }]
  h.getCustomProfiles.mockResolvedValue([])
  h.getReviews.mockResolvedValue([])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
})

describe('AIProfileView', () => {
  it('loads a built-in profile and sweeps books for its reviews', async () => {
    h.getReviews.mockResolvedValue([review()])
    const wrapper = mountView()
    await flushPromises()

    expect(h.loadBooks).toHaveBeenCalled()
    expect(h.loadChapters).toHaveBeenCalledWith('book-1')
    expect(h.getReviews).toHaveBeenCalledWith('chapter-1')
    expect(h.getCustomProfiles).not.toHaveBeenCalled()

    expect(wrapper.get('h1').text()).toBe('Developmental Editor')
    expect(wrapper.text()).toContain('System Profile')
    expect(wrapper.text()).toContain('Default')
    expect(wrapper.text()).toContain('Tone: editorial')
    expect(wrapper.text()).toContain('Comment History (1)')
    expect(wrapper.get('[data-testid="review-md"]').text()).toContain('A thoughtful note')
  })

  it('keeps only reviews whose tone_key matches the built-in profile', async () => {
    h.getReviews.mockResolvedValue([
      review({ id: 'match', tone_key: 'editorial' }),
      review({ id: 'other', tone_key: 'fanficnet' }),
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Comment History (1)')
    expect(wrapper.text()).toContain('Total Reviews:')
    expect(wrapper.findAll('[data-testid="review-md"]')).toHaveLength(1)
  })

  it('loads a custom profile by numeric id and builds its prompt from the description', async () => {
    h.route.params = { id: '7' }
    h.getCustomProfiles.mockResolvedValue([
      { id: 7, name: 'My Reviewer', description: 'blunt but kind', created_at: '2026-02-02T00:00:00.000Z' },
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(h.getCustomProfiles).toHaveBeenCalled()
    expect(wrapper.get('h1').text()).toBe('My Reviewer')
    expect(wrapper.text()).toContain('User Profile')
    expect(wrapper.text()).not.toContain('System Profile')
    expect(wrapper.text()).toContain('Tone: custom-7')
    // The prompt panel is seeded from the profile description.
    expect(wrapper.get('pre').text()).toContain('blunt but kind')
  })

  it('matches custom-profile reviews by profile_id, not tone_key', async () => {
    h.route.params = { id: '7' }
    h.getCustomProfiles.mockResolvedValue([
      { id: 7, name: 'My Reviewer', description: 'blunt but kind', created_at: '2026-02-02T00:00:00.000Z' },
    ])
    h.getReviews.mockResolvedValue([
      review({ id: 'match', tone_key: null, profile_id: 7 }),
      review({ id: 'skip', tone_key: 'editorial', profile_id: 99 }),
    ])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Comment History (1)')
    expect(wrapper.findAll('[data-testid="review-md"]')).toHaveLength(1)
  })

  it('shows a not-found error when the id resolves to no profile', async () => {
    h.route.params = { id: 'does-not-exist' }
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to Load AI Profile')
    expect(wrapper.text()).toContain('Profile not found')
    expect(wrapper.text()).toContain('Profile ID: does-not-exist')
    // Never got as far as sweeping reviews.
    expect(h.loadBooks).not.toHaveBeenCalled()
  })

  it('surfaces a load failure and recovers via Try Again', async () => {
    h.loadBooks.mockRejectedValueOnce(new Error('database locked'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to Load AI Profile')
    expect(wrapper.text()).toContain('database locked')

    const tryAgain = wrapper.findAll('button').find((b) => b.text().trim() === 'Try Again')!
    await tryAgain.trigger('click')
    await flushPromises()

    // loadBooks now resolves, so the profile renders.
    expect(wrapper.get('h1').text()).toBe('Developmental Editor')
  })

  it('toggles between the truncated preview and the full prompt', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('pre').text()).toContain('...')
    expect(wrapper.get('pre').text()).not.toContain('FINAL_MARKER_TAIL')

    const toggle = wrapper.findAll('button').find((b) => b.text().trim() === 'Show full prompt')!
    await toggle.trigger('click')

    expect(wrapper.get('pre').text()).toContain('FINAL_MARKER_TAIL')
    expect(wrapper.findAll('button').some((b) => b.text().trim() === 'Show less')).toBe(true)
  })

  it('navigates to the reviewed chapter when a comment card is clicked', async () => {
    h.getReviews.mockResolvedValue([review()])
    const wrapper = mountView()
    await flushPromises()

    await wrapper.get('.cursor-pointer').trigger('click')
    expect(h.push).toHaveBeenCalledWith('/books/book-1/chapters/chapter-1')
  })

  it('goes back to the previous route from the header button', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('button')[0].trigger('click')
    expect(h.back).toHaveBeenCalled()
  })

  it('shows an empty state when the profile has no reviews', async () => {
    h.getReviews.mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Comment History (0)')
    expect(wrapper.text()).toContain('No comments yet from this AI profile.')
    expect(wrapper.findAll('[data-testid="review-md"]')).toHaveLength(0)
  })
})
