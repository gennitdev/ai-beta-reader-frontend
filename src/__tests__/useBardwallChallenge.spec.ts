import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBardwallChallenge } from '@/composables/useBardwallChallenge'
import {
  BARDWALL_CHALLENGE_CARDS,
  DEFAULT_BARDWALL_JUDGE_RUBRIC,
  DEFAULT_BARDWALL_ORLA_PROMPT,
  createDefaultBardwallState,
  type BardwallChallengeResult,
  type BardwallState,
} from '@/lib/bardwall'

const winningResult: BardwallChallengeResult = {
  outcome: 'win',
  rivalStory: 'Orla told a rival story.',
  explanation: 'The player used every card with greater specificity.',
  playerScores: {
    sceneSpecificity: 9,
    characterAgency: 9,
    narrativeMovement: 9,
    craftCoherence: 9,
    promptIntegration: 9,
  },
  rivalScores: {
    sceneSpecificity: 8,
    characterAgency: 8,
    narrativeMovement: 8,
    craftCoherence: 8,
    promptIntegration: 8,
  },
  playerLengthPenalty: 0,
  rivalLengthPenalty: 0,
}

function story(wordCount: number): string {
  return Array.from({ length: wordCount }, (_, index) => `word${index}`).join(' ')
}

function challengeReadyState(overrides: Partial<BardwallState> = {}): BardwallState {
  const state = createDefaultBardwallState()
  return {
    ...state,
    coins: 9,
    challenge: {
      phase: 'write',
      goal: 100,
      wager: { type: 'coins', amount: 1 },
      cards: BARDWALL_CHALLENGE_CARDS.slice(0, 3).map((card) => ({
        cardId: card.id,
        held: true,
      })),
      drawNumber: 1,
      playerStory: story(100),
      result: null,
    },
    ...overrides,
  }
}

function createFlow(state: BardwallState = createDefaultBardwallState()) {
  const game = ref(state)
  const loadApiKey = vi.fn(async () => 'sk-test')
  const runChallenge = vi.fn(async () => winningResult)
  const saveState = vi.fn()
  const flow = useBardwallChallenge(game, {
    loadApiKey,
    runChallenge,
    saveState,
    random: () => 0,
  })
  return { game, loadApiKey, runChallenge, saveState, flow }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useBardwallChallenge wagers and drafting', () => {
  it('chooses an affordable initial wager and validates custom amounts', () => {
    const withoutCoins = createFlow()
    expect(withoutCoins.flow.challengeWagerChoice.value).toBe('item:bread')
    expect(withoutCoins.flow.challengeWagerValid.value).toBe(true)

    const withCoins = createFlow({ ...createDefaultBardwallState(), coins: 17 })
    expect(withCoins.flow.challengeWagerChoice.value).toBe('coins:1')
    withCoins.flow.challengeWagerChoice.value = 'coins:custom'
    withCoins.flow.customChallengeWager.value = '18'
    expect(withCoins.flow.challengeWagerValid.value).toBe(false)
    expect(withCoins.flow.customChallengeWagerGuidance.value).toBe('You only have 17 coins.')
    withCoins.flow.customChallengeWager.value = '13'
    expect(withCoins.flow.challengeWagerValid.value).toBe(true)
    expect(withCoins.flow.customChallengeWagerGuidance.value).toBe(
      'Orla will match your 13-coin wager.',
    )
  })

  it('rejects unavailable wagers before changing persistent state', () => {
    const { game, saveState, flow } = createFlow()
    flow.challengeWagerChoice.value = 'coins:custom'
    flow.customChallengeWager.value = '2.5'

    flow.beginCoffeehouseChallenge()

    expect(game.value.challenge.phase).toBe('setup')
    expect(saveState).not.toHaveBeenCalled()
    expect(flow.challengeMessage.value).toBe(
      'Choose a wager you can cover before the cards are dealt.',
    )
  })

  it('places a custom wager and drives the card draft into writing', () => {
    const { game, saveState, flow } = createFlow({
      ...createDefaultBardwallState(),
      coins: 17,
    })
    flow.challengeGoalChoice.value = 100
    flow.challengeWagerChoice.value = 'coins:custom'
    flow.customChallengeWager.value = '13'

    flow.beginCoffeehouseChallenge()

    expect(game.value).toMatchObject({
      coins: 4,
      challenge: { phase: 'draft', goal: 100, wager: { type: 'coins', amount: 13 } },
    })
    expect(flow.challengeCards.value).toHaveLength(3)
    const firstCardId = flow.challengeCards.value[0].card.id
    flow.openChallengeCardPreview(firstCardId)
    expect(flow.previewChallengeCard.value?.id).toBe(firstCardId)
    flow.closeChallengeCardPreview()
    expect(flow.previewChallengeCard.value).toBeNull()

    for (const entry of flow.challengeCards.value) flow.toggleChallengeCard(entry.card.id)
    expect(flow.heldChallengeCards.value).toBe(3)
    flow.advanceChallengeDraft()
    expect(game.value.challenge.phase).toBe('write')
    expect(saveState).toHaveBeenCalledTimes(5)
  })

  it('reports draft progression errors without corrupting state', () => {
    const { game, saveState, flow } = createFlow({
      ...createDefaultBardwallState(),
      coins: 2,
    })
    flow.beginCoffeehouseChallenge()
    saveState.mockClear()

    flow.advanceChallengeDraft()

    expect(game.value.challenge.phase).toBe('draft')
    expect(flow.challengeMessage.value).toBe('Keep at least one card')
    expect(saveState).not.toHaveBeenCalled()
  })
})

