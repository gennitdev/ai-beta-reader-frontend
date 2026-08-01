// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { ChapterRevision } from '@/lib/database'

const { revisions, routeParams, replace, restoreChapterRevision, discardChapterRevision } = vi.hoisted(() => ({
  revisions: [] as ChapterRevision[],
  routeParams: { id: 'book-1', chapterId: 'chapter-1', revisionId: 'revision-2' },
  replace: vi.fn(async () => {}),
  restoreChapterRevision: vi.fn(),
  discardChapterRevision: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: routeParams,
  }),
  useRouter: () => ({ replace }),
}))

vi.mock('@/composables/useDatabase', () => ({
  useDatabase: () => ({
    getChapterRevisions: vi.fn(async () => revisions),
    restoreChapterRevision,
    discardChapterRevision,
  }),
}))

import ChapterVersionDiffView from '@/views/ChapterVersionDiffView.vue'

const seedRevisions = () => revisions.splice(0, revisions.length,
  {
    id: 'revision-2',
    chapter_id: 'chapter-1',
    book_id: 'book-1',
    title: 'Moonrise',
    text: 'The moon was bright.',
    word_count: 4,
    words_added: 1,
    words_removed: 1,
    revision_kind: 'save',
    created_at: '2026-07-31T12:00:00.000Z',
  },
  {
    id: 'revision-1',
    chapter_id: 'chapter-1',
    book_id: 'book-1',
    title: 'Moonrise',
    text: 'The moon was pale.',
    word_count: 4,
    words_added: 4,
    words_removed: 0,
    revision_kind: 'save',
    created_at: '2026-07-30T12:00:00.000Z',
  },
)

const setDesktopViewport = (matches: boolean) => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches,
    media: '(min-width: 768px)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}

afterEach(() => {
  vi.unstubAllGlobals()
  routeParams.revisionId = 'revision-2'
  replace.mockClear()
  restoreChapterRevision.mockReset()
  discardChapterRevision.mockReset()
})

describe('ChapterVersionDiffView', () => {
  it('shows the selected revision compared with the preceding version', async () => {
    seedRevisions()
    setDesktopViewport(true)

    const wrapper = mount(ChapterVersionDiffView, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    })
    await flushPromises()

    expect(wrapper.get('h1').text()).toBe('Moonrise')
    expect(wrapper.text()).toContain('Compared with the preceding saved version.')
    expect(wrapper.get('.bg-rose-100').text()).toBe('pale')
    expect(wrapper.get('.bg-emerald-100').text()).toBe('bright')
    expect(wrapper.text()).toContain('+1 addition')
    expect(wrapper.text()).toContain('−1 deletion')
    expect(wrapper.text()).toContain('4 words in this version')
    expect(wrapper.get('[data-testid="split-diff"]').exists()).toBe(true)
    expect(wrapper.get('button[aria-pressed="true"]').text()).toBe('Side by side')

    await wrapper.get('[aria-label="Diff layout"] button:last-child').trigger('click')
    expect(wrapper.get('[data-testid="unified-diff"]').exists()).toBe(true)
    expect(wrapper.get('button[aria-pressed="true"]').text()).toBe('Unified')
    expect(wrapper.get('a').attributes('href')).toBe('/books/book-1/chapters/chapter-1')
  })

  it('defaults to the unified diff on mobile', async () => {
    seedRevisions()
    setDesktopViewport(false)

    const wrapper = mount(ChapterVersionDiffView, {
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="unified-diff"]').exists()).toBe(true)
    expect(wrapper.get('button[aria-pressed="true"]').text()).toBe('Unified')
  })

  it('restores an older version as a new revision after confirmation', async () => {
    seedRevisions()
    routeParams.revisionId = 'revision-1'
    restoreChapterRevision.mockResolvedValue({ ...revisions[1], id: 'revision-restored' })

    const wrapper = mount(ChapterVersionDiffView, {
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="open-restore"]').trigger('click')
    expect(wrapper.text()).toContain('Your newer versions will remain in history')
    await wrapper.get('[data-testid="confirm-restore"]').trigger('click')
    await flushPromises()

    expect(restoreChapterRevision).toHaveBeenCalledWith('revision-1')
    expect(replace).toHaveBeenCalledWith('/books/book-1/chapters/chapter-1/versions/revision-restored')
  })

  it('permanently discards an older revision after confirmation and shows its tombstone', async () => {
    seedRevisions()
    routeParams.revisionId = 'revision-1'
    discardChapterRevision.mockImplementation(async () => {
      revisions[1].text = ''
      revisions[1].discarded_at = '2026-08-01T12:00:00.000Z'
      return revisions[1]
    })

    const wrapper = mount(ChapterVersionDiffView, {
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()

    await wrapper.get('[data-testid="open-discard"]').trigger('click')
    expect(wrapper.text()).toContain('original diff cannot be recovered')
    expect(wrapper.text()).toContain('writing activity will not change')
    await wrapper.get('[data-testid="confirm-discard"]').trigger('click')
    await flushPromises()

    expect(discardChapterRevision).toHaveBeenCalledWith('revision-1')
    expect(wrapper.text()).toContain('Snapshot permanently discarded')
    expect(wrapper.text()).toContain('This tombstone remains')
    expect(wrapper.find('[data-testid="unified-diff"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="open-restore"]').exists()).toBe(false)
  })

  it('marks the original comparison unavailable when its preceding snapshot was discarded', async () => {
    seedRevisions()
    revisions[1].text = ''
    revisions[1].discarded_at = '2026-08-01T12:00:00.000Z'

    const wrapper = mount(ChapterVersionDiffView, {
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Original comparison unavailable')
    expect(wrapper.text()).toContain('historical change totals remain above')
    expect(wrapper.find('[data-testid="unified-diff"]').exists()).toBe(false)
  })
})
