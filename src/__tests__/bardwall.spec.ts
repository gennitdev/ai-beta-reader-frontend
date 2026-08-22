// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  BARDWALL_STORAGE_KEY,
  BARDWALL_CHALLENGE_CARDS,
  HELICONIA_PERSISTENCE_MESSAGES,
  calculateBardwallPay,
  createDefaultBardwallState,
  drinkWyrmPotion,
  eatBardwallFood,
  getBardwallDateKey,
  getBardwallChallengeWordRange,
  getBardwallPassages,
  healBardAtApothecary,
  loadBardwallState,
  offerFlowerToHeliconia,
  purchaseBardwallFood,
  purchaseBardwallFlower,
  advanceBardwallChallengeDraft,
  appendBardwallLastWordExchange,
  resolveBardwallChallenge,
  resetBardwallState,
  resolveBardwallNight,
  saveBardwallState,
  startBardwallChallenge,
  startBardwallLastWordStory,
  toggleBardwallChallengeCard,
  updateBardwallChallengeRules,
  updateBardwallLastWordDraft,
} from '@/lib/bardwall'

afterEach(() => localStorage.clear())

describe('Bardwall game helpers', () => {
  it('extracts newly added story passages from a revision', () => {
    expect(getBardwallPassages('The moon was pale.', 'The moon was very bright.')).toEqual([
      { text: 'very bright', wordCount: 2 },
    ])
  })

  it('makes the daily word goal worth exactly one night at the inn', () => {
    expect(calculateBardwallPay(0, 500)).toBe(0)
    expect(calculateBardwallPay(250, 500)).toBe(50)
    expect(calculateBardwallPay(500, 500)).toBe(100)
    expect(calculateBardwallPay(750, 500)).toBe(150)
  })

  it('uses the writer local calendar day for daily goals', () => {
    expect(getBardwallDateKey(new Date(2026, 6, 31, 23, 30))).toBe('2026-07-31')
  })

  it('gives every challenge category a ten-percent word range', () => {
    expect(getBardwallChallengeWordRange(100)).toEqual({ minimum: 90, maximum: 110 })
    expect(getBardwallChallengeWordRange(250)).toEqual({ minimum: 225, maximum: 275 })
    expect(getBardwallChallengeWordRange(500)).toEqual({ minimum: 450, maximum: 550 })
    expect(getBardwallChallengeWordRange(1000)).toEqual({ minimum: 900, maximum: 1100 })
  })

  it('persists progress and safely handles invalid storage', () => {
    saveBardwallState({
      ...createDefaultBardwallState(),
      coins: 7,
      storiesTold: 2,
      totalWordsTold: 340,
      dailyGoal: { date: '2026-07-31', wordCount: 500, wordsTold: 340, coinsEarned: 68, locked: true },
      toldPassageIds: ['revision-1:0'],
    })
    expect(loadBardwallState()).toMatchObject({
      coins: 7,
      dailyGoal: { wordCount: 500, wordsTold: 340, locked: true },
      toldPassageIds: ['revision-1:0'],
    })

    localStorage.setItem(BARDWALL_STORAGE_KEY, 'not-json')
    expect(loadBardwallState()).toEqual(createDefaultBardwallState())
  })

  it('resets all Bardwall progress to a new game', () => {
    saveBardwallState({
      ...createDefaultBardwallState(),
      coins: 240,
      day: 6,
      caveUnlocked: true,
      storiesTold: 9,
      inventory: { ...createDefaultBardwallState().inventory, bread: 4, flower: 1 },
    })

    expect(resetBardwallState()).toEqual(createDefaultBardwallState())
    expect(loadBardwallState()).toEqual(createDefaultBardwallState())
  })

  it('gives existing Bardwall saves the starter inventory when migrating', () => {
    localStorage.setItem(BARDWALL_STORAGE_KEY, JSON.stringify({ coins: 9, storiesTold: 1 }))

    expect(loadBardwallState()).toMatchObject({
      coins: 9,
      day: 1,
      energy: 100,
      hunger: 0,
      inventory: { tent: 1, bread: 1, cheese: 1 },
    })
  })

  it('keeps legacy challenge results readable under the new rubric', () => {
    const legacy = createDefaultBardwallState() as unknown as Record<string, unknown>
    legacy.challenge = {
      phase: 'result',
      goal: 100,
      wager: { type: 'coins', amount: 1 },
      cards: BARDWALL_CHALLENGE_CARDS.slice(0, 3).map((card) => ({ cardId: card.id, held: true })),
      drawNumber: 1,
      playerStory: 'An older submitted story.',
      result: {
        outcome: 'lose',
        rivalStory: 'An older rival story.',
        explanation: 'An older decision.',
        playerScores: { cards: 7, coherence: 6, invention: 5, language: 8, length: 10 },
        rivalScores: { cards: 8, coherence: 7, invention: 6, language: 8, length: 10 },
      },
    }
    localStorage.setItem(BARDWALL_STORAGE_KEY, JSON.stringify(legacy))

    expect(loadBardwallState().challenge.result).toMatchObject({
      playerScores: {
        sceneSpecificity: 5,
        characterAgency: 5,
        narrativeMovement: 6,
        craftCoherence: 7,
        promptIntegration: 7,
      },
      playerLengthPenalty: 0,
    })
  })

  it('buys food and keeps it in the persistent inventory', () => {
    const state = { ...createDefaultBardwallState(), coins: 30 }
    const purchased = purchaseBardwallFood(state, 'bread')

    expect(purchased.coins).toBe(18)
    expect(purchased.inventory.bread).toBe(2)
    expect(() => purchaseBardwallFood(createDefaultBardwallState(), 'stew')).toThrow('Not enough coins')
  })

  it('lets the bard eat carried food immediately', () => {
    const initial = { ...createDefaultBardwallState(), hunger: 80, energy: 50 }
    const fed = eatBardwallFood(initial, 'bread')

    expect(fed).toMatchObject({ hunger: 30, energy: 63 })
    expect(fed.inventory.bread).toBe(0)
    expect(() => eatBardwallFood(fed, 'bread')).toThrow('Brown bread is not in your inventory')
  })

  it('persists custom instructions for the judge and Orla', () => {
    const customized = updateBardwallChallengeRules(createDefaultBardwallState(), {
      judgeRubric: 'Reward jokes about geese.',
      orlaPrompt: 'Write a solemn tale about a turnip.',
    })
    saveBardwallState(customized)

    expect(loadBardwallState().challengeRules).toEqual({
      judgeRubric: 'Reward jokes about geese.',
      orlaPrompt: 'Write a solemn tale about a turnip.',
    })
  })

  it('buys and offers a flower to reveal Heliconia’s cave', () => {
    const purchased = purchaseBardwallFlower({ ...createDefaultBardwallState(), coins: 3 })
    expect(purchased).toMatchObject({ coins: 0, inventory: { flower: 1 } })

    const revealed = offerFlowerToHeliconia(purchased)
    expect(revealed).toMatchObject({ inventory: { flower: 0 }, heliconiaMet: true, heliconiaVisits: 1, caveUnlocked: true })
    const returnVisit = offerFlowerToHeliconia({
      ...revealed,
      inventory: { ...revealed.inventory, flower: 1 },
    })
    expect(returnVisit).toMatchObject({ inventory: { flower: 0 }, heliconiaVisits: 2, caveUnlocked: true })
    expect(() => offerFlowerToHeliconia(createDefaultBardwallState())).toThrow('A flower is required')
  })

  it('has ten distinct words of persistence from Heliconia', () => {
    expect(HELICONIA_PERSISTENCE_MESSAGES).toHaveLength(10)
    expect(new Set(HELICONIA_PERSISTENCE_MESSAGES).size).toBe(10)
  })

  it('runs the safe wager and three-card drafting rules', () => {
    let state = { ...createDefaultBardwallState(), coins: 10 }
    state = startBardwallChallenge(state, 250, { type: 'coins', amount: 5 }, () => 0)
    expect(state.coins).toBe(5)
    expect(state.challenge.cards).toHaveLength(3)
    expect(new Set(state.challenge.cards.map((card) => card.cardId)).size).toBe(3)

    for (const card of state.challenge.cards) state = toggleBardwallChallengeCard(state, card.cardId)
    state = advanceBardwallChallengeDraft(state, () => 0)
    expect(state.challenge.phase).toBe('write')

    state = resolveBardwallChallenge(state, {
      outcome: 'win', rivalStory: 'A rival tale.', explanation: 'A close victory.',
      playerScores: { sceneSpecificity: 9, characterAgency: 9, narrativeMovement: 9, craftCoherence: 9, promptIntegration: 10 },
      rivalScores: { sceneSpecificity: 8, characterAgency: 8, narrativeMovement: 8, craftCoherence: 8, promptIntegration: 10 },
      playerLengthPenalty: 0,
      rivalLengthPenalty: 0,
    })
    expect(state.coins).toBe(15)
    expect(state.challengesWon).toBe(1)
  })

  it('accepts any affordable whole-coin wager and rejects unsafe amounts', () => {
    const initial = { ...createDefaultBardwallState(), coins: 17 }
    const started = startBardwallChallenge(initial, 100, { type: 'coins', amount: 13 }, () => 0)

    expect(started.coins).toBe(4)
    expect(started.challenge.wager).toEqual({ type: 'coins', amount: 13 })
    expect(() => startBardwallChallenge(initial, 100, { type: 'coins', amount: 18 }, () => 0)).toThrow('not available')
    expect(() => startBardwallChallenge(initial, 100, { type: 'coins', amount: 1.5 }, () => 0)).toThrow('not available')
  })

  it('allows ordinary food wagers but never exposes quest items as challenge cards', () => {
    const initial = createDefaultBardwallState()
    const state = startBardwallChallenge(initial, 100, { type: 'item', itemId: 'bread' }, () => 0.5)
    expect(state.inventory.bread).toBe(0)
    expect(BARDWALL_CHALLENGE_CARDS).toHaveLength(18)
    expect(() => startBardwallChallenge(initial, 100, { type: 'coins', amount: 1 }, () => 0)).toThrow('not available')
  })

  it('persists unfinished Last Word stories, drafts, and equal-turn exchanges', () => {
    const created = startBardwallLastWordStory(createDefaultBardwallState(), {
      id: 'echo-1',
      now: '2026-07-31T12:00:00.000Z',
    })
    let state = updateBardwallLastWordDraft(created.state, created.storyId, 'Once beneath the roots')
    saveBardwallState(state)

    expect(loadBardwallState().lastWordStories[0]).toMatchObject({
      id: 'echo-1',
      title: 'An Unfinished Story',
      draft: 'Once beneath the roots',
      turns: [],
    })

    state = appendBardwallLastWordExchange(
      state,
      created.storyId,
      'Once beneath the roots',
      'something patient opened its eyes',
      '2026-08-01T12:00:00.000Z',
    )
    expect(state.lastWordStories[0]).toMatchObject({
      title: 'Once beneath the roots',
      draft: '',
      updatedAt: '2026-08-01T12:00:00.000Z',
      turns: [
        { speaker: 'bard', wordCount: 4 },
        { speaker: 'vesper', wordCount: 5 },
      ],
    })
  })

  it('applies every wyrm potion as an illness and lets the apothecary heal it', () => {
    const poisoned = drinkWyrmPotion(createDefaultBardwallState(), 'gold')
    expect(poisoned).toMatchObject({
      energy: 75,
      ailment: { potionId: 'gold', name: 'Gilded Fever' },
      triedPotionIds: ['gold'],
    })
    expect(() => drinkWyrmPotion(poisoned, 'blue')).toThrow('must be healed first')

    const healed = healBardAtApothecary(poisoned)
    expect(healed).toMatchObject({ energy: 100, ailment: null, triedPotionIds: ['gold'] })
  })

  it('consumes a full meal and applies lodging energy at the end of the day', () => {
    const state = {
      ...createDefaultBardwallState(),
      coins: 100,
      dailyGoal: { date: '2026-07-31', wordCount: 500, wordsTold: 500, coinsEarned: 100, locked: true },
    }
    const nextDay = resolveBardwallNight(state, 'inn', { bread: 1, cheese: 1 })

    expect(nextDay).toMatchObject({ coins: 0, day: 2, energy: 100, hunger: 0, dailyGoal: null })
    expect(nextDay.inventory).toMatchObject({ bread: 0, cheese: 0, tent: 1 })
    expect(nextDay.lastNight).toMatchObject({ lodging: 'inn', nourishment: 100 })
  })

  it('makes an underfed tent sleeper hungry and less energetic the next day', () => {
    const nextDay = resolveBardwallNight(createDefaultBardwallState(), 'tent', { bread: 1 })

    expect(nextDay).toMatchObject({ day: 2, hunger: 50, energy: 50 })
    expect(() => resolveBardwallNight(createDefaultBardwallState(), 'inn', {})).toThrow('Not enough coins for the inn')
  })

  it('normalizes malformed persisted progress without trusting stored shapes', () => {
    localStorage.setItem(BARDWALL_STORAGE_KEY, JSON.stringify({
      coins: -4,
      day: 0,
      energy: 999,
      hunger: -20,
      inventory: { bread: -2, cheese: 2.8, tent: 'unknown' },
      dailyGoal: { date: null, wordCount: '5', wordsTold: -2, coinsEarned: 'unknown', locked: 0 },
      toldPassageIds: [1, 'kept'],
      lastNight: { day: 0, lodging: 'road', nourishment: -2, hunger: -1, energy: 'unknown' },
      heliconiaMet: true,
      heliconiaVisits: 0,
      ailment: { potionId: 'unknown' },
      triedPotionIds: ['gold', 'unknown'],
      challenge: {
        phase: 'write',
        goal: 999,
        cards: [null, { cardId: 'unknown' }, { cardId: BARDWALL_CHALLENGE_CARDS[0].id }],
        drawNumber: -2,
        playerStory: 5,
        result: { outcome: 'unknown' },
      },
      challengeRules: { judgeRubric: ' ', orlaPrompt: null },
      lastWordStories: [
        null,
        { id: '' },
        {
          id: 'legacy-story',
          title: ' ',
          turns: [
            null,
            { speaker: 'cave', text: 'old roots answer', createdAt: 42 },
            { speaker: 'unknown', text: 'ignored' },
            { speaker: 'bard', text: ' ' },
          ],
        },
      ],
    }))

    const state = loadBardwallState()

    expect(state).toMatchObject({
      coins: 0,
      day: 1,
      energy: 100,
      hunger: 0,
      inventory: { bread: 0, cheese: 2, tent: 0 },
      dailyGoal: { date: '', wordCount: 5, wordsTold: 0, coinsEarned: 0, locked: false },
      toldPassageIds: ['kept'],
      lastNight: { day: 1, lodging: 'tent', nourishment: 0, hunger: 0, energy: 100 },
      heliconiaVisits: 1,
      ailment: null,
      triedPotionIds: ['gold'],
      challenge: {
        phase: 'setup',
        goal: 250,
        cards: [{ cardId: BARDWALL_CHALLENGE_CARDS[0].id, held: false }],
        drawNumber: 0,
        playerStory: '',
        result: null,
      },
    })
    expect(state.lastWordStories).toEqual([expect.objectContaining({
      id: 'legacy-story',
      title: 'An Unfinished Story',
      createdAt: '',
      updatedAt: '',
      draft: '',
      turns: [expect.objectContaining({ speaker: 'vesper', wordCount: 3, createdAt: '' })],
    })])
  })

  it('restores current challenge, ailment, rules, and Last Word formats', () => {
    const cards = BARDWALL_CHALLENGE_CARDS.slice(0, 3).map((card) => ({ cardId: card.id, held: false }))
    localStorage.setItem(BARDWALL_STORAGE_KEY, JSON.stringify({
      ailment: { potionId: 'blue' },
      challenge: {
        phase: 'result',
        goal: 500,
        wager: { type: 'coins', amount: 2 },
        cards,
        drawNumber: 2,
        playerStory: 'A finished story.',
        result: {
          outcome: 'draw',
          rivalStory: 7,
          explanation: null,
          playerScores: { sceneSpecificity: 12, characterAgency: -2, narrativeMovement: 4, craftCoherence: 8, promptIntegration: 6 },
          rivalScores: null,
          playerLengthPenalty: -1,
          rivalLengthPenalty: 2.9,
        },
      },
      challengeRules: { judgeRubric: '  Judge this.  ', orlaPrompt: '  Tell this.  ' },
      lastWordStories: [{
        id: 'current-story',
        title: 'Current title',
        createdAt: 'created',
        updatedAt: 'updated',
        draft: 'draft',
        turns: [{ speaker: 'bard', text: 'the bard speaks', createdAt: 'now' }],
      }],
    }))

    expect(loadBardwallState()).toMatchObject({
      ailment: { potionId: 'blue' },
      challenge: {
        phase: 'result',
        goal: 500,
        playerStory: 'A finished story.',
        result: {
          outcome: 'draw',
          rivalStory: '',
          explanation: '',
          playerScores: { sceneSpecificity: 10, characterAgency: 0, craftCoherence: 8 },
          playerLengthPenalty: 0,
          rivalLengthPenalty: 2,
        },
      },
      challengeRules: { judgeRubric: 'Judge this.', orlaPrompt: 'Tell this.' },
      lastWordStories: [{ title: 'Current title', turns: [{ speaker: 'bard', createdAt: 'now' }] }],
    })
  })

  it('covers rejected purchases, rules, potions, and food selections', () => {
    const state = createDefaultBardwallState()

    expect(() => purchaseBardwallFood(state, 'unknown' as never)).toThrow('Food not found')
    expect(() => eatBardwallFood(state, 'unknown' as never)).toThrow('Food not found')
    expect(() => purchaseBardwallFlower(state)).toThrow('Not enough coins')
    expect(() => updateBardwallChallengeRules(state, { judgeRubric: '', orlaPrompt: 'prompt' })).toThrow('required')
    expect(() => updateBardwallChallengeRules(state, { judgeRubric: 'x'.repeat(4001), orlaPrompt: 'prompt' })).toThrow('4,000')
    expect(() => startBardwallChallenge(state, 100, { type: 'item', itemId: 'flower' as never }, () => 0)).toThrow('not available')
    expect(() => drinkWyrmPotion(state, 'unknown' as never)).toThrow('Potion not found')
    expect(healBardAtApothecary(state)).toBe(state)
    expect(() => resolveBardwallNight(state, 'tent', { bread: 2 })).toThrow('Not enough Brown bread')
    expect(calculateBardwallPay(100, 0)).toBe(0)
    expect(getBardwallPassages('', '!!!')).toEqual([])
  })

  it('covers challenge no-ops, redraws, item draws, and losses', () => {
    const result = {
      outcome: 'draw' as const,
      rivalStory: 'Rival.',
      explanation: 'Even.',
      playerScores: { sceneSpecificity: 5, characterAgency: 5, narrativeMovement: 5, craftCoherence: 5, promptIntegration: 5 },
      rivalScores: { sceneSpecificity: 5, characterAgency: 5, narrativeMovement: 5, craftCoherence: 5, promptIntegration: 5 },
      playerLengthPenalty: 0,
      rivalLengthPenalty: 0,
    }
    const initial = createDefaultBardwallState()
    expect(toggleBardwallChallengeCard(initial, BARDWALL_CHALLENGE_CARDS[0].id)).toBe(initial)
    expect(advanceBardwallChallengeDraft(initial)).toBe(initial)
    expect(() => resolveBardwallChallenge(initial, result)).toThrow('wager not found')

    let challenge = startBardwallChallenge(initial, 100, { type: 'item', itemId: 'bread' }, () => 0)
    expect(() => advanceBardwallChallengeDraft(challenge, () => 0)).toThrow('Keep at least one card')
    challenge = toggleBardwallChallengeCard(challenge, challenge.challenge.cards[0].cardId)
    challenge = advanceBardwallChallengeDraft(challenge, () => 0)
    expect(challenge.challenge.drawNumber).toBe(2)

    const drawn = resolveBardwallChallenge(challenge, result)
    expect(drawn.inventory.bread).toBe(1)

    const lost = resolveBardwallChallenge(
      { ...challenge, challenge: { ...challenge.challenge, wager: { type: 'coins', amount: 3 } } },
      { ...result, outcome: 'lose' },
    )
    expect(lost.challengesLost).toBe(1)
    expect(lost.coins).toBe(challenge.coins)
  })

  it('covers Last Word validation, generated ids, long titles, and later exchanges', () => {
    const created = startBardwallLastWordStory(createDefaultBardwallState())
    expect(created.storyId).toBeTruthy()
    expect(updateBardwallLastWordDraft(created.state, 'missing', 'draft')).toEqual(created.state)
    expect(() => appendBardwallLastWordExchange(created.state, created.storyId, '', 'reply')).toThrow('Both voices')

    const first = appendBardwallLastWordExchange(
      created.state,
      created.storyId,
      'one two three four five six seven',
      'reply from Vesper',
      'first',
    )
    expect(first.lastWordStories[0].title).toBe('one two three four five six…')

    const second = appendBardwallLastWordExchange(first, created.storyId, 'another line', 'another reply', 'second')
    expect(second.lastWordStories[0].title).toBe(first.lastWordStories[0].title)
    expect(second.lastWordStories[0].turns).toHaveLength(4)
  })
})
