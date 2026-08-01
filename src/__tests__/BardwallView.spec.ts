// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { ChapterRevision, ChapterRevisionActivity } from '@/lib/database'
import { createDefaultBardwallState, getBardwallDateKey, saveBardwallState } from '@/lib/bardwall'

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

const { routerPush, routerReplace } = vi.hoisted(() => ({
  routerPush: vi.fn(async () => {}),
  routerReplace: vi.fn(async () => {}),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {} }),
  useRouter: () => ({ push: routerPush, replace: routerReplace }),
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

afterEach(() => {
  localStorage.clear()
  routerPush.mockClear()
  routerReplace.mockClear()
})

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

    await wrapper.get('[data-testid="map-amphitheater"]').trigger('click')
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
    await wrapper.get('[data-testid="map-amphitheater"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Save a chapter revision, then return')
  })

  it('buys market food and completes a fed night at the inn', async () => {
    saveBardwallState({
      ...createDefaultBardwallState(),
      coins: 130,
      dailyGoal: { date: getBardwallDateKey(), wordCount: 500, wordsTold: 500, coinsEarned: 100, locked: true },
    })
    const wrapper = mount(BardwallView)

    await wrapper.get('[data-testid="enter-bardwall"]').trigger('click')
    expect(wrapper.text()).toContain('Day 1')
    await wrapper.get('[data-testid="map-market"]').trigger('click')
    expect(routerPush).toHaveBeenCalledWith({ name: 'bardwall-location', params: { location: 'market' } })
    expect(wrapper.text()).toContain('Bardwall Night Market')
    await wrapper.get('[data-testid="buy-apple"]').trigger('click')
    expect(wrapper.text()).toContain('Orchard apple added to your pack.')
    await wrapper.get('[data-testid="leave-market"]').trigger('click')

    await wrapper.get('[data-testid="map-camp"]').trigger('click')
    await wrapper.get('[data-testid="end-day"]').trigger('click')
    await wrapper.get('[data-testid="pack-bread"]').trigger('click')
    await wrapper.get('[data-testid="pack-cheese"]').trigger('click')
    expect(wrapper.text()).toContain('100 / 100')
    await wrapper.get('[data-testid="confirm-end-day"]').trigger('click')

    expect(wrapper.text()).toContain('Day 2 begins.')
    expect(wrapper.text()).toContain('You wake fed')
    expect(JSON.parse(localStorage.getItem('bardwall-game-state') ?? '{}')).toMatchObject({
      coins: 25,
      day: 2,
      energy: 100,
      hunger: 0,
      dailyGoal: null,
      inventory: { apple: 1, bread: 0, cheese: 0, tent: 1 },
      lastNight: { lodging: 'inn', nourishment: 100 },
    })

    await wrapper.get('[data-testid="begin-next-day"]').trigger('click')
    expect(wrapper.text()).toContain('Name today’s measure.')
  })

  it('follows the innkeeper’s advice and reveals Heliconia’s cave', async () => {
    saveBardwallState({
      ...createDefaultBardwallState(),
      coins: 3,
      dailyGoal: { date: getBardwallDateKey(), wordCount: 500, wordsTold: 0, coinsEarned: 0, locked: false },
    })
    const wrapper = mount(BardwallView)

    await wrapper.get('[data-testid="enter-bardwall"]').trigger('click')
    expect(wrapper.find('[data-testid="map-cave"]').exists()).toBe(false)

    await wrapper.get('[data-testid="map-inn"]').trigger('click')
    await wrapper.get('[data-testid="ask-innkeeper-advice"]').trigger('click')
    expect(wrapper.text()).toContain('noble, unreasonable undertaking')
    expect(wrapper.text()).toContain('Take a flower')
    await wrapper.get('[data-testid="back-to-map"]').trigger('click')

    await wrapper.get('[data-testid="map-market"]').trigger('click')
    await wrapper.get('[data-testid="buy-flower"]').trigger('click')
    expect(wrapper.text()).toContain('red flower has been wrapped')
    await wrapper.get('[data-testid="leave-market"]').trigger('click')

    await wrapper.get('[data-testid="map-shrine"]').trigger('click')
    await wrapper.get('[data-testid="offer-flower"]').trigger('click')
    expect(wrapper.text()).toContain('The goddess appears in person')
    expect(wrapper.text()).toContain('None of them can be won')
    await wrapper.get('[data-testid="return-with-cave-map"]').trigger('click')
    expect(wrapper.find('[data-testid="map-cave"]').exists()).toBe(true)

    await wrapper.get('[data-testid="map-cave"]').trigger('click')
    expect(wrapper.text()).toContain('The Unwinnable Cave')
    expect(JSON.parse(localStorage.getItem('bardwall-game-state') ?? '{}')).toMatchObject({
      coins: 0,
      inventory: { flower: 0 },
      heliconiaMet: true,
      caveUnlocked: true,
    })
  })

  it('loses the wyrm’s potion game and recovers at the apothecary', async () => {
    saveBardwallState({
      ...createDefaultBardwallState(),
      caveUnlocked: true,
      heliconiaMet: true,
      dailyGoal: { date: getBardwallDateKey(), wordCount: 500, wordsTold: 0, coinsEarned: 0, locked: false },
    })
    const wrapper = mount(BardwallView)

    await wrapper.get('[data-testid="enter-bardwall"]').trigger('click')
    expect(wrapper.find('[data-testid="map-apothecary"]').exists()).toBe(true)
    await wrapper.get('[data-testid="map-cave"]').trigger('click')
    expect(wrapper.text()).toContain('The Game of the Last Word')
    expect(wrapper.text()).toContain('The Wyrm’s Courtesy')

    await wrapper.get('[data-testid="play-wyrms-courtesy"]').trigger('click')
    await wrapper.get('[data-testid="drink-gold"]').trigger('click')
    expect(wrapper.text()).toContain('Gilded Fever')
    expect(wrapper.text()).toContain('You were so nearly correct')
    await wrapper.get('[data-testid="return-sick-to-town"]').trigger('click')
    expect(wrapper.text()).toContain('Seek treatment at Moth & Mortar')

    await wrapper.get('[data-testid="map-apothecary"]').trigger('click')
    expect(wrapper.text()).toContain('Cave work, obviously')
    await wrapper.get('[data-testid="receive-treatment"]').trigger('click')
    expect(wrapper.text()).toContain('Gilded Fever treated')
    expect(JSON.parse(localStorage.getItem('bardwall-game-state') ?? '{}')).toMatchObject({
      energy: 100,
      ailment: null,
      triedPotionIds: ['gold'],
    })
  })
})