describe('useBardwallChallenge writing and judging', () => {
  it('persists story edits and explains short, long, and qualifying drafts', () => {
    const { game, saveState, flow } = createFlow(challengeReadyState())

    flow.updateChallengeStory(story(89))
    expect(flow.challengeStoryWordCount.value).toBe(89)
    expect(flow.challengeWordGuidance.value).toBe('Write at least 1 more word.')
    flow.updateChallengeStory(story(111))
    expect(flow.challengeWordGuidance.value).toBe('Cut at least 1 word.')
    flow.updateChallengeStory(story(100))
    expect(flow.challengeStoryInRange.value).toBe(true)
    expect(flow.challengeWordGuidance.value).toBe('Your story is within the challenge range.')
    expect(game.value.challenge.playerStory).toBe(story(100))
    expect(saveState).toHaveBeenCalledTimes(3)
  })

  it('does not call authentication or the model for an ineligible story', async () => {
    const state = challengeReadyState()
    state.challenge.playerStory = 'too short'
    const { loadApiKey, runChallenge, flow } = createFlow(state)

    await flow.judgeChallenge()

    expect(loadApiKey).not.toHaveBeenCalled()
    expect(runChallenge).not.toHaveBeenCalled()
  })

  it('reports missing and unreadable API keys without placing the UI in a busy state', async () => {
    const missing = createFlow(challengeReadyState())
    missing.loadApiKey.mockResolvedValue(null)
    await missing.flow.judgeChallenge()
    expect(missing.flow.challengeMessage.value).toContain('Add your OpenAI API key')
    expect(missing.flow.judgingChallenge.value).toBe(false)

    const unreadable = createFlow(challengeReadyState())
    unreadable.loadApiKey.mockRejectedValue('secure storage unavailable')
    await unreadable.flow.judgeChallenge()
    expect(unreadable.flow.challengeMessage.value).toBe(
      'The saved OpenAI API key could not be loaded.',
    )
    expect(unreadable.runChallenge).not.toHaveBeenCalled()
  })

  it('submits configured cards and rules, resolves rewards, and clears busy state', async () => {
    const { game, runChallenge, saveState, flow } = createFlow(challengeReadyState())
    let resolveChallenge!: (result: BardwallChallengeResult) => void
    runChallenge.mockImplementationOnce(() => new Promise((resolve) => {
      resolveChallenge = resolve
    }))

    const judging = flow.judgeChallenge()
    await vi.waitFor(() => expect(flow.judgingChallenge.value).toBe(true))
    resolveChallenge(winningResult)
    await judging

    expect(runChallenge).toHaveBeenCalledWith('sk-test', {
      goal: 100,
      cards: BARDWALL_CHALLENGE_CARDS.slice(0, 3).map((card) => ({
        name: card.name,
        meaning: card.meaning,
      })),
      playerStory: story(100),
      judgeRubric: DEFAULT_BARDWALL_JUDGE_RUBRIC,
      orlaPrompt: DEFAULT_BARDWALL_ORLA_PROMPT,
    })
    expect(game.value).toMatchObject({
      coins: 11,
      challengesWon: 1,
      challenge: { phase: 'result', result: winningResult },
    })
    expect(saveState).toHaveBeenCalledOnce()
    expect(flow.judgingChallenge.value).toBe(false)
  })

  it('surfaces model failures and always clears busy state', async () => {
    const { runChallenge, saveState, flow } = createFlow(challengeReadyState())
    runChallenge.mockRejectedValue(new Error('judge unavailable'))

    await flow.judgeChallenge()

    expect(flow.challengeMessage.value).toBe('judge unavailable')
    expect(flow.judgingChallenge.value).toBe(false)
    expect(saveState).not.toHaveBeenCalled()
  })
})

