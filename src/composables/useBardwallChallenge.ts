import { computed, ref, type Ref } from 'vue'
import { loadOpenAIApiKey } from '@/lib/apiKeyStorage'
import {
  BARDWALL_CHALLENGE_CARDS,
  BARDWALL_FOOD_ITEMS,
  DEFAULT_BARDWALL_JUDGE_RUBRIC,
  DEFAULT_BARDWALL_ORLA_PROMPT,
  advanceBardwallChallengeDraft,
  countBardwallWords,
  getBardwallChallengeWordRange,
  resetBardwallChallenge,
  resolveBardwallChallenge,
  saveBardwallState,
  startBardwallChallenge,
  toggleBardwallChallengeCard,
  updateBardwallChallengeRules,
  type BardwallChallengeCardId,
  type BardwallChallengeScores,
  type BardwallChallengeWager,
  type BardwallFoodId,
  type BardwallState,
} from '@/lib/bardwall'
import { runBardwallStoryChallenge } from '@/lib/openai'

interface BardwallChallengeDependencies {
  loadApiKey: () => Promise<string | null>
  runChallenge: typeof runBardwallStoryChallenge
  saveState: (state: BardwallState) => void
  random: () => number
}

const defaultDependencies: BardwallChallengeDependencies = {
  loadApiKey: loadOpenAIApiKey,
  runChallenge: runBardwallStoryChallenge,
  saveState: saveBardwallState,
  random: Math.random,
}

function initialWagerChoice(state: BardwallState): string {
  if (state.coins >= 1) return 'coins:1'
  const item = BARDWALL_FOOD_ITEMS.find((candidate) => state.inventory[candidate.id] > 0)
  return item ? `item:${item.id}` : ''
}

