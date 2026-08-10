// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { ChapterRevision, ChapterRevisionActivity } from '@/lib/database'
import {
  BARDWALL_CHALLENGE_CARDS,
  createDefaultBardwallState,
  getBardwallDateKey,
  HELICONIA_PERSISTENCE_MESSAGES,
  saveBardwallState,
} from '@/lib/bardwall'

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

const { runBardwallStoryChallenge, continueBardwallLastWordStory } = vi.hoisted(() => ({
  runBardwallStoryChallenge: vi.fn(),
  continueBardwallLastWordStory: vi.fn(),
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

vi.mock('@/lib/openai', () => ({ runBardwallStoryChallenge, continueBardwallLastWordStory }))

import BardwallView from '@/views/BardwallView.vue'

afterEach(() => {
  localStorage.clear()
  routerPush.mockClear()
  routerReplace.mockClear()
  runBardwallStoryChallenge.mockReset()
  continueBardwallLastWordStory.mockReset()
})

describe('BardwallView', () => {
  it('provides a direct route back to books', async () => {
    const wrapper = mount(BardwallView)

    await wrapper.get('[data-testid="enter-bardwall"]').trigger('click')
    await wrapper.get('[data-testid="back-to-books"]').trigger('click')

    expect(routerPush).toHaveBeenCalledWith({ name: 'books' })
  })

  it('plays a complete coffeehouse challenge and awards the matched stakes', async () => {
    saveBardwallState({
      ...createDefaultBardwallState(),
      coins: 20,
      dailyGoal: { date: getBardwallDateKey(), wordCount: 500, wordsTold: 0, coinsEarned: 0, locked: false },
    })
    localStorage.setItem('openai_api_key', 'sk-test')
    runBardwallStoryChallenge.mockResolvedValue({
      outcome: 'win', rivalStory: 'Orla told a moonlit story.', explanation: 'Your three symbols became one inevitable ending.',
      playerScores: { sceneSpecificity: 9, characterAgency: 9, narrativeMovement: 9, craftCoherence: 9, promptIntegration: 10 },
      rivalScores: { sceneSpecificity: 8, characterAgency: 8, narrativeMovement: 8, craftCoherence: 8, promptIntegration: 10 },
      playerLengthPenalty: 0,
      rivalLengthPenalty: 0,
    })
    const wrapper = mount(BardwallView)

    await wrapper.get('[data-testid="enter-bardwall"]').trigger('click')
    await wrapper.get('[data-testid="map-challenge"]').trigger('click')
    expect(wrapper.text()).toContain('Ink & Ember Coffeehouse')
    await wrapper.findAll('button').find((button) => button.text() === '100 words')!.trigger('click')
    await wrapper.get('[data-testid="start-coffeehouse-challenge"]').trigger('click')
    const cards = wrapper.findAll('[data-testid^="challenge-card-"]')
    expect(cards).toHaveLength(3)
    for (const card of cards) await card.trigger('click')
    await wrapper.get('[data-testid="advance-challenge-draft"]').trigger('click')

    expect(wrapper.get('[data-testid="challenge-rubric"]').text()).toContain('Scene & specificity')
    expect(wrapper.get('[data-testid="challenge-rubric"]').text()).toContain('Character & agency')
    expect(wrapper.text()).toContain('required 90–110')

    const oversizedStory = Array.from({ length: 111 }, (_, index) => `word${index}`).join(' ')
    await wrapper.get('[data-testid="challenge-story"]').setValue(oversizedStory)
    expect(wrapper.get('[data-testid="challenge-word-guidance"]').text()).toBe('Cut at least 1 word.')
    expect(wrapper.get('[data-testid="submit-challenge-story"]').attributes('disabled')).toBeDefined()

    const story = Array.from({ length: 100 }, (_, index) => `word${index}`).join(' ')
    await wrapper.get('[data-testid="challenge-story"]').setValue(story)
    expect(wrapper.get('[data-testid="challenge-word-guidance"]').text()).toBe('Your story is within the challenge range.')
    expect(wrapper.get('[data-testid="submit-challenge-story"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-testid="submit-challenge-story"]').trigger('click')
    await flushPromises()

    expect(runBardwallStoryChallenge).toHaveBeenCalledOnce()
    expect(runBardwallStoryChallenge).toHaveBeenCalledWith('sk-test', expect.objectContaining({
      judgeRubric: expect.stringContaining('concrete scenes'),
      orlaPrompt: expect.stringContaining('specific immediate desire'),
    }))
    expect(wrapper.text()).toContain('The table is yours.')
    expect(wrapper.text()).toContain('Your three symbols became one inevitable ending.')
    expect(wrapper.get('[data-testid="challenge-story-comparison"]').text()).toContain(story)
    expect(wrapper.get('[data-testid="challenge-story-comparison"]').text()).toContain('Orla told a moonlit story.')
    expect(JSON.parse(localStorage.getItem('bardwall-game-state') ?? '{}')).toMatchObject({ coins: 21, challengesWon: 1 })
  })

  it('accepts a custom wager and saves custom table rules', async () => {
    saveBardwallState({
      ...createDefaultBardwallState(),
      coins: 17,
      dailyGoal: { date: getBardwallDateKey(), wordCount: 500, wordsTold: 0, coinsEarned: 0, locked: false },
    })
    const wrapper = mount(BardwallView)

    await wrapper.get('[data-testid="enter-bardwall"]').trigger('click')
    await wrapper.get('[data-testid="map-challenge"]').trigger('click')
    expect(wrapper.text()).toContain('Orla will match it')
    expect(wrapper.text()).toContain('Tamsin judges without putting anything on the table')

    await wrapper.get('[data-testid="open-challenge-rules"]').trigger('click')
    await wrapper.get('[data-testid="challenge-judge-rubric"]').setValue('Reward jokes about geese.')
    await wrapper.get('[data-testid="challenge-orla-prompt"]').setValue('Write a solemn tale about a turnip.')
    await wrapper.get('[data-testid="save-challenge-rules"]').trigger('click')

    await wrapper.get('[data-testid="custom-wager-amount"]').setValue('18')
    expect(wrapper.get('[data-testid="start-coffeehouse-challenge"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('You only have 17 coins')
    await wrapper.get('[data-testid="custom-wager-amount"]').setValue('13')
    expect(wrapper.get('[data-testid="start-coffeehouse-challenge"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-testid="start-coffeehouse-challenge"]').trigger('click')

    expect(JSON.parse(localStorage.getItem('bardwall-game-state') ?? '{}')).toMatchObject({
      coins: 4,
      challenge: { phase: 'draft', wager: { type: 'coins', amount: 13 } },
      challengeRules: {
        judgeRubric: 'Reward jokes about geese.',
        orlaPrompt: 'Write a solemn tale about a turnip.',
      },
    })
  })

  it('offers a table-rules escape hatch after Orla wins', async () => {
    const defaultState = createDefaultBardwallState()
    saveBardwallState({
      ...defaultState,
      dailyGoal: { date: getBardwallDateKey(), wordCount: 500, wordsTold: 0, coinsEarned: 0, locked: false },
      challenge: {
        phase: 'result',
        goal: 100,
        wager: { type: 'coins', amount: 1 },
        cards: BARDWALL_CHALLENGE_CARDS.slice(0, 3).map((card) => ({ cardId: card.id, held: true })),
        drawNumber: 1,
        playerStory: 'A concrete but tragically defeated story.',
        result: {
          outcome: 'lose',
          rivalStory: 'Orla wins this one.',
          explanation: 'A perfectly neutral decision.',
          playerScores: { sceneSpecificity: 7, characterAgency: 7, narrativeMovement: 7, craftCoherence: 7, promptIntegration: 7 },
          rivalScores: { sceneSpecificity: 8, characterAgency: 8, narrativeMovement: 8, craftCoherence: 8, promptIntegration: 8 },
          playerLengthPenalty: 0,
          rivalLengthPenalty: 0,
        },
      },
    })
    const wrapper = mount(BardwallView)

    await wrapper.get('[data-testid="enter-bardwall"]').trigger('click')
    await wrapper.get('[data-testid="map-challenge"]').trigger('click')
    expect(wrapper.get('[data-testid="losing-rules-cta"]').text()).toContain('Are you losing too much?')
    await wrapper.get('[data-testid="losing-edit-rules"]').trigger('click')
    expect(wrapper.find('[data-testid="challenge-rules-editor"]').exists()).toBe(true)
  })

  it('starts, saves, and continues an unwinnable Last Word story', async () => {
    saveBardwallState({
      ...createDefaultBardwallState(),
      caveUnlocked: true,
      heliconiaMet: true,
      dailyGoal: { date: getBardwallDateKey(), wordCount: 500, wordsTold: 0, coinsEarned: 0, locked: false },
    })
    localStorage.setItem('openai_api_key', 'sk-test')
    continueBardwallLastWordStory.mockResolvedValue('and something answered from below')
    const wrapper = mount(BardwallView)

    await wrapper.get('[data-testid="enter-bardwall"]').trigger('click')
    await wrapper.get('[data-testid="map-cave"]').trigger('click')
    await wrapper.get('[data-testid="play-last-word"]').trigger('click')
    await wrapper.get('[data-testid="new-last-word-story"]').trigger('click')
    await wrapper.get('[data-testid="last-word-draft"]').setValue('Once beneath the roots')

    expect(JSON.parse(localStorage.getItem('bardwall-game-state') ?? '{}').lastWordStories[0].draft).toBe('Once beneath the roots')
    await wrapper.get('[data-testid="submit-last-word-turn"]').trigger('click')
    await flushPromises()

    expect(continueBardwallLastWordStory).toHaveBeenCalledWith('sk-test', expect.objectContaining({
      bardText: 'Once beneath the roots',
      targetWords: 4,
    }))
    expect(wrapper.text()).toContain('He still has the last word.')
    expect(wrapper.text()).toContain('and something answered from below')
    expect(JSON.parse(localStorage.getItem('bardwall-game-state') ?? '{}').lastWordStories[0]).toMatchObject({
      title: 'Once beneath the roots',
      draft: '',
      turns: [{ speaker: 'bard' }, { speaker: 'vesper' }],
    })

    await wrapper.get('[data-testid="last-word-story-shelf"]').trigger('click')
    expect(wrapper.text()).toContain('Stories still echoing')
    expect(wrapper.text()).toContain('1 exchange')
  })

  it('requires typed confirmation before beginning Bardwall again', async () => {
    saveBardwallState({
      ...createDefaultBardwallState(),
      coins: 240,
      day: 6,
      caveUnlocked: true,
      heliconiaMet: true,
      storiesTold: 9,
      dailyGoal: { date: getBardwallDateKey(), wordCount: 500, wordsTold: 500, coinsEarned: 100, locked: true },
    })
    const wrapper = mount(BardwallView, { attachTo: document.body })

    await wrapper.get('[data-testid="enter-bardwall"]').trigger('click')
    await wrapper.get('[data-testid="begin-bardwall-again"]').trigger('click')
    expect(document.body.textContent).toContain('Your books, chapters, revisions, and writing activity will not be changed.')

    const confirmButton = document.body.querySelector<HTMLButtonElement>('[data-testid="confirm-reset-bardwall"]')
    expect(confirmButton?.disabled).toBe(true)
    const confirmationInput = document.body.querySelector<HTMLInputElement>('[data-testid="reset-bardwall-confirmation"]')
    confirmationInput!.value = 'BARDWALL'
    confirmationInput!.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(confirmButton?.disabled).toBe(false)
    confirmButton?.click()
    await flushPromises()

    expect(wrapper.text()).toContain('Enter Bardwall')
    expect(JSON.parse(localStorage.getItem('bardwall-game-state') ?? '{}')).toEqual(createDefaultBardwallState())
    expect(routerReplace).toHaveBeenCalledWith({ name: 'bardwall' })
    wrapper.unmount()
  })

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

  it('lets the bard eat food from inventory before ending the day', async () => {
    saveBardwallState({
      ...createDefaultBardwallState(),
      hunger: 80,
      energy: 50,
      dailyGoal: { date: getBardwallDateKey(), wordCount: 500, wordsTold: 0, coinsEarned: 0, locked: false },
    })
    const wrapper = mount(BardwallView)

    await wrapper.get('[data-testid="enter-bardwall"]').trigger('click')
    await wrapper.get('[data-testid="eat-bread"]').trigger('click')

    expect(wrapper.get('[data-testid="inventory-message"]').text()).toContain('Brown bread eaten')
    expect(wrapper.text()).toContain('Hunger30 / 100')
    expect(wrapper.text()).toContain('Energy63 / 100')
    expect(JSON.parse(localStorage.getItem('bardwall-game-state') ?? '{}')).toMatchObject({
      hunger: 30,
      energy: 63,
      inventory: { bread: 0 },
    })
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
      heliconiaVisits: 1,
    })
  })

  it('lets a returning bard offer another flower for Heliconia’s counsel', async () => {
    saveBardwallState({
      ...createDefaultBardwallState(),
      heliconiaMet: true,
      heliconiaVisits: 1,
      caveUnlocked: true,
      inventory: { ...createDefaultBardwallState().inventory, flower: 1 },
      dailyGoal: { date: getBardwallDateKey(), wordCount: 500, wordsTold: 0, coinsEarned: 0, locked: false },
    })
    const wrapper = mount(BardwallView)

    await wrapper.get('[data-testid="enter-bardwall"]').trigger('click')
    await wrapper.get('[data-testid="map-shrine"]').trigger('click')
    expect(wrapper.text()).toContain('Place another flower on the shrine')
    await wrapper.get('[data-testid="offer-flower"]').trigger('click')

    expect(wrapper.text()).toContain('The goddess returns')
    expect(wrapper.text()).toContain(HELICONIA_PERSISTENCE_MESSAGES[0])
    expect(wrapper.text()).toContain('Carry her words back to town')
    expect(JSON.parse(localStorage.getItem('bardwall-game-state') ?? '{}')).toMatchObject({
      inventory: { flower: 0 },
      heliconiaVisits: 2,
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