describe('useBardwallChallenge rules and reset', () => {
  it('edits, validates, restores, and persists table rules', () => {
    const { game, saveState, flow } = createFlow()
    flow.openChallengeRulesEditor()
    expect(flow.showChallengeRulesEditor.value).toBe(true)
    flow.challengeJudgeRubricDraft.value = '  Reward comic timing.  '
    flow.challengeOrlaPromptDraft.value = '  Write about a goose.  '
    expect(flow.challengeRulesValid.value).toBe(true)

    flow.saveChallengeRules()

    expect(game.value.challengeRules).toEqual({
      judgeRubric: 'Reward comic timing.',
      orlaPrompt: 'Write about a goose.',
    })
    expect(saveState).toHaveBeenCalledOnce()
    expect(flow.showChallengeRulesEditor.value).toBe(false)
    expect(flow.challengeMessage.value).toContain('table rules have been changed')

    flow.openChallengeRulesEditor()
    flow.restoreDefaultChallengeRules()
    expect(flow.challengeJudgeRubricDraft.value).toBe(DEFAULT_BARDWALL_JUDGE_RUBRIC)
    expect(flow.challengeOrlaPromptDraft.value).toBe(DEFAULT_BARDWALL_ORLA_PROMPT)
    flow.closeChallengeRulesEditor()
    expect(flow.showChallengeRulesEditor.value).toBe(false)
  })

  it('resets completed challenge and transient UI state using current inventory', () => {
    const state = challengeReadyState({ coins: 0 })
    state.challenge = { ...state.challenge, phase: 'result', result: winningResult }
    const { game, saveState, flow } = createFlow(state)
    flow.challengeMessage.value = 'old error'
    flow.customChallengeWager.value = '99'
    flow.challengeGoalChoice.value = 1000

    flow.beginAnotherChallenge()
    expect(game.value.challenge.phase).toBe('setup')
    expect(flow.challengeWagerChoice.value).toBe('item:bread')
    expect(flow.challengeMessage.value).toBeNull()
    expect(saveState).toHaveBeenCalledOnce()

    flow.resetChallengeUi()
    expect(flow.challengeGoalChoice.value).toBe(250)
    expect(flow.customChallengeWager.value).toBe('')
    expect(flow.previewChallengeCard.value).toBeNull()
  })

  it('formats stakes, wager labels, and score totals for the template', () => {
    const coinState = challengeReadyState()
    const coin = createFlow(coinState)
    expect(coin.flow.challengeStakes.value).toEqual({
      win: 'Gain 1 coin (2 coins returned from the table).',
      lose: 'Lose 1 coin.',
      draw: 'Get your 1 coin back.',
    })
    expect(coin.flow.wagerLabel({ type: 'coins', amount: 2 })).toBe('2 coins')
    expect(coin.flow.wagerLabel(null)).toBe('No wager')
    expect(coin.flow.scoreTotal(winningResult.playerScores, 50)).toBe(0)

    const itemState = challengeReadyState()
    itemState.challenge.wager = { type: 'item', itemId: 'bread' }
    const item = createFlow(itemState)
    expect(item.flow.challengeStakes.value?.win).toContain('🍞 Brown bread')
    expect(item.flow.wagerLabel(itemState.challenge.wager)).toBe('Brown bread')
  })
})