export function useBardwallChallenge(
  game: Ref<BardwallState>,
  dependencies: BardwallChallengeDependencies = defaultDependencies,
) {
  const challengeGoalChoice = ref<100 | 250 | 500 | 1000>(250)
  const challengeWagerChoice = ref(initialWagerChoice(game.value))
  const challengeMessage = ref<string | null>(null)
  const judgingChallenge = ref(false)
  const customChallengeWager = ref('')
  const showChallengeRulesEditor = ref(false)
  const challengeJudgeRubricDraft = ref(game.value.challengeRules.judgeRubric)
  const challengeOrlaPromptDraft = ref(game.value.challengeRules.orlaPrompt)
  const previewChallengeCardId = ref<BardwallChallengeCardId | null>(null)

  const challengeCards = computed(() => game.value.challenge.cards.map((draftCard) => ({
    ...draftCard,
    card: BARDWALL_CHALLENGE_CARDS.find((card) => card.id === draftCard.cardId)!,
  })))
  const previewChallengeCard = computed(() => (
    BARDWALL_CHALLENGE_CARDS.find((card) => card.id === previewChallengeCardId.value) ?? null
  ))
  const challengeStakes = computed(() => {
    const wager = game.value.challenge.wager
    if (!wager) return null
    if (wager.type === 'coins') {
      const stake = `${wager.amount.toLocaleString()} ${wager.amount === 1 ? 'coin' : 'coins'}`
      const payout = `${(wager.amount * 2).toLocaleString()} coins`
      return {
        win: `Gain ${stake} (${payout} returned from the table).`,
        lose: `Lose ${stake}.`,
        draw: `Get your ${stake} back.`,
      }
    }
    const item = BARDWALL_FOOD_ITEMS.find((candidate) => candidate.id === wager.itemId)
    const label = item ? `${item.icon} ${item.name}` : 'wagered item'
    return {
      win: `Gain another ${label} (two returned from the table).`,
      lose: `Lose your ${label}.`,
      draw: `Get your ${label} back.`,
    }
  })
  const heldChallengeCards = computed(() => (
    game.value.challenge.cards.filter((card) => card.held).length
  ))
  const challengeStoryWordCount = computed(() => (
    countBardwallWords(game.value.challenge.playerStory)
  ))
  const challengeWordRange = computed(() => (
    getBardwallChallengeWordRange(game.value.challenge.goal)
  ))
  const challengeStoryInRange = computed(() => (
    challengeStoryWordCount.value >= challengeWordRange.value.minimum
    && challengeStoryWordCount.value <= challengeWordRange.value.maximum
  ))
  const challengeWordGuidance = computed(() => {
    if (challengeStoryWordCount.value < challengeWordRange.value.minimum) {
      const remaining = challengeWordRange.value.minimum - challengeStoryWordCount.value
      return `Write at least ${remaining.toLocaleString()} more ${remaining === 1 ? 'word' : 'words'}.`
    }
    if (challengeStoryWordCount.value > challengeWordRange.value.maximum) {
      const excess = challengeStoryWordCount.value - challengeWordRange.value.maximum
      return `Cut at least ${excess.toLocaleString()} ${excess === 1 ? 'word' : 'words'}.`
    }
    return 'Your story is within the challenge range.'
  })
  const challengeFoodWagers = computed(() => (
    BARDWALL_FOOD_ITEMS.filter((item) => game.value.inventory[item.id] > 0)
  ))
  const challengeWagerValid = computed(() => {
    const [type, value] = challengeWagerChoice.value.split(':')
    if (type === 'coins') {
      const amount = value === 'custom' ? Number(customChallengeWager.value) : Number(value)
      return Number.isInteger(amount) && amount >= 1 && amount <= game.value.coins
    }
    return type === 'item'
      && BARDWALL_FOOD_ITEMS.some((item) => item.id === value)
      && game.value.inventory[value as BardwallFoodId] > 0
  })
  const customChallengeWagerGuidance = computed(() => {
    if (challengeWagerChoice.value !== 'coins:custom') return null
    const amount = Number(customChallengeWager.value)
    if (!Number.isInteger(amount) || amount < 1) {
      return 'Enter a whole-number wager of at least 1 coin.'
    }
    if (amount > game.value.coins) {
      return `You only have ${game.value.coins.toLocaleString()} ${game.value.coins === 1 ? 'coin' : 'coins'}.`
    }
    return `Orla will match your ${amount.toLocaleString()}-coin wager.`
  })
  const challengeRulesValid = computed(() => (
    challengeJudgeRubricDraft.value.trim().length > 0
    && challengeJudgeRubricDraft.value.length <= 4000
    && challengeOrlaPromptDraft.value.trim().length > 0
    && challengeOrlaPromptDraft.value.length <= 4000
  ))

  const persist = (state: BardwallState) => {
    game.value = state
    dependencies.saveState(state)
  }

  const parseChallengeWager = (): BardwallChallengeWager | null => {
    const [type, value] = challengeWagerChoice.value.split(':')
    if (type === 'coins') {
      return {
        type: 'coins',
        amount: value === 'custom' ? Number(customChallengeWager.value) : Number(value),
      }
    }
    if (type === 'item' && BARDWALL_FOOD_ITEMS.some((item) => item.id === value)) {
      return { type: 'item', itemId: value as BardwallFoodId }
    }
    return null
  }

  const chooseAffordableChallengeWager = () => {
    challengeWagerChoice.value = initialWagerChoice(game.value)
  }

  const beginCoffeehouseChallenge = () => {
    const wager = parseChallengeWager()
    if (!wager || !challengeWagerValid.value) {
      challengeMessage.value = 'Choose a wager you can cover before the cards are dealt.'
      return
    }
    try {
      persist(startBardwallChallenge(
        game.value,
        challengeGoalChoice.value,
        wager,
        dependencies.random,
      ))
      challengeMessage.value = null
    } catch (error) {
      challengeMessage.value = error instanceof Error
        ? error.message
        : 'The wager could not be placed.'
    }
  }

  const toggleChallengeCard = (cardId: BardwallChallengeCardId) => {
    persist(toggleBardwallChallengeCard(game.value, cardId))
  }

  const openChallengeCardPreview = (cardId: BardwallChallengeCardId) => {
    previewChallengeCardId.value = cardId
  }

  const closeChallengeCardPreview = () => {
    previewChallengeCardId.value = null
  }

  const advanceChallengeDraft = () => {
    try {
      persist(advanceBardwallChallengeDraft(game.value, dependencies.random))
      challengeMessage.value = null
    } catch (error) {
      challengeMessage.value = error instanceof Error
        ? error.message
        : 'The cards refuse to settle.'
    }
  }

  const updateChallengeStory = (playerStory: string) => {
    persist({
      ...game.value,
      challenge: { ...game.value.challenge, playerStory },
    })
  }

  const judgeChallenge = async () => {
    if (!challengeStoryInRange.value) return

    let apiKey: string | null
    try {
      apiKey = await dependencies.loadApiKey()
    } catch (error) {
      challengeMessage.value = error instanceof Error
        ? error.message
        : 'The saved OpenAI API key could not be loaded.'
      return
    }
    if (!apiKey) {
      challengeMessage.value = 'Add your OpenAI API key in Settings before the other bards can take their seats.'
      return
    }

    judgingChallenge.value = true
    challengeMessage.value = null
    try {
      const result = await dependencies.runChallenge(apiKey, {
        goal: game.value.challenge.goal,
        cards: challengeCards.value.map(({ card }) => ({
          name: card.name,
          meaning: card.meaning,
        })),
        playerStory: game.value.challenge.playerStory,
        judgeRubric: game.value.challengeRules.judgeRubric,
        orlaPrompt: game.value.challengeRules.orlaPrompt,
      })
      persist(resolveBardwallChallenge(game.value, result))
    } catch (error) {
      challengeMessage.value = error instanceof Error
        ? error.message
        : 'The judge could not reach a decision.'
    } finally {
      judgingChallenge.value = false
    }
  }

  const beginAnotherChallenge = () => {
    persist(resetBardwallChallenge(game.value))
    chooseAffordableChallengeWager()
    challengeMessage.value = null
  }

  const openChallengeRulesEditor = () => {
    challengeJudgeRubricDraft.value = game.value.challengeRules.judgeRubric
    challengeOrlaPromptDraft.value = game.value.challengeRules.orlaPrompt
    showChallengeRulesEditor.value = true
  }

  const closeChallengeRulesEditor = () => {
    showChallengeRulesEditor.value = false
  }

  const restoreDefaultChallengeRules = () => {
    challengeJudgeRubricDraft.value = DEFAULT_BARDWALL_JUDGE_RUBRIC
    challengeOrlaPromptDraft.value = DEFAULT_BARDWALL_ORLA_PROMPT
  }

  const saveChallengeRules = () => {
    if (!challengeRulesValid.value) return
    persist(updateBardwallChallengeRules(game.value, {
      judgeRubric: challengeJudgeRubricDraft.value,
      orlaPrompt: challengeOrlaPromptDraft.value,
    }))
    showChallengeRulesEditor.value = false
    challengeMessage.value = 'The table rules have been changed. Tamsin looks troubled; Orla looks even more so.'
  }

  const resetChallengeUi = () => {
    challengeGoalChoice.value = 250
    chooseAffordableChallengeWager()
    customChallengeWager.value = ''
    challengeMessage.value = null
    judgingChallenge.value = false
    challengeJudgeRubricDraft.value = game.value.challengeRules.judgeRubric
    challengeOrlaPromptDraft.value = game.value.challengeRules.orlaPrompt
    showChallengeRulesEditor.value = false
    previewChallengeCardId.value = null
  }

  const wagerLabel = (wager: BardwallChallengeWager | null) => {
    if (!wager) return 'No wager'
    if (wager.type === 'coins') {
      return `${wager.amount} ${wager.amount === 1 ? 'coin' : 'coins'}`
    }
    return BARDWALL_FOOD_ITEMS.find((item) => item.id === wager.itemId)?.name ?? 'one item'
  }

  const scoreTotal = (scores: BardwallChallengeScores, lengthPenalty = 0) => (
    Math.max(0, Object.values(scores).reduce((total, score) => total + score, 0) - lengthPenalty)
  )

  return {
    challengeGoalChoice,
    challengeWagerChoice,
    challengeMessage,
    judgingChallenge,
    customChallengeWager,
    showChallengeRulesEditor,
    challengeJudgeRubricDraft,
    challengeOrlaPromptDraft,
    previewChallengeCardId,
    challengeCards,
    previewChallengeCard,
    challengeStakes,
    heldChallengeCards,
    challengeStoryWordCount,
    challengeWordRange,
    challengeStoryInRange,
    challengeWordGuidance,
    challengeFoodWagers,
    challengeWagerValid,
    customChallengeWagerGuidance,
    challengeRulesValid,
    beginCoffeehouseChallenge,
    toggleChallengeCard,
    openChallengeCardPreview,
    closeChallengeCardPreview,
    advanceChallengeDraft,
    updateChallengeStory,
    judgeChallenge,
    beginAnotherChallenge,
    openChallengeRulesEditor,
    closeChallengeRulesEditor,
    restoreDefaultChallengeRules,
    saveChallengeRules,
    resetChallengeUi,
    wagerLabel,
    scoreTotal,
  }
}
