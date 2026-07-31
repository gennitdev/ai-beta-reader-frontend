// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { ChapterRevision, ChapterRevisionActivity } from '@/lib/database'

const { books, activity, revisions } = vi.hoisted(() => ({
  books: { value: [{ id: 'book-1', title: 'Ghost Stories' }] },
  activity: [{
    id: 'revision-2',
    chapter_id: 'chapter-1',
    chapter_title: 'Moonrise',
    activity_type: 'save',
    words_added: 2,
    words_removed: 1,
    word_count_deleted: 0,
    revision_available: true,
    created_at: '2026-07-31T12:00:00.000Z',
  }] as ChapterRevisionActivity[],
  revisions: [
    {
      id: 'revision-2', chapter_id: 'chapter-1', book_id: 'book-1', title: 'Moonrise',
      text: 'The moon was very bright.', word_count: 5, words_added: 2, words_removed: 1,
      revision_kind: 'save', created_at: '2026-07-31T12:00:00.000Z',
    },
    {
      id: 'revision-1', chapter_id: 'chapter-1', book_id: 'book-1', title: 'Moonrise',
      text: 'The moon was pale.', word_count: 4, words_added: 4, words_removed: 0,
      revision_kind: 'baseline', created_at: '2026-07-30T12:00:00.000Z',
    },
  ] as ChapterRevision[],
}))

vi.mock('@/composables/useDatabase', () => ({
  useDatabase: () => ({
    books,
    loadBooks: vi.fn(async () => {}),
    getBookRevisionActivity: vi.fn(async () => activity),
    getChapterRevisions: vi.fn(async () => revisions),
  }),
}))

import BardwallView from '@/views/BardwallView.vue'

afterEach(() => localStorage.clear())

describe('BardwallView', () => {
  it('completes the amphitheater story and coin loop', async () => {
    const wrapper = mount(BardwallView)

    expect(wrapper.text()).toContain('Enter Bardwall')
    await wrapper.get('[data-testid="enter-bardwall"]').trigger('click')
    expect(wrapper.text()).toContain('Name today’s measure.')
    expect(wrapper.text()).toContain('Tent')
    expect(wrapper.text()).toContain('Bread')
    expect(wrapper.text()).toContain('Cheese')
    await wrapper.get('[data-testid="set-daily-goal"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('The story must go on.')
    expect(wrapper.text()).toContain('0 / 500 words')

    await wrapper.get('[data-testid="visit-amphitheater"]').trigger('click')
    await wrapper.get('[data-testid="revision-offering-revision-2"]').trigger('click')
    expect(wrapper.text()).toContain('very bright')
    expect(wrapper.text()).toContain('2 words selected')

    await wrapper.get('[data-testid="tell-story"]').trigger('click')
    expect(wrapper.text()).toContain('The ghosts are fed')
    expect(wrapper.text()).toContain('You told 2 words')
    expect(wrapper.text()).toContain('earned 1 coin')
    expect(JSON.parse(localStorage.getItem('bardwall-game-state') ?? '{}')).toMatchObject({
      coins: 1,
      storiesTold: 1,
      totalWordsTold: 2,
      dailyGoal: expect.objectContaining({ wordCount: 500, wordsTold: 2, coinsEarned: 1, locked: true }),
      toldPassageIds: ['revision-2:0'],
    })

    await wrapper.get('[data-testid="return-to-town"]').trigger('click')
    await wrapper.get('[data-testid="visit-amphitheater"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Save a chapter revision, then return')
  })
})
