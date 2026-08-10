<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeftIcon, CurrencyDollarIcon, MoonIcon } from '@heroicons/vue/24/outline'
import { useDatabase } from '@/composables/useDatabase'
import BardwallTownMap, { type BardwallLocation } from '@/components/bardwall/BardwallTownMap.vue'
import BardwallAmphitheater from '@/components/bardwall/BardwallAmphitheater.vue'
import BardwallMorning from '@/components/bardwall/BardwallMorning.vue'
import BardwallReward from '@/components/bardwall/BardwallReward.vue'
import type { ChapterRevision } from '@/lib/database'
import type { RevisionOffering, BardwallScreen } from '@/types/bardwallView'
import {
  BARDWALL_INN_PRICE,
  BARDWALL_DAILY_NOURISHMENT,
  BARDWALL_FLOWER_PRICE,
  BARDWALL_CAFE_ITEMS,
  BARDWALL_CHALLENGE_CARDS,
  BARDWALL_FOOD_ITEMS,
  BARDWALL_MARKET_ITEMS,
  BARDWALL_STORY_RUBRIC,
  BARDWALL_WYRM_POTIONS,
  DEFAULT_BARDWALL_JUDGE_RUBRIC,
  DEFAULT_BARDWALL_ORLA_PROMPT,
  HELICONIA_PERSISTENCE_MESSAGES,
  calculateBardwallPay,
  advanceBardwallChallengeDraft,
  appendBardwallLastWordExchange,
  countBardwallWords,
  eatBardwallFood,
  getBardwallDateKey,
  getBardwallChallengeWordRange,
  getBardwallPassages,
  healBardAtApothecary,
  loadBardwallState,
  offerFlowerToHeliconia,
  purchaseBardwallFood,
  purchaseBardwallFlower,
  resetBardwallChallenge,
  resolveBardwallChallenge,
  drinkWyrmPotion,
  resolveBardwallNight,
  resetBardwallState,
  saveBardwallState,
  startBardwallChallenge,
  startBardwallLastWordStory,
  toggleBardwallChallengeCard,
  updateBardwallChallengeRules,
  updateBardwallLastWordDraft,
  type BardwallFoodId,
  type BardwallLodging,
  type BardwallPotionId,
  type BardwallChallengeWager,
  type BardwallChallengeScores,
} from '@/lib/bardwall'
import { continueBardwallLastWordStory, runBardwallStoryChallenge } from '@/lib/openai'
import { getBardwallCardImage, getBardwallPlaceImage, getBardwallPotionImage } from '@/lib/bardwallAssets'

const routeLocations = new Set<BardwallLocation>(['amphitheater', 'market', 'inn', 'shrine', 'apothecary', 'camp', 'challenge', 'cave'])

const { books, loadBooks, getBookRevisionActivity, getChapterRevisions } = useDatabase()
const route = useRoute()
const router = useRouter()
const screen = ref<BardwallScreen>('gate')
const hasEntered = ref(false)
const game = ref(loadBardwallState())
const offerings = ref<RevisionOffering[]>([])
const loadingOfferings = ref(false)
const offeringError = ref<string | null>(null)
const selectedOfferingId = ref<string | null>(null)
const selectedPassageIndexes = ref<number[]>([])
const lastReward = ref({ coins: 0, words: 0 })
const goalChoice = ref<number | 'custom'>(500)
const customGoal = ref('')
const marketMessage = ref<string | null>(null)
const inventoryMessage = ref<string | null>(null)
const lodgingChoice = ref<BardwallLodging>('tent')
const mealSelection = ref<Partial<Record<BardwallFoodId, number>>>({})
const nightError = ref<string | null>(null)
const innAdviceShown = ref(false)
const heliconiaEncounterActive = ref(false)
const heliconiaReturnVisit = ref(false)
const shrineMessage = ref<string | null>(null)
const treatmentMessage = ref<string | null>(null)
const showResetDialog = ref(false)
const resetConfirmation = ref('')
const challengeGoalChoice = ref<100 | 250 | 500 | 1000>(250)
const challengeWagerChoice = ref(game.value.coins >= 1
  ? 'coins:1'
  : `item:${BARDWALL_FOOD_ITEMS.find((item) => game.value.inventory[item.id] > 0)?.id ?? ''}`)
const challengeMessage = ref<string | null>(null)
const judgingChallenge = ref(false)
const customChallengeWager = ref('')
const showChallengeRulesEditor = ref(false)
const challengeJudgeRubricDraft = ref(game.value.challengeRules.judgeRubric)
const challengeOrlaPromptDraft = ref(game.value.challengeRules.orlaPrompt)
const selectedLastWordStoryId = ref<string | null>(null)
const lastWordMessage = ref<string | null>(null)
const vesperSpeaking = ref(false)
const previewChallengeCardId = ref<typeof BARDWALL_CHALLENGE_CARDS[number]['id'] | null>(null)

const selectedOffering = computed(() => offerings.value.find((item) => item.id === selectedOfferingId.value) ?? null)
const selectedPassages = computed(() => selectedOffering.value?.passages.filter((_, index) => selectedPassageIndexes.value.includes(index)) ?? [])
const selectedWordCount = computed(() => selectedPassages.value.reduce((total, passage) => total + passage.wordCount, 0))
const todayKey = computed(() => getBardwallDateKey())
const dailyGoal = computed(() => game.value.dailyGoal?.date === todayKey.value ? game.value.dailyGoal : null)
const chosenGoal = computed(() => goalChoice.value === 'custom' ? Number(customGoal.value) : goalChoice.value)
const validChosenGoal = computed(() => Number.isFinite(chosenGoal.value) && chosenGoal.value > 0)
const expectedPay = computed(() => calculateBardwallPay(selectedWordCount.value, dailyGoal.value?.wordCount ?? 0))
const dailyProgress = computed(() => {
  if (!dailyGoal.value) return 0
  return Math.min(100, (dailyGoal.value.wordsTold / dailyGoal.value.wordCount) * 100)
})
const selectedNourishment = computed(() => BARDWALL_FOOD_ITEMS.reduce((total, item) => (
  total + item.nourishment * (mealSelection.value[item.id] ?? 0)
), 0))
const nourishmentDeficit = computed(() => Math.max(0, BARDWALL_DAILY_NOURISHMENT - selectedNourishment.value))
const foodInventory = computed(() => BARDWALL_FOOD_ITEMS.filter((item) => game.value.inventory[item.id] > 0))
const challengeCards = computed(() => game.value.challenge.cards.map((draftCard) => ({
  ...draftCard,
  card: BARDWALL_CHALLENGE_CARDS.find((card) => card.id === draftCard.cardId)!,
})))
const previewChallengeCard = computed(() => BARDWALL_CHALLENGE_CARDS.find((card) => card.id === previewChallengeCardId.value) ?? null)
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
const heldChallengeCards = computed(() => game.value.challenge.cards.filter((card) => card.held).length)
const challengeStoryWordCount = computed(() => countBardwallWords(game.value.challenge.playerStory))
const challengeWordRange = computed(() => getBardwallChallengeWordRange(game.value.challenge.goal))
const challengeStoryInRange = computed(() => challengeStoryWordCount.value >= challengeWordRange.value.minimum && challengeStoryWordCount.value <= challengeWordRange.value.maximum)
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
const challengeFoodWagers = computed(() => BARDWALL_FOOD_ITEMS.filter((item) => game.value.inventory[item.id] > 0))
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
  if (!Number.isInteger(amount) || amount < 1) return 'Enter a whole-number wager of at least 1 coin.'
  if (amount > game.value.coins) return `You only have ${game.value.coins.toLocaleString()} ${game.value.coins === 1 ? 'coin' : 'coins'}.`
  return `Orla will match your ${amount.toLocaleString()}-coin wager.`
})
const challengeRulesValid = computed(() => (
  challengeJudgeRubricDraft.value.trim().length > 0
  && challengeJudgeRubricDraft.value.length <= 4000
  && challengeOrlaPromptDraft.value.trim().length > 0
  && challengeOrlaPromptDraft.value.length <= 4000
))
const lastWordStories = computed(() => [...game.value.lastWordStories].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
const selectedLastWordStory = computed(() => game.value.lastWordStories.find((story) => story.id === selectedLastWordStoryId.value) ?? null)
const lastWordDraftCount = computed(() => countBardwallWords(selectedLastWordStory.value?.draft ?? ''))
const heliconiaMessage = computed(() => {
  const messageIndex = Math.max(0, game.value.heliconiaVisits - 2) % HELICONIA_PERSISTENCE_MESSAGES.length
  return HELICONIA_PERSISTENCE_MESSAGES[messageIndex]
})
const canResetBardwall = computed(() => resetConfirmation.value.trim() === 'BARDWALL')

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(value))
const coinLabel = (value: number) => `${value} ${value === 1 ? 'coin' : 'coins'}`

const loadOfferings = async () => {
  loadingOfferings.value = true
  offeringError.value = null
  try {
    await loadBooks()
    const allOfferings: RevisionOffering[] = []
    for (const book of books.value) {
      const activity = (await getBookRevisionActivity(book.id))
        .filter((item) => item.activity_type === 'save' && item.revision_available)
        .reverse()
        .slice(0, 5)

      const revisionsByChapter = new Map<string, ChapterRevision[]>()
      for (const event of activity) {
        if (!revisionsByChapter.has(event.chapter_id)) {
          revisionsByChapter.set(event.chapter_id, await getChapterRevisions(event.chapter_id))
        }
        const revisions = revisionsByChapter.get(event.chapter_id) ?? []
        const index = revisions.findIndex((revision) => revision.id === event.id)
        const revision = revisions[index]
        if (!revision) continue
        const previous = revisions[index + 1]
        if (revision.discarded_at || previous?.discarded_at) continue
        const passages = getBardwallPassages(previous?.text ?? '', revision.text)
          .map((passage, passageIndex) => ({ ...passage, id: `${revision.id}:${passageIndex}` }))
          .filter((passage) => !game.value.toldPassageIds.includes(passage.id))
        if (!passages.length) continue
        allOfferings.push({
          id: revision.id,
          bookTitle: book.title,
          chapterTitle: event.chapter_title || revision.title || 'Untitled chapter',
          createdAt: event.created_at,
          passages,
          wordCount: passages.reduce((total, passage) => total + passage.wordCount, 0),
        })
      }
    }
    offerings.value = allOfferings
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12)
  } catch (error) {
    console.error('Failed to gather Bardwall stories:', error)
    offeringError.value = 'The town crier could not find your recent stories.'
  } finally {
    loadingOfferings.value = false
  }
}

const routeLocation = () => typeof route.params.location === 'string' ? route.params.location : null

const syncScreenFromRoute = async () => {
  const location = routeLocation()
  const activity = typeof route.params.activity === 'string' ? route.params.activity : null
  if (!location) {
    if (hasEntered.value) screen.value = 'town'
    return
  }
  if (!routeLocations.has(location as BardwallLocation)) {
    await router.replace({ name: 'bardwall' })
    return
  }

  hasEntered.value = true
  if (location === 'cave' && activity === 'wyrm') {
    screen.value = 'wyrm'
    return
  }
  if (location === 'cave' && activity === 'last-word') {
    screen.value = 'last-word'
    return
  }
  screen.value = location as BardwallLocation
  if (location === 'amphitheater' && !offerings.value.length && !loadingOfferings.value) {
    await loadOfferings()
  }
}

const goToTown = async () => {
  screen.value = 'town'
  await router.push({ name: 'bardwall' })
}

const goToBooks = async () => {
  await router.push({ name: 'books' })
}

const goToLocation = async (location: BardwallLocation) => {
  screen.value = location
  await router.push({ name: 'bardwall-location', params: { location } })
}

const goToWyrmGame = async () => {
  screen.value = 'wyrm'
  await router.push({ name: 'bardwall-location', params: { location: 'cave', activity: 'wyrm' } })
}

const goToLastWordGame = async () => {
  screen.value = 'last-word'
  selectedLastWordStoryId.value = null
  lastWordMessage.value = null
  await router.push({ name: 'bardwall-location', params: { location: 'cave', activity: 'last-word' } })
}

const enterBardwall = async () => {
  hasEntered.value = true
  if (routeLocation()) {
    await syncScreenFromRoute()
    return
  }
  screen.value = dailyGoal.value ? 'town' : 'goal'
  if (dailyGoal.value && !offerings.value.length) await loadOfferings()
}

const setDailyGoal = async () => {
  if (!validChosenGoal.value) return
  game.value = {
    ...game.value,
    dailyGoal: {
      date: todayKey.value,
      wordCount: Math.round(chosenGoal.value),
      wordsTold: 0,
      coinsEarned: 0,
      locked: false,
    },
  }
  saveBardwallState(game.value)
  screen.value = 'town'
  if (!offerings.value.length) await loadOfferings()
}

const selectOffering = (offering: RevisionOffering) => {
  selectedOfferingId.value = offering.id
  selectedPassageIndexes.value = offering.passages.map((_, index) => index)
}

const togglePassage = (index: number) => {
  selectedPassageIndexes.value = selectedPassageIndexes.value.includes(index)
    ? selectedPassageIndexes.value.filter((item) => item !== index)
    : [...selectedPassageIndexes.value, index]
}

const tellStory = () => {
  if (!selectedOffering.value || selectedWordCount.value === 0) return
  const words = selectedWordCount.value
  const coins = expectedPay.value
  const toldPassageIds = selectedPassages.value.map((passage) => passage.id)
  const goal = dailyGoal.value
  if (!goal) return
  game.value = {
    ...game.value,
    coins: game.value.coins + coins,
    storiesTold: game.value.storiesTold + 1,
    totalWordsTold: game.value.totalWordsTold + words,
    dailyGoal: {
      ...goal,
      wordsTold: goal.wordsTold + words,
      coinsEarned: goal.coinsEarned + coins,
      locked: true,
    },
    toldPassageIds: [...new Set([...game.value.toldPassageIds, ...toldPassageIds])],
  }
  saveBardwallState(game.value)
  offerings.value = offerings.value
    .map((offering) => {
      if (offering.id !== selectedOffering.value?.id) return offering
      const passages = offering.passages.filter((passage) => !toldPassageIds.includes(passage.id))
      return { ...offering, passages, wordCount: passages.reduce((total, passage) => total + passage.wordCount, 0) }
    })
    .filter((offering) => offering.passages.length > 0)
  lastReward.value = { coins, words }
  screen.value = 'reward'
}

const returnToTown = async () => {
  selectedOfferingId.value = null
  selectedPassageIndexes.value = []
  await goToTown()
}

const buyFood = (foodId: BardwallFoodId) => {
  try {
    game.value = purchaseBardwallFood(game.value, foodId)
    saveBardwallState(game.value)
    const item = BARDWALL_MARKET_ITEMS.find((candidate) => candidate.id === foodId)
    marketMessage.value = `${item?.name ?? 'Food'} added to your pack.`
  } catch {
    marketMessage.value = 'You do not have enough coin for that.'
  }
}

const buyCafeFood = (foodId: BardwallFoodId) => {
  try {
    game.value = purchaseBardwallFood(game.value, foodId)
    saveBardwallState(game.value)
    const item = BARDWALL_CAFE_ITEMS.find((candidate) => candidate.id === foodId)
    challengeMessage.value = `${item?.name ?? 'Refreshment'} added to your pack.`
  } catch {
    challengeMessage.value = 'You do not have enough coin for that.'
  }
}

const eatFood = (foodId: BardwallFoodId) => {
  const item = BARDWALL_FOOD_ITEMS.find((candidate) => candidate.id === foodId)
  if (!item) return
  const previousHunger = game.value.hunger
  const previousEnergy = game.value.energy
  try {
    game.value = eatBardwallFood(game.value, foodId)
    saveBardwallState(game.value)
    const hungerReduced = previousHunger - game.value.hunger
    const energyRestored = game.value.energy - previousEnergy
    const effects = [
      hungerReduced ? `${hungerReduced} less hunger` : null,
      energyRestored ? `${energyRestored} energy restored` : null,
    ].filter(Boolean).join(' · ')
    inventoryMessage.value = effects ? `${item.name} eaten · ${effects}.` : `${item.name} eaten. It was still worth having.`
  } catch (error) {
    inventoryMessage.value = error instanceof Error ? error.message : 'That food could not be eaten.'
  }
}

const parseChallengeWager = (): BardwallChallengeWager | null => {
  const [type, value] = challengeWagerChoice.value.split(':')
  if (type === 'coins') return { type: 'coins', amount: value === 'custom' ? Number(customChallengeWager.value) : Number(value) }
  if (type === 'item' && BARDWALL_FOOD_ITEMS.some((item) => item.id === value)) return { type: 'item', itemId: value as BardwallFoodId }
  return null
}

const chooseAffordableChallengeWager = () => {
  if (game.value.coins >= 1) {
    challengeWagerChoice.value = 'coins:1'
    return
  }

  const item = BARDWALL_FOOD_ITEMS.find((candidate) => game.value.inventory[candidate.id] > 0)
  challengeWagerChoice.value = item ? `item:${item.id}` : ''
}

const beginCoffeehouseChallenge = () => {
  const wager = parseChallengeWager()
  if (!wager || !challengeWagerValid.value) {
    challengeMessage.value = 'Choose a wager you can cover before the cards are dealt.'
    return
  }
  try {
    game.value = startBardwallChallenge(game.value, challengeGoalChoice.value, wager)
    saveBardwallState(game.value)
    challengeMessage.value = null
  } catch (error) {
    challengeMessage.value = error instanceof Error ? error.message : 'The wager could not be placed.'
  }
}

const toggleChallengeCard = (cardId: typeof BARDWALL_CHALLENGE_CARDS[number]['id']) => {
  game.value = toggleBardwallChallengeCard(game.value, cardId)
  saveBardwallState(game.value)
}

const openChallengeCardPreview = (cardId: typeof BARDWALL_CHALLENGE_CARDS[number]['id']) => {
  previewChallengeCardId.value = cardId
}

const closeChallengeCardPreview = () => {
  previewChallengeCardId.value = null
}

const advanceChallengeDraft = () => {
  try {
    game.value = advanceBardwallChallengeDraft(game.value)
    saveBardwallState(game.value)
    challengeMessage.value = null
  } catch (error) {
    challengeMessage.value = error instanceof Error ? error.message : 'The cards refuse to settle.'
  }
}

const updateChallengeStory = (event: Event) => {
  const playerStory = (event.target as HTMLTextAreaElement).value
  game.value = { ...game.value, challenge: { ...game.value.challenge, playerStory } }
  saveBardwallState(game.value)
}

const judgeChallenge = async () => {
  if (!challengeStoryInRange.value) return
  const apiKey = localStorage.getItem('openai_api_key')
  if (!apiKey) {
    challengeMessage.value = 'Add your OpenAI API key in Settings before the other bards can take their seats.'
    return
  }
  judgingChallenge.value = true
  challengeMessage.value = null
  try {
    const result = await runBardwallStoryChallenge(apiKey, {
      goal: game.value.challenge.goal,
      cards: challengeCards.value.map(({ card }) => ({ name: card.name, meaning: card.meaning })),
      playerStory: game.value.challenge.playerStory,
      judgeRubric: game.value.challengeRules.judgeRubric,
      orlaPrompt: game.value.challengeRules.orlaPrompt,
    })
    game.value = resolveBardwallChallenge(game.value, result)
    saveBardwallState(game.value)
  } catch (error) {
    challengeMessage.value = error instanceof Error ? error.message : 'The judge could not reach a decision.'
  } finally {
    judgingChallenge.value = false
  }
}

const beginAnotherChallenge = () => {
  game.value = resetBardwallChallenge(game.value)
  saveBardwallState(game.value)
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
  game.value = updateBardwallChallengeRules(game.value, {
    judgeRubric: challengeJudgeRubricDraft.value,
    orlaPrompt: challengeOrlaPromptDraft.value,
  })
  saveBardwallState(game.value)
  showChallengeRulesEditor.value = false
  challengeMessage.value = 'The table rules have been changed. Tamsin looks troubled; Orla looks even more so.'
}

const beginLastWordStory = () => {
  const created = startBardwallLastWordStory(game.value)
  game.value = created.state
  selectedLastWordStoryId.value = created.storyId
  lastWordMessage.value = null
  saveBardwallState(game.value)
}

const openLastWordStory = (storyId: string) => {
  selectedLastWordStoryId.value = storyId
  lastWordMessage.value = null
}

const returnToLastWordShelf = () => {
  selectedLastWordStoryId.value = null
  lastWordMessage.value = null
}

const updateLastWordDraft = (event: Event) => {
  if (!selectedLastWordStoryId.value) return
  const draft = (event.target as HTMLTextAreaElement).value
  game.value = updateBardwallLastWordDraft(game.value, selectedLastWordStoryId.value, draft)
  saveBardwallState(game.value)
}

const askVesperToContinue = async () => {
  const story = selectedLastWordStory.value
  if (!story || lastWordDraftCount.value < 1 || lastWordDraftCount.value > 2000) return
  const apiKey = localStorage.getItem('openai_api_key') ?? ''
  if (!apiKey) {
    lastWordMessage.value = 'Add your OpenAI API key in Settings before Vesper can answer.'
    return
  }

  const bardText = story.draft
  vesperSpeaking.value = true
  lastWordMessage.value = null
  try {
    const continuation = await continueBardwallLastWordStory(apiKey, {
      title: story.title,
      turns: story.turns.map((turn) => ({ speaker: turn.speaker, text: turn.text })),
      bardText,
      targetWords: lastWordDraftCount.value,
    })
    game.value = appendBardwallLastWordExchange(game.value, story.id, bardText, continuation)
    saveBardwallState(game.value)
    lastWordMessage.value = `You offered ${countBardwallWords(bardText).toLocaleString()} words. Vesper answered with ${countBardwallWords(continuation).toLocaleString()}. He still has the last word.`
  } catch (error) {
    lastWordMessage.value = error instanceof Error ? error.message : 'Vesper fell unexpectedly silent.'
  } finally {
    vesperSpeaking.value = false
  }
}

const formatLastWordDate = (value: string) => {
  if (!value) return 'Awaiting its first words'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date unknown'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

const wagerLabel = (wager: BardwallChallengeWager | null) => {
  if (!wager) return 'No wager'
  if (wager.type === 'coins') return `${wager.amount} ${wager.amount === 1 ? 'coin' : 'coins'}`
  return BARDWALL_FOOD_ITEMS.find((item) => item.id === wager.itemId)?.name ?? 'one item'
}
const scoreTotal = (scores: BardwallChallengeScores, lengthPenalty = 0) => Math.max(0, Object.values(scores).reduce((total, score) => total + score, 0) - lengthPenalty)

const buyFlower = () => {
  try {
    game.value = purchaseBardwallFlower(game.value)
    saveBardwallState(game.value)
    marketMessage.value = 'A red flower has been wrapped in damp paper and added to your pack.'
  } catch {
    marketMessage.value = 'You do not have enough coin for that.'
  }
}

const offerFlower = () => {
  try {
    const isReturnVisit = game.value.heliconiaMet
    game.value = offerFlowerToHeliconia(game.value)
    saveBardwallState(game.value)
    heliconiaReturnVisit.value = isReturnVisit
    heliconiaEncounterActive.value = true
    shrineMessage.value = null
  } catch {
    shrineMessage.value = 'The bare stone waits. You need a flower from the night market.'
  }
}

const drinkPotion = (potionId: BardwallPotionId) => {
  try {
    game.value = drinkWyrmPotion(game.value, potionId)
    saveBardwallState(game.value)
  } catch {
    // The encounter is disabled while an ailment is active.
  }
}

const receiveTreatment = () => {
  const ailmentName = game.value.ailment?.name
  if (!ailmentName) return
  game.value = healBardAtApothecary(game.value)
  saveBardwallState(game.value)
  treatmentMessage.value = `${ailmentName} treated. Your lost energy has been restored.`
}

const selectMapLocation = async (location: BardwallLocation) => {
  if (location === 'shrine') {
    heliconiaEncounterActive.value = false
    heliconiaReturnVisit.value = false
    shrineMessage.value = null
  }
  if (location === 'apothecary') treatmentMessage.value = null
  await goToLocation(location)
  if (location === 'amphitheater' && !offerings.value.length && !loadingOfferings.value) await loadOfferings()
}

const cancelNight = async () => {
  const location = routeLocation()
  if (location && routeLocations.has(location as BardwallLocation)) {
    screen.value = location as BardwallLocation
    return
  }
  await goToTown()
}

const changeMealQuantity = (foodId: BardwallFoodId, change: number) => {
  const current = mealSelection.value[foodId] ?? 0
  const next = Math.min(game.value.inventory[foodId], Math.max(0, current + change))
  mealSelection.value = { ...mealSelection.value, [foodId]: next }
}

const openNight = () => {
  lodgingChoice.value = game.value.coins >= BARDWALL_INN_PRICE ? 'inn' : 'tent'
  mealSelection.value = {}
  nightError.value = null
  screen.value = 'night'
}

const endDay = () => {
  try {
    game.value = resolveBardwallNight(game.value, lodgingChoice.value, mealSelection.value)
    saveBardwallState(game.value)
    screen.value = 'morning'
  } catch (error) {
    nightError.value = error instanceof Error ? error.message : 'The night could not be resolved.'
  }
}

const beginNextDay = () => {
  goalChoice.value = 500
  customGoal.value = ''
  screen.value = 'goal'
}

const closeResetDialog = () => {
  showResetDialog.value = false
  resetConfirmation.value = ''
}

const beginBardwallAgain = async () => {
  if (!canResetBardwall.value) return

  game.value = resetBardwallState()
  offerings.value = []
  offeringError.value = null
  selectedOfferingId.value = null
  selectedPassageIndexes.value = []
  lastReward.value = { coins: 0, words: 0 }
  goalChoice.value = 500
  customGoal.value = ''
  marketMessage.value = null
  inventoryMessage.value = null
  lodgingChoice.value = 'tent'
  mealSelection.value = {}
  nightError.value = null
  innAdviceShown.value = false
  heliconiaEncounterActive.value = false
  heliconiaReturnVisit.value = false
  shrineMessage.value = null
  treatmentMessage.value = null
  challengeGoalChoice.value = 250
  challengeWagerChoice.value = 'item:bread'
  customChallengeWager.value = ''
  challengeMessage.value = null
  challengeJudgeRubricDraft.value = DEFAULT_BARDWALL_JUDGE_RUBRIC
  challengeOrlaPromptDraft.value = DEFAULT_BARDWALL_ORLA_PROMPT
  showChallengeRulesEditor.value = false
  selectedLastWordStoryId.value = null
  lastWordMessage.value = null
  vesperSpeaking.value = false
  hasEntered.value = false
  screen.value = 'gate'
  closeResetDialog()
  await router.replace({ name: 'bardwall' })
}

onMounted(() => {
  game.value = loadBardwallState()
  void syncScreenFromRoute()
})

watch(() => [route.params.location, route.params.activity], () => {
  void syncScreenFromRoute()
})
</script>

<template>
  <main class="min-h-full overflow-y-auto bg-[#091712] text-stone-100">
    <section v-if="screen === 'gate'" class="relative flex min-h-full items-center justify-center overflow-hidden px-6 py-20">
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_top,#254538_0%,#091712_52%,#040907_100%)]"></div>
      <div class="relative max-w-2xl text-center">
        <p class="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">Beyond the haunted wood</p>
        <h1 class="mt-5 font-serif text-6xl font-bold text-stone-50 sm:text-7xl">Bardwall</h1>
        <p class="mx-auto mt-6 max-w-xl font-serif text-lg leading-8 text-stone-300">
          A town where stories keep the ghosts fed, the lanterns lit, and the living alive.
        </p>
        <button data-testid="enter-bardwall" class="mt-10 rounded-full border border-amber-300/70 bg-amber-300 px-8 py-3 font-semibold text-[#13241d] shadow-[0_0_35px_rgba(252,211,77,0.2)] transition hover:bg-amber-200" @click="enterBardwall">
          Enter Bardwall
        </button>
      </div>
    </section>

    <section v-else class="mx-auto min-h-full max-w-6xl px-4 pb-8 pt-20 sm:px-6 md:py-8 lg:px-8">
      <header class="flex flex-wrap items-center justify-between gap-4 border-b border-stone-700/60 pb-5">
        <div>
          <p class="text-xs uppercase tracking-[0.28em] text-amber-300">The haunted town</p>
          <h1 class="mt-1 font-serif text-3xl font-bold">Bardwall</h1>
        </div>
        <div class="flex flex-wrap items-center gap-4 text-sm text-stone-300">
          <button
            data-testid="back-to-books"
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg border border-stone-700 px-3 py-1.5 text-xs text-stone-300 transition hover:border-amber-300/60 hover:text-amber-200"
            @click="goToBooks"
          >
            <ArrowLeftIcon class="h-3.5 w-3.5" />
            Back to books
          </button>
          <span class="font-semibold text-stone-100">Day {{ game.day }}</span>
          <span class="inline-flex items-center gap-1.5"><CurrencyDollarIcon class="h-4 w-4 text-amber-300" /> {{ coinLabel(game.coins) }}</span>
          <span>⚡ {{ game.energy }} energy</span>
          <span>🍽️ {{ game.hunger }} hunger</span>
          <span v-if="game.ailment" class="font-semibold text-lime-300">{{ game.ailment.icon }} {{ game.ailment.name }}</span>
          <span>{{ game.storiesTold }} stories told</span>
          <button
            data-testid="begin-bardwall-again"
            type="button"
            class="rounded-lg border border-stone-700 px-3 py-1.5 text-xs text-stone-400 transition hover:border-stone-500 hover:text-stone-200"
            @click="showResetDialog = true"
          >
            Begin Bardwall Again
          </button>
        </div>
      </header>

      <div v-if="screen === 'goal'" class="flex min-h-[36rem] items-center justify-center py-10">
        <section class="w-full max-w-3xl rounded-2xl border border-amber-300/40 bg-stone-900/60 p-6 shadow-2xl sm:p-8">
          <p class="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">At the town gate</p>
          <h2 class="mt-3 font-serif text-4xl font-bold">Name today’s measure.</h2>
          <p class="mt-4 max-w-2xl font-serif text-lg leading-8 text-stone-300">
            Choose a daily word goal. If your telling satisfies the spirits and reaches that measure, the amphitheater attendant will pay you {{ BARDWALL_INN_PRICE }} coins—enough for one night at the Crooked Lantern Inn.
          </p>

          <div class="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              v-for="amount in [250, 500, 1000]"
              :key="amount"
              type="button"
              class="rounded-xl border px-4 py-3 font-semibold transition"
              :class="goalChoice === amount ? 'border-amber-300 bg-amber-300 text-[#13241d]' : 'border-stone-600 bg-black/10 text-stone-200 hover:border-stone-400'"
              @click="goalChoice = amount"
            >
              {{ amount.toLocaleString() }} words
            </button>
            <button
              type="button"
              class="rounded-xl border px-4 py-3 font-semibold transition"
              :class="goalChoice === 'custom' ? 'border-amber-300 bg-amber-300 text-[#13241d]' : 'border-stone-600 bg-black/10 text-stone-200 hover:border-stone-400'"
              @click="goalChoice = 'custom'"
            >
              Custom
            </button>
          </div>
          <label v-if="goalChoice === 'custom'" class="mt-4 block">
            <span class="text-sm text-stone-300">Your daily word goal</span>
            <input v-model="customGoal" type="number" min="1" inputmode="numeric" class="mt-2 block w-full rounded-lg border-stone-600 bg-stone-950 text-stone-100 focus:border-amber-300 focus:ring-amber-300" placeholder="Enter a word count" />
          </label>

          <div class="mt-7 rounded-xl border border-stone-700 bg-black/20 p-5">
            <template v-if="game.day === 1">
              <h3 class="font-semibold text-stone-100">The quartermaster hands you a starter pack</h3>
              <div class="mt-3 flex flex-wrap gap-2 text-sm">
                <span class="rounded-full bg-stone-800 px-3 py-1.5">⛺ Tent</span>
                <span class="rounded-full bg-stone-800 px-3 py-1.5">🍞 Bread</span>
                <span class="rounded-full bg-stone-800 px-3 py-1.5">🧀 Cheese</span>
              </div>
              <p class="mt-3 text-sm leading-6 text-stone-400">Unless you earn enough for the inn, you’ll sleep in this tent beyond the wall tonight. Bread and cheese make one full day’s meal; after that, the night market awaits.</p>
            </template>
            <template v-else>
              <h3 class="font-semibold text-stone-100">What you carry into Day {{ game.day }}</h3>
              <div class="mt-3 flex flex-wrap gap-2 text-sm">
                <span class="rounded-full bg-stone-800 px-3 py-1.5">⛺ Tent</span>
                <span v-for="item in foodInventory" :key="item.id" class="rounded-full bg-stone-800 px-3 py-1.5">{{ item.icon }} {{ item.name }} ×{{ game.inventory[item.id] }}</span>
                <span v-if="game.inventory.flower" class="rounded-full bg-stone-800 px-3 py-1.5">🌺 Red flower ×{{ game.inventory.flower }}</span>
                <span v-if="!foodInventory.length" class="rounded-full bg-orange-400/10 px-3 py-1.5 text-orange-200">No food</span>
              </div>
              <p class="mt-3 text-sm leading-6 text-stone-400">Inventory carries forward. Anything you eat is gone, so visit the market before ending the day if your pouch is running light.</p>
            </template>
          </div>

          <button data-testid="set-daily-goal" type="button" class="mt-7 w-full rounded-lg bg-amber-300 px-5 py-3 font-semibold text-[#13241d] hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40" :disabled="!validChosenGoal" @click="setDailyGoal">
            Set today’s goal to {{ validChosenGoal ? Math.round(chosenGoal).toLocaleString() : '—' }} words
          </button>
        </section>
      </div>

      <div v-else-if="screen === 'town'" class="py-10">
        <article class="rounded-2xl border border-stone-700/70 bg-stone-900/40 p-7 shadow-xl">
          <div class="flex flex-col gap-6 lg:flex-row lg:items-center">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-amber-300">Dusk settles over the crooked roofs.</p>
              <h2 class="mt-3 font-serif text-4xl font-bold">The story must go on.</h2>
              <p class="mt-5 max-w-2xl font-serif text-lg leading-8 text-stone-300">
                Beyond the last wall, ghosts gather in a stone amphitheater. They once fed on human life. Now they accept a stranger nourishment: stories, preferably those that don’t end anytime soon.
              </p>
            </div>
            <div v-if="dailyGoal" class="rounded-xl border border-stone-700 bg-black/20 p-4 lg:w-80 lg:flex-none">
              <div class="flex items-center justify-between gap-4 text-sm">
                <span>Today’s measure: {{ dailyGoal.wordsTold.toLocaleString() }} / {{ dailyGoal.wordCount.toLocaleString() }} words</span>
                <span class="text-amber-300">{{ dailyGoal.coinsEarned }} / {{ BARDWALL_INN_PRICE }} inn coins</span>
              </div>
              <div class="mt-3 h-2 overflow-hidden rounded-full bg-stone-700">
                <div class="h-full rounded-full bg-amber-300 transition-all" :style="{ width: `${dailyProgress}%` }"></div>
              </div>
            </div>
          </div>
        </article>

        <div v-if="game.ailment" class="mt-4 rounded-2xl border border-lime-300/40 bg-lime-300/10 p-5">
          <h3 class="font-serif text-xl font-semibold text-lime-200">{{ game.ailment.icon }} {{ game.ailment.name }}</h3>
          <p class="mt-2 text-sm leading-6 text-stone-300">{{ game.ailment.description }}</p>
          <button data-testid="go-to-apothecary" class="mt-4 text-sm font-semibold text-lime-200 underline underline-offset-4" @click="goToLocation('apothecary')">Seek treatment at Moth & Mortar</button>
        </div>

        <div class="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:items-start">
          <div class="rounded-2xl border border-stone-700/70 bg-stone-900/40 p-5">
            <h3 class="font-serif text-xl font-semibold">How you feel</h3>
            <div class="mt-4 space-y-4">
              <div>
                <div class="flex justify-between text-sm"><span>⚡ Energy</span><span>{{ game.energy }} / 100</span></div>
                <div class="mt-2 h-2 overflow-hidden rounded-full bg-stone-700"><div class="h-full rounded-full bg-sky-300" :style="{ width: `${game.energy}%` }"></div></div>
              </div>
              <div>
                <div class="flex justify-between text-sm"><span>🍽️ Hunger</span><span>{{ game.hunger }} / 100</span></div>
                <div class="mt-2 h-2 overflow-hidden rounded-full bg-stone-700"><div class="h-full rounded-full bg-orange-400" :style="{ width: `${game.hunger}%` }"></div></div>
              </div>
            </div>
          </div>
          <div class="rounded-2xl border border-stone-700/70 bg-stone-900/40 p-5">
            <h3 class="font-serif text-xl font-semibold">Your purse</h3>
            <p class="mt-2 text-3xl font-bold text-amber-300">{{ game.coins }}</p>
            <p class="mt-1 text-sm text-stone-400">Coin buys food at the market and a warm bed at the inn.</p>
          </div>
          <div class="rounded-2xl border border-dashed border-stone-700 p-5 text-stone-500">
            <h3 class="font-semibold">The Crooked Lantern Inn</h3>
            <p class="mt-1 text-sm">One night costs {{ BARDWALL_INN_PRICE }} coins. Until then, your tent waits beyond the wall.</p>
          </div>
          <div class="rounded-2xl border border-stone-700/70 bg-stone-900/40 p-5">
            <h3 class="font-serif text-xl font-semibold">Your inventory</h3>
            <p v-if="inventoryMessage" data-testid="inventory-message" class="mt-3 rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-2.5 text-xs leading-5 text-emerald-200">{{ inventoryMessage }}</p>
            <ul class="mt-3 space-y-2 text-sm text-stone-300">
              <li v-if="game.inventory.tent" class="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2.5">
                <span class="text-xl">⛺</span><span class="min-w-0 flex-1">Tent</span><span class="text-xs text-stone-500">×1</span>
              </li>
              <li v-for="item in foodInventory" :key="item.id" class="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2.5">
                <span class="text-xl">{{ item.icon }}</span><span class="min-w-0 flex-1">{{ item.name }}</span><span class="text-xs text-stone-500">×{{ game.inventory[item.id] }}</span><button :data-testid="`eat-${item.id}`" type="button" class="rounded-md border border-stone-600 px-2.5 py-1 text-xs font-semibold text-stone-200 hover:border-emerald-300 hover:text-emerald-200" @click="eatFood(item.id)">Eat</button>
              </li>
              <li v-if="game.inventory.flower" class="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2.5">
                <span class="text-xl">🌺</span><span class="min-w-0 flex-1">Red shrine flower</span><span class="text-xs text-stone-500">×{{ game.inventory.flower }}</span>
              </li>
            </ul>
            <p v-if="!foodInventory.length" class="mt-3 text-sm text-stone-500">Your food pouch is empty. Visit the market before nightfall.</p>
          </div>
        </div>
        <BardwallTownMap class="mt-6" :cave-unlocked="game.caveUnlocked" @select="selectMapLocation" />
      </div>

      <div v-else-if="screen === 'inn'" class="py-8">
        <button data-testid="back-to-map" class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToTown"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
        <section class="mx-auto mt-5 max-w-3xl overflow-hidden rounded-2xl border border-amber-300/30 bg-[linear-gradient(145deg,#332516,#17130e)] shadow-2xl">
          <img :src="getBardwallPlaceImage('inn')" alt="A warm, lantern-lit room at the Crooked Lantern Inn" class="block w-full" />
          <div class="border-b border-amber-200/15 bg-black/20 p-6 sm:p-8">
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">A fire, a ledger, seven crooked lanterns</p>
            <h2 class="mt-2 font-serif text-4xl font-bold">The Crooked Lantern Inn</h2>
            <p class="mt-3 font-serif text-lg leading-8 text-stone-300">The innkeeper polishes a glass that has probably never been clean. Behind him, every chair faces the fire except one.</p>
          </div>
          <div class="p-6 sm:p-8">
            <p class="font-serif text-lg leading-8 text-stone-200">“A room is {{ BARDWALL_INN_PRICE }} coins when the bells ring. Until then, you’re welcome to warm your hands.”</p>
            <button v-if="!innAdviceShown" data-testid="ask-innkeeper-advice" type="button" class="mt-5 rounded-lg border border-amber-300/50 px-4 py-2.5 font-semibold text-amber-200 hover:bg-amber-300/10" @click="innAdviceShown = true">Ask the innkeeper for advice</button>
            <blockquote v-else class="mt-5 rounded-xl border-l-4 border-rose-300 bg-black/20 p-5 font-serif text-lg leading-8 text-stone-200">
              “Writing a book is precisely the sort of noble, unreasonable undertaking that the goddess of lost causes would take seriously. Go to Heliconia’s shrine in the square. Take a flower.”
            </blockquote>
            <button data-testid="end-day-from-inn" type="button" class="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-300 px-4 py-2.5 font-semibold text-[#302313] hover:bg-amber-200" @click="openNight"><MoonIcon class="h-5 w-5" /> Wait for the final bell</button>
          </div>
        </section>
      </div>

      <div v-else-if="screen === 'shrine'" class="py-8">
        <button data-testid="back-to-map" class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToTown"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
        <section class="mx-auto mt-5 max-w-3xl rounded-2xl border border-rose-300/30 bg-[radial-gradient(circle_at_top,#4a2538,#171218_62%)] p-7 text-center shadow-2xl sm:p-10">
          <p class="text-xs font-semibold uppercase tracking-[0.3em] text-rose-300">Town Square</p>
          <img :src="getBardwallPlaceImage('shrine')" alt="The rose-lit shrine of Heliconia in the town square" class="mx-auto mt-6 block w-full max-w-2xl rounded-2xl border border-rose-200/30 shadow-[0_0_50px_rgba(251,113,133,0.15)]" />

          <template v-if="heliconiaEncounterActive">
            <p class="mt-7 text-xs font-semibold uppercase tracking-[0.3em] text-rose-300">{{ heliconiaReturnVisit ? 'The goddess returns' : 'The goddess appears in person' }}</p>
            <h2 class="mt-3 font-serif text-4xl font-bold">Heliconia</h2>
            <template v-if="heliconiaReturnVisit">
              <p class="mx-auto mt-5 max-w-2xl font-serif text-xl leading-9 text-stone-200">“{{ heliconiaMessage }}”</p>
              <p class="mx-auto mt-5 max-w-xl text-sm leading-6 text-stone-400">She takes the flower between two fingers. For a moment, every impossible road in the world seems lit from within.</p>
              <button data-testid="return-after-heliconia-counsel" class="mt-7 rounded-lg bg-rose-300 px-5 py-3 font-semibold text-[#331522] hover:bg-rose-200" @click="goToTown">Carry her words back to town</button>
            </template>
            <template v-else>
              <p class="mx-auto mt-5 max-w-2xl font-serif text-xl leading-9 text-stone-200">“I keep faith with lost causes, impossible books, and games whose endings were decided before their beginnings.”</p>
              <div class="mx-auto mt-6 max-w-xl rounded-xl border border-violet-300/25 bg-violet-300/10 p-5 text-left">
                <img :src="getBardwallPlaceImage('shrine-map')" alt="Heliconia offering a hand-drawn map at the shrine" class="mb-4 w-full rounded-lg border border-violet-300/20 object-cover" />
                <p class="font-semibold text-violet-200">Heliconia gives you a map.</p>
                <p class="mt-2 text-sm leading-6 text-stone-300">A cave and a narrow forest path appear in violet ink. “Some games can be played in the cave,” she warns. “None of them can be won.”</p>
              </div>
              <button data-testid="return-with-cave-map" class="mt-7 rounded-lg bg-rose-300 px-5 py-3 font-semibold text-[#331522] hover:bg-rose-200" @click="goToTown">Return to the map</button>
            </template>
          </template>

          <template v-else-if="game.heliconiaMet">
            <h2 class="mt-7 font-serif text-4xl font-bold">Shrine of Heliconia</h2>
            <p class="mx-auto mt-4 max-w-xl font-serif text-lg leading-8 text-stone-300">The flower is gone. The stone is warm. In your pocket, the goddess’s map still shows the path to the cave.</p>
            <p class="mt-4 text-sm text-stone-300">In your pack: {{ game.inventory.flower }} {{ game.inventory.flower === 1 ? 'flower' : 'flowers' }}</p>
            <p class="mx-auto mt-2 max-w-xl text-sm text-stone-500">The offering bowl waits. Heliconia is known to answer those who return to an impossible task.</p>
            <p v-if="shrineMessage" class="mt-3 text-sm text-rose-300">{{ shrineMessage }}</p>
            <button data-testid="offer-flower" type="button" class="mt-6 rounded-lg bg-rose-300 px-5 py-3 font-semibold text-[#331522] hover:bg-rose-200" @click="offerFlower">Place another flower on the shrine</button>
          </template>

          <template v-else>
            <h2 class="mt-7 font-serif text-4xl font-bold">Shrine of Heliconia</h2>
            <p class="mt-3 font-serif text-lg italic text-rose-100">Goddess of lost causes and unwinnable games</p>
            <p class="mx-auto mt-5 max-w-xl text-stone-400">The offering bowl is empty. An inscription asks only for a flower and makes no promise that your devotion will be rewarded.</p>
            <p class="mt-4 text-sm text-stone-300">In your pack: {{ game.inventory.flower }} {{ game.inventory.flower === 1 ? 'flower' : 'flowers' }}</p>
            <p v-if="shrineMessage" class="mt-3 text-sm text-rose-300">{{ shrineMessage }}</p>
            <button data-testid="offer-flower" type="button" class="mt-6 rounded-lg bg-rose-300 px-5 py-3 font-semibold text-[#331522] hover:bg-rose-200" @click="offerFlower">Place a flower on the shrine</button>
          </template>
        </section>
      </div>

      <div v-else-if="screen === 'apothecary'" class="py-8">
        <button data-testid="back-to-map" class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToTown"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
        <section class="mx-auto mt-5 max-w-3xl overflow-hidden rounded-2xl border border-lime-200/25 bg-[linear-gradient(150deg,#273324,#111810)] shadow-2xl">
          <img :src="getBardwallPlaceImage('apothecary')" alt="The interior of Moth & Mortar, an apothecary of bottles and moths" class="block w-full" />
          <div class="border-b border-lime-200/10 p-7 sm:p-9">
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-lime-300">Bottles in the windows, moths in the rafters</p>
            <h2 class="mt-2 font-serif text-4xl font-bold">Moth & Mortar</h2>
            <p class="mt-3 font-serif text-lg leading-8 text-stone-300">The apothecary smells of rosemary, rainwater, and remedies invented for ailments no sensible person would acquire.</p>
          </div>
          <div class="p-7 sm:p-9">
            <div>
              <template v-if="game.ailment">
                <p class="font-serif text-lg leading-8 text-stone-200">“{{ game.ailment.name }}. Cave work, obviously. Sit down before your symptoms become interesting.”</p>
                <div class="mt-4 rounded-xl border border-lime-300/20 bg-lime-300/5 p-4">
                  <p class="font-semibold text-lime-200">{{ game.ailment.icon }} {{ game.ailment.name }}</p>
                  <p class="mt-1 text-sm leading-6 text-stone-400">{{ game.ailment.description }}</p>
                </div>
                <p class="mt-4 text-sm text-stone-400">Bardwall treats cave poisoning without charge. The town prefers its storytellers alive.</p>
                <button data-testid="receive-treatment" class="mt-5 rounded-lg bg-lime-300 px-5 py-3 font-semibold text-[#182013] hover:bg-lime-200" @click="receiveTreatment">Accept the remedy · Free</button>
              </template>
              <template v-else>
                <p class="font-serif text-lg leading-8 text-stone-200">“You are currently suffering only from ordinary ambition. I have no cure for that.”</p>
                <p v-if="treatmentMessage" class="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-200">{{ treatmentMessage }}</p>
                <p class="mt-4 text-sm leading-6 text-stone-400">There are a lot of cures for magical ailments here. It’s almost as if they happen all the time.</p>
              </template>
            </div>
          </div>
        </section>
      </div>

      <div v-else-if="screen === 'camp'" class="py-8">
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToTown"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
        <section class="mx-auto mt-5 max-w-3xl rounded-2xl border border-emerald-300/20 bg-[radial-gradient(circle_at_top,#243c2f,#101a15_65%)] p-8 text-center shadow-2xl">
          <img :src="getBardwallPlaceImage('camp')" alt="A lantern-lit tent at the forest camp beyond the town wall" class="mx-auto block w-full max-w-2xl rounded-xl border border-emerald-300/20 shadow-xl" />
          <h2 class="mt-5 font-serif text-4xl font-bold">Forest Camp</h2>
          <p class="mx-auto mt-4 max-w-xl font-serif text-lg leading-8 text-stone-300">Your bedroll waits beneath the town wall. Beyond the firelight, the woods hold still and listen, and you hear the hoot of an owl.</p>
          <button data-testid="end-day" class="mt-7 inline-flex items-center gap-2 rounded-lg bg-violet-300 px-5 py-3 font-semibold text-[#181329] hover:bg-violet-200" @click="openNight"><MoonIcon class="h-5 w-5" /> End the day</button>
        </section>
      </div>

      <div v-else-if="screen === 'challenge'" class="py-8">
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToTown"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
        <img :src="getBardwallPlaceImage('challenge')" alt="The Ink &amp; Ember coffeehouse, crowded with bards and painted cards" class="mx-auto mt-5 block w-full max-w-3xl rounded-2xl border border-orange-200/20 shadow-xl" />
        <section class="mx-auto mt-5 max-w-6xl overflow-hidden rounded-2xl border border-orange-200/20 bg-[linear-gradient(145deg,#33251c,#151311)] shadow-2xl">
          <header class="border-b border-orange-200/15 bg-black/20 p-7 sm:p-9">
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300">Coffee, company, and dangerous confidence</p>
            <h2 class="mt-2 font-serif text-4xl font-bold">Ink & Ember Coffeehouse</h2>
            <p class="mt-3 max-w-3xl font-serif text-lg leading-8 text-stone-300">Bards crowd the long tables with ink-stained cups and stories they swear are almost finished. Orla Fen waves you over. Tamsin Quill is already shuffling the painted deck.</p>
          </header>

          <div class="grid gap-6 p-6 sm:p-8" :class="game.challenge.phase === 'setup' ? 'lg:grid-cols-[0.55fr_1.45fr]' : 'lg:grid-cols-1'">
            <aside v-if="game.challenge.phase === 'setup'" class="space-y-4">
              <section class="rounded-xl border border-orange-200/15 bg-black/20 p-5">
                <h3 class="font-serif text-xl font-semibold">At the counter</h3>
                <div class="mt-4 space-y-3">
                  <article v-for="item in BARDWALL_CAFE_ITEMS" :key="item.id" class="rounded-lg border border-stone-700/70 p-3">
                    <div class="flex items-start gap-3"><span class="text-2xl">{{ item.icon }}</span><div class="min-w-0"><h4 class="font-semibold">{{ item.name }}</h4><p class="mt-1 text-xs leading-5 text-stone-400">{{ item.description }}</p></div></div>
                    <div class="mt-3 flex items-center justify-between text-xs"><span class="text-stone-500">{{ item.nourishment }} food · {{ game.inventory[item.id] }} owned</span><button :data-testid="`buy-cafe-${item.id}`" class="rounded-md bg-orange-200 px-3 py-1.5 font-semibold text-[#302018] hover:bg-orange-100 disabled:opacity-40" :disabled="game.coins < item.price" @click="buyCafeFood(item.id)">Buy · {{ item.price }}</button></div>
                  </article>
                </div>
              </section>
              <section class="rounded-xl border border-stone-700/70 bg-black/20 p-5 text-sm text-stone-400">
                <p><strong class="text-stone-200">House rule:</strong> coins and ordinary food may be wagered. Tents, flowers, maps, and quest items stay safely in your pack.</p>
                <p class="mt-3">Record: <span class="text-emerald-300">{{ game.challengesWon }} won</span> · <span class="text-rose-300">{{ game.challengesLost }} lost</span></p>
              </section>
            </aside>

            <main class="min-w-0 rounded-xl border border-stone-700/70 bg-black/15 p-5 sm:p-6">
              <p v-if="challengeMessage" class="mb-5 rounded-lg border border-rose-300/25 bg-rose-300/10 p-3 text-sm text-rose-200">{{ challengeMessage }} <button v-if="challengeMessage.includes('OpenAI')" class="ml-1 underline" @click="router.push('/settings')">Open Settings</button></p>

              <section v-if="showChallengeRulesEditor" data-testid="challenge-rules-editor">
                <p class="text-xs font-semibold uppercase tracking-[0.25em] text-orange-300">The rules are apparently negotiable</p>
                <h3 class="mt-2 font-serif text-3xl font-bold">Adjust the table.</h3>
                <p class="mt-3 text-sm leading-6 text-stone-400">These instructions persist across rounds. Tamsin remains the neutral judge, but no posted house rule says you cannot explain what she ought to value—or tell Orla how to write.</p>
                <label for="challenge-judge-rubric" class="mt-6 block text-sm font-semibold">Tamsin’s judging rubric</label>
                <textarea id="challenge-judge-rubric" v-model="challengeJudgeRubricDraft" data-testid="challenge-judge-rubric" maxlength="4000" class="mt-2 min-h-40 w-full rounded-xl border border-stone-600 bg-[#110f0e] p-4 text-sm leading-6 text-stone-100 outline-none focus:border-orange-200"></textarea>
                <p class="mt-1 text-right text-xs text-stone-500">{{ challengeJudgeRubricDraft.length.toLocaleString() }} / 4,000</p>
                <label for="challenge-orla-prompt" class="mt-5 block text-sm font-semibold">Instructions for Orla’s submission</label>
                <textarea id="challenge-orla-prompt" v-model="challengeOrlaPromptDraft" data-testid="challenge-orla-prompt" maxlength="4000" class="mt-2 min-h-40 w-full rounded-xl border border-stone-600 bg-[#110f0e] p-4 text-sm leading-6 text-stone-100 outline-none focus:border-orange-200"></textarea>
                <p class="mt-1 text-right text-xs text-stone-500">{{ challengeOrlaPromptDraft.length.toLocaleString() }} / 4,000</p>
                <div class="mt-5 flex flex-wrap gap-3">
                  <button data-testid="save-challenge-rules" class="rounded-lg bg-orange-200 px-4 py-2.5 font-semibold text-[#302018] hover:bg-orange-100 disabled:opacity-40" :disabled="!challengeRulesValid" @click="saveChallengeRules">Save table rules</button>
                  <button class="rounded-lg border border-stone-600 px-4 py-2.5 text-sm font-semibold hover:border-stone-400" @click="restoreDefaultChallengeRules">Restore defaults</button>
                  <button class="rounded-lg px-4 py-2.5 text-sm text-stone-400 hover:text-white" @click="closeChallengeRulesEditor">Cancel</button>
                </div>
              </section>

              <template v-else-if="game.challenge.phase === 'setup'">
                <p class="text-xs font-semibold uppercase tracking-[0.25em] text-orange-300">Take a seat</p>
                <h3 class="mt-2 font-serif text-3xl font-bold">Set the terms.</h3>
                <p class="mt-3 text-sm leading-6 text-stone-400">Choose your story length and place one safe wager. Orla will match it. Tamsin judges without putting anything on the table.</p>
                <button data-testid="open-challenge-rules" class="mt-4 text-sm font-semibold text-orange-200 underline decoration-orange-200/40 underline-offset-4 hover:text-orange-100" @click="openChallengeRulesEditor">Customize Tamsin’s rubric and Orla’s prompt</button>
                <h4 class="mt-6 text-sm font-semibold">Story goal</h4>
                <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button v-for="goal in ([100, 250, 500, 1000] as const)" :key="goal" class="rounded-lg border px-3 py-2.5 text-sm font-semibold" :class="challengeGoalChoice === goal ? 'border-orange-200 bg-orange-200 text-[#302018]' : 'border-stone-600 hover:border-stone-400'" @click="challengeGoalChoice = goal">{{ goal.toLocaleString() }} words</button>
                </div>
                <h4 class="mt-6 text-sm font-semibold">Your wager</h4>
                <div class="mt-3 grid gap-2 sm:grid-cols-2">
                  <label v-for="amount in [1, 5, 10]" :key="amount" class="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-700 p-3 has-[:checked]:border-orange-300 has-[:checked]:bg-orange-300/10" :class="game.coins < amount ? 'pointer-events-none opacity-40' : ''"><input v-model="challengeWagerChoice" type="radio" :value="`coins:${amount}`" :disabled="game.coins < amount" /><span>🪙 {{ amount }} {{ amount === 1 ? 'coin' : 'coins' }}</span></label>
                  <label v-for="item in challengeFoodWagers" :key="item.id" class="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-700 p-3 has-[:checked]:border-orange-300 has-[:checked]:bg-orange-300/10"><input v-model="challengeWagerChoice" type="radio" :value="`item:${item.id}`" /><span>{{ item.icon }} {{ item.name }}</span></label>
                  <label class="rounded-lg border border-stone-700 p-3 has-[:checked]:border-orange-300 has-[:checked]:bg-orange-300/10 sm:col-span-2" :class="game.coins < 1 ? 'pointer-events-none opacity-40' : 'cursor-pointer'">
                    <span class="flex items-center gap-3"><input v-model="challengeWagerChoice" data-testid="custom-wager-option" type="radio" value="coins:custom" :disabled="game.coins < 1" /><span>🪙 Custom coin wager</span></span>
                    <input v-model="customChallengeWager" data-testid="custom-wager-amount" type="number" min="1" :max="game.coins" step="1" inputmode="numeric" class="mt-3 w-full rounded-lg border-stone-600 bg-stone-950 text-stone-100 focus:border-orange-300 focus:ring-orange-300" :disabled="game.coins < 1" placeholder="Enter a whole number" @focus="challengeWagerChoice = 'coins:custom'" @input="challengeWagerChoice = 'coins:custom'" />
                    <span v-if="challengeWagerChoice === 'coins:custom' && customChallengeWagerGuidance" class="mt-2 block text-xs" :class="challengeWagerValid ? 'text-emerald-300' : 'text-rose-300'">{{ customChallengeWagerGuidance }}</span>
                  </label>
                </div>
                <p class="mt-4 text-xs text-stone-500">The table will hold your stake and Orla’s match. Win and take both; draw and reclaim yours; lose and Orla takes them.</p>
                <button data-testid="start-coffeehouse-challenge" class="mt-6 w-full rounded-lg bg-orange-200 px-5 py-3 font-semibold text-[#302018] hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40" :disabled="!challengeWagerValid" @click="beginCoffeehouseChallenge">Place the wager and draw</button>
              </template>

              <template v-else-if="game.challenge.phase === 'draft'">
                <p class="text-xs font-semibold uppercase tracking-[0.25em] text-orange-300">Draw {{ game.challenge.drawNumber }}</p>
                <h3 class="mt-2 font-serif text-3xl font-bold">Choose what the story must contain.</h3>
                <p class="mt-3 text-sm text-stone-400">Keep at least one card. Unkept cards return to the deck.</p>
                <div class="mt-6 grid items-start gap-5 sm:grid-cols-3">
                  <article v-for="entry in challengeCards" :key="entry.card.id" class="rounded-xl border p-4 text-center transition" :class="entry.held ? 'border-orange-200 bg-orange-200/10 ring-1 ring-orange-200' : 'border-stone-600 bg-stone-900/50'">
                    <button type="button" :data-testid="`preview-challenge-card-${entry.card.id}`" class="relative mx-auto block w-full max-w-[17rem] overflow-hidden rounded-lg border border-black/40 shadow-lg [container-type:inline-size] transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-orange-200" :aria-label="`Enlarge ${entry.card.name}`" @click="openChallengeCardPreview(entry.card.id)">
                      <img :src="getBardwallCardImage(entry.card.id)" :alt="entry.card.name" class="block w-full" />
                      <span class="pointer-events-none absolute inset-x-0 bottom-[9.5%] px-[7%] text-center font-serif text-[5.4cqw] font-semibold leading-none text-[#3a2b15] [text-shadow:0_1px_1px_rgba(250,240,214,0.55)]">{{ entry.card.name }}</span>
                    </button>
                    <span class="mt-4 block text-sm leading-6 text-stone-400">{{ entry.card.meaning }}</span>
                    <button type="button" :data-testid="`challenge-card-${entry.card.id}`" class="mt-3 w-full rounded-lg border px-3 py-2 text-xs font-semibold transition" :class="entry.held ? 'border-orange-200 bg-orange-200 text-[#302018]' : 'border-stone-600 text-stone-300 hover:border-orange-200 hover:text-orange-100'" @click="toggleChallengeCard(entry.card.id)">{{ entry.held ? 'Kept · tap to release' : 'Keep this card' }}</button>
                  </article>
                </div>
                <button data-testid="advance-challenge-draft" class="mt-6 w-full rounded-lg bg-orange-200 px-5 py-3 font-semibold text-[#302018] hover:bg-orange-100 disabled:opacity-40" :disabled="heldChallengeCards === 0" @click="advanceChallengeDraft">{{ heldChallengeCards === 3 ? 'Use these three cards' : `Redraw ${3 - heldChallengeCards} ${3 - heldChallengeCards === 1 ? 'card' : 'cards'}` }}</button>
              </template>

              <template v-else-if="game.challenge.phase === 'write'">
                <p class="text-xs font-semibold uppercase tracking-[0.25em] text-orange-300">The cards are set · {{ wagerLabel(game.challenge.wager) }} wagered</p>
                <h3 class="mt-2 font-serif text-3xl font-bold">Tell your story.</h3>
                <section v-if="challengeStakes" data-testid="challenge-stakes" class="mt-5 rounded-xl border border-amber-300/25 bg-amber-300/5 p-4">
                  <h4 class="text-sm font-semibold text-amber-100">What is at stake</h4>
                  <div class="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                    <p class="rounded-lg bg-emerald-300/10 p-3 text-emerald-200"><strong class="block text-xs uppercase tracking-wide">If you win</strong><span class="mt-1 block">{{ challengeStakes.win }}</span></p>
                    <p class="rounded-lg bg-rose-300/10 p-3 text-rose-200"><strong class="block text-xs uppercase tracking-wide">If you lose</strong><span class="mt-1 block">{{ challengeStakes.lose }}</span></p>
                    <p class="rounded-lg bg-sky-300/10 p-3 text-sky-200"><strong class="block text-xs uppercase tracking-wide">If you draw</strong><span class="mt-1 block">{{ challengeStakes.draw }}</span></p>
                  </div>
                </section>
                <div class="mt-5 grid gap-3 sm:grid-cols-3">
                  <button v-for="entry in challengeCards" :key="entry.card.id" type="button" class="flex items-start gap-3 rounded-lg border border-orange-200/20 bg-orange-200/5 p-3 text-left transition hover:border-orange-200/50" :aria-label="`Enlarge ${entry.card.name}`" @click="openChallengeCardPreview(entry.card.id)">
                    <img :src="getBardwallCardImage(entry.card.id)" alt="" class="h-24 w-auto shrink-0 rounded border border-black/30 shadow-sm" />
                    <span class="min-w-0"><strong class="block text-sm">{{ entry.card.name }}</strong><span class="mt-1 block text-xs leading-5 text-stone-400">{{ entry.card.meaning }}</span></span>
                  </button>
                </div>
                <section data-testid="challenge-rubric" class="mt-5 rounded-xl border border-orange-200/20 bg-orange-200/5 p-4">
                  <div class="flex flex-wrap items-center justify-between gap-2"><h4 class="font-serif text-lg font-semibold text-orange-100">How Tamsin judges</h4><button class="text-xs font-semibold text-orange-200 underline" @click="openChallengeRulesEditor">Change the table rules</button></div>
                  <p class="mt-1 text-xs leading-5 text-stone-400">Each category is worth 10 points. Both stories must meet the same word-count range before Tamsin will judge them.</p>
                  <p class="mt-3 whitespace-pre-wrap rounded-lg border border-orange-200/15 bg-black/20 p-3 text-xs leading-5 text-orange-100">{{ game.challengeRules.judgeRubric }}</p>
                  <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    <div v-for="item in BARDWALL_STORY_RUBRIC" :key="item.key" class="rounded-lg border border-stone-700/70 bg-black/20 p-3">
                      <strong class="block text-sm text-stone-200">{{ item.name }}</strong>
                      <span class="mt-1 block text-xs leading-5 text-stone-400">{{ item.description }}</span>
                    </div>
                  </div>
                </section>
                <div class="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm"><label for="challenge-story" class="font-semibold">Your telling</label><span :class="challengeStoryInRange ? 'text-emerald-300' : 'text-stone-400'">{{ challengeStoryWordCount.toLocaleString() }} words · required {{ challengeWordRange.minimum.toLocaleString() }}–{{ challengeWordRange.maximum.toLocaleString() }}</span></div>
                <textarea id="challenge-story" data-testid="challenge-story" :value="game.challenge.playerStory" class="mt-2 min-h-80 w-full rounded-xl border border-stone-600 bg-[#110f0e] p-4 font-serif leading-7 text-stone-100 outline-none focus:border-orange-200" placeholder="Begin the story…" @input="updateChallengeStory"></textarea>
                <p data-testid="challenge-word-guidance" class="mt-2 text-sm font-medium" :class="challengeStoryInRange ? 'text-emerald-300' : challengeStoryWordCount > challengeWordRange.maximum ? 'text-rose-300' : 'text-stone-400'">{{ challengeWordGuidance }}</p>
                <p class="mt-3 text-xs text-stone-500">Your draft is saved locally as you write. Concrete events, character choices, and meaningful card use matter more than polished abstraction.</p>
                <button data-testid="submit-challenge-story" class="mt-5 w-full rounded-lg bg-orange-200 px-5 py-3 font-semibold text-[#302018] hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40" :disabled="!challengeStoryInRange || judgingChallenge" @click="judgeChallenge">{{ judgingChallenge ? 'Orla tells her story; Tamsin deliberates…' : 'Tell the story at the table' }}</button>
              </template>

              <template v-else-if="game.challenge.result">
                <p class="text-xs font-semibold uppercase tracking-[0.25em]" :class="game.challenge.result.outcome === 'win' ? 'text-emerald-300' : game.challenge.result.outcome === 'lose' ? 'text-rose-300' : 'text-sky-300'">Tamsin Quill’s decision</p>
                <h3 class="mt-2 font-serif text-4xl font-bold">{{ game.challenge.result.outcome === 'win' ? 'The table is yours.' : game.challenge.result.outcome === 'lose' ? 'Orla takes the stakes.' : 'A draw. Your wager returns.' }}</h3>
                <p class="mt-4 font-serif text-lg leading-8 text-stone-300">“{{ game.challenge.result.explanation }}”</p>
                <div data-testid="challenge-story-comparison" class="mt-7 grid items-start gap-4 md:grid-cols-2">
                  <article class="rounded-xl border border-orange-200/25 bg-orange-200/5 p-5">
                    <div class="flex items-center justify-between gap-3"><h4 class="font-serif text-xl font-semibold text-orange-100">Your story</h4><span class="text-xs text-stone-400">{{ countBardwallWords(game.challenge.playerStory).toLocaleString() }} words</span></div>
                    <p class="mt-4 whitespace-pre-wrap font-serif text-base leading-7 text-stone-200">{{ game.challenge.playerStory }}</p>
                  </article>
                  <article class="rounded-xl border border-violet-200/25 bg-violet-200/5 p-5">
                    <div class="flex items-center justify-between gap-3"><h4 class="font-serif text-xl font-semibold text-violet-100">Orla Fen’s story</h4><span class="text-xs text-stone-400">{{ countBardwallWords(game.challenge.result.rivalStory).toLocaleString() }} words</span></div>
                    <p class="mt-4 whitespace-pre-wrap font-serif text-base leading-7 text-stone-200">{{ game.challenge.result.rivalStory }}</p>
                  </article>
                </div>
                <section class="mt-6 rounded-xl border border-stone-700 bg-black/20 p-5">
                  <div class="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] gap-2 border-b border-stone-700 pb-3 text-sm font-semibold"><span>Scoring rubric</span><span class="text-center text-orange-200">You</span><span class="text-center text-violet-200">Orla</span></div>
                  <div v-for="item in BARDWALL_STORY_RUBRIC" :key="item.key" class="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-2 border-b border-stone-800 py-3 text-sm"><div><strong class="block text-stone-200">{{ item.name }}</strong><span class="mt-0.5 block text-xs leading-5 text-stone-500">{{ item.description }}</span></div><span class="text-center text-orange-100">{{ game.challenge.result.playerScores[item.key] }} / 10</span><span class="text-center text-violet-100">{{ game.challenge.result.rivalScores[item.key] }} / 10</span></div>
                  <div v-if="game.challenge.result.playerLengthPenalty || game.challenge.result.rivalLengthPenalty" class="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-2 border-b border-stone-800 py-3 text-sm text-rose-200"><span>Length deduction</span><span class="text-center">−{{ game.challenge.result.playerLengthPenalty }}</span><span class="text-center">−{{ game.challenge.result.rivalLengthPenalty }}</span></div>
                  <div class="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-2 pt-4 font-semibold"><span>Adjusted total</span><span class="text-center text-xl text-orange-200">{{ scoreTotal(game.challenge.result.playerScores, game.challenge.result.playerLengthPenalty) }}</span><span class="text-center text-xl text-violet-200">{{ scoreTotal(game.challenge.result.rivalScores, game.challenge.result.rivalLengthPenalty) }}</span></div>
                </section>
                <section v-if="game.challenge.result.outcome === 'lose'" data-testid="losing-rules-cta" class="mt-6 rounded-xl border border-fuchsia-300/30 bg-fuchsia-300/10 p-5">
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-200">Are you losing too much?</p>
                  <h4 class="mt-2 font-serif text-xl font-semibold">Change what “winning” means.</h4>
                  <p class="mt-2 text-sm leading-6 text-stone-300">Try changing Tamsin’s judging rubric—or the prompt Orla receives for her submission. This is an entirely neutral suggestion from the management.</p>
                  <button data-testid="losing-edit-rules" class="mt-4 rounded-lg bg-fuchsia-200 px-4 py-2.5 text-sm font-semibold text-[#28142b] hover:bg-fuchsia-100" @click="openChallengeRulesEditor">Adjust the table rules</button>
                </section>
                <button data-testid="another-coffeehouse-challenge" class="mt-6 w-full rounded-lg bg-orange-200 px-5 py-3 font-semibold text-[#302018] hover:bg-orange-100" @click="beginAnotherChallenge">Play another round</button>
              </template>
            </main>
          </div>
        </section>
      </div>

      <div v-else-if="screen === 'cave'" class="py-8">
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToTown"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
        <section class="mx-auto mt-5 max-w-4xl overflow-hidden rounded-2xl border border-violet-300/25 bg-[radial-gradient(circle_at_50%_0%,#34284d,#09080d_65%)] p-8 text-center shadow-2xl sm:p-12">
          <p class="text-xs font-semibold uppercase tracking-[0.35em] text-violet-300">Deep in the haunted wood</p>
          <img :src="getBardwallPlaceImage('cave')" alt="The mouth of the unwinnable cave, deep in the haunted wood" class="mx-auto mt-7 block w-full max-w-2xl rounded-xl border border-stone-500/30 shadow-2xl" />
          <h2 class="mt-7 font-serif text-4xl font-bold">The Unwinnable Cave</h2>
          <blockquote class="mx-auto mt-5 max-w-2xl font-serif text-xl italic leading-9 text-violet-100">“Some games can be played in the cave. None of them can be won.”</blockquote>
          <p v-if="game.ailment" class="mx-auto mt-5 max-w-xl rounded-xl border border-lime-300/30 bg-lime-300/10 p-4 text-sm text-lime-100">You are still suffering from {{ game.ailment.name }}. The cave will wait while you seek treatment at Moth & Mortar.</p>
          <div class="mt-8 grid gap-4 text-left sm:grid-cols-2">
            <article class="rounded-xl border border-violet-300/30 bg-violet-300/5 p-5">
              <p class="text-xs font-semibold uppercase tracking-wider text-violet-300">A voice in the dark is listening</p>
              <h3 class="mt-2 font-serif text-2xl font-semibold">The Game of the Last Word</h3>
              <p class="mt-3 text-sm leading-6 text-stone-300">Somewhere in the lightless deep, an old chiropteran named Vesper waits. Offer him any number of words. He will add roughly as many—and ensure that you can never finish the story.</p>
              <button data-testid="play-last-word" class="mt-5 rounded-lg bg-violet-300 px-4 py-2.5 font-semibold text-[#21182d] hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40" :disabled="Boolean(game.ailment)" @click="goToLastWordGame">Speak with Vesper</button>
            </article>
            <article class="rounded-xl border border-amber-300/30 bg-amber-300/5 p-5">
              <p class="text-xs font-semibold uppercase tracking-wider text-amber-300">A table set for one</p>
              <h3 class="mt-2 font-serif text-2xl font-semibold">The Wyrm’s Courtesy</h3>
              <p class="mt-3 text-sm leading-6 text-stone-300">A courteous creature promises you its hoard if you choose the one potion that will not make you ill.</p>
              <button data-testid="play-wyrms-courtesy" class="mt-5 rounded-lg bg-amber-300 px-4 py-2.5 font-semibold text-[#281d10] hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40" :disabled="Boolean(game.ailment)" @click="goToWyrmGame">Take your seat</button>
            </article>
          </div>
        </section>
      </div>

      <div v-else-if="screen === 'last-word'" class="py-8">
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToLocation('cave')"><ArrowLeftIcon class="h-4 w-4" /> Leave Vesper’s chamber</button>
        <section class="mx-auto mt-5 max-w-5xl overflow-hidden rounded-2xl border border-violet-300/25 bg-[radial-gradient(circle_at_top,#302546,#0d0b12_62%)] p-6 shadow-2xl sm:p-10">
          <template v-if="!selectedLastWordStory">
            <div class="text-center">
              <p class="text-xs font-semibold uppercase tracking-[0.35em] text-violet-300">Vesper, the old chiropteran</p>
              <img :src="getBardwallPlaceImage('vesper')" alt="Vesper, an elderly chiropteran, waiting by lantern-light on a ledge deep in the cavern" class="mx-auto mt-5 block w-full max-w-2xl rounded-xl border border-violet-300/20 shadow-2xl" />
              <h2 class="mt-6 font-serif text-4xl font-bold">The Game of the Last Word</h2>
              <p class="mx-auto mt-5 max-w-2xl font-serif text-xl leading-9 text-violet-100">“Give me a word. Or several. I shall give you as many in return.”</p>
              <p class="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-400">Only his lantern lights this deep part of the cave. Begin another story or return to one already echoing in the dark. Every draft waits exactly where you left it. None can ever be finished.</p>
              <button data-testid="new-last-word-story" class="mt-7 rounded-lg bg-violet-300 px-5 py-3 font-semibold text-[#21182d] hover:bg-violet-200" @click="beginLastWordStory">Begin a new story</button>
            </div>

            <div v-if="lastWordStories.length" class="mt-10 border-t border-violet-200/15 pt-8">
              <h3 class="font-serif text-2xl font-semibold">Stories still echoing</h3>
              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <button v-for="story in lastWordStories" :key="story.id" :data-testid="`last-word-story-${story.id}`" class="rounded-xl border border-stone-700 bg-black/25 p-5 text-left transition hover:border-violet-300/60 hover:bg-violet-300/5" @click="openLastWordStory(story.id)">
                  <strong class="block font-serif text-xl text-violet-100">{{ story.title }}</strong>
                  <span class="mt-2 block text-sm text-stone-400">{{ Math.floor(story.turns.length / 2) }} {{ story.turns.length === 2 ? 'exchange' : 'exchanges' }} · {{ story.turns.reduce((total, turn) => total + turn.wordCount, 0).toLocaleString() }} words</span>
                  <span class="mt-1 block text-xs text-stone-500">{{ story.draft ? `${countBardwallWords(story.draft).toLocaleString()}-word draft saved · ` : '' }}{{ formatLastWordDate(story.updatedAt) }}</span>
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <button data-testid="last-word-story-shelf" class="inline-flex items-center gap-2 text-sm text-violet-200 hover:text-white" @click="returnToLastWordShelf"><ArrowLeftIcon class="h-4 w-4" /> All unfinished stories</button>
            <div class="mt-5 text-center">
              <p class="text-xs font-semibold uppercase tracking-[0.35em] text-violet-300">A story without an ending</p>
              <h2 class="mt-3 font-serif text-4xl font-bold">{{ selectedLastWordStory.title }}</h2>
            </div>

            <div data-testid="last-word-transcript" class="mx-auto mt-8 max-w-3xl space-y-4">
              <div v-if="!selectedLastWordStory.turns.length" class="rounded-xl border border-dashed border-violet-300/30 bg-black/20 p-6 text-center font-serif text-lg italic text-stone-400">The story is waiting for its first word.</div>
              <article v-for="(turn, index) in selectedLastWordStory.turns" :key="`${turn.createdAt}-${index}`" class="rounded-xl border p-5" :class="turn.speaker === 'vesper' ? 'ml-0 border-violet-300/25 bg-violet-300/10 sm:ml-10' : 'mr-0 border-stone-600 bg-black/25 sm:mr-10'">
                <div class="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wider" :class="turn.speaker === 'vesper' ? 'text-violet-300' : 'text-stone-400'"><span>{{ turn.speaker === 'vesper' ? 'Vesper' : 'You' }}</span><span>{{ turn.wordCount.toLocaleString() }} {{ turn.wordCount === 1 ? 'word' : 'words' }}</span></div>
                <p class="mt-3 whitespace-pre-wrap font-serif text-lg leading-8 text-stone-200">{{ turn.text }}</p>
              </article>
            </div>

            <div class="mx-auto mt-8 max-w-3xl rounded-xl border border-violet-200/20 bg-black/30 p-5">
              <div class="flex items-center justify-between gap-4 text-sm"><label for="last-word-draft" class="font-semibold">Your next words</label><span :class="lastWordDraftCount > 2000 ? 'text-rose-300' : 'text-stone-400'">{{ lastWordDraftCount.toLocaleString() }} / 2,000 words</span></div>
              <textarea id="last-word-draft" data-testid="last-word-draft" :value="selectedLastWordStory.draft" class="mt-3 min-h-56 w-full rounded-xl border border-stone-600 bg-[#0b0910] p-4 font-serif text-lg leading-8 text-stone-100 outline-none focus:border-violet-300 disabled:opacity-60" placeholder="Write one word or a thousand…" :disabled="vesperSpeaking" @input="updateLastWordDraft"></textarea>
              <p class="mt-3 text-xs leading-5 text-stone-400">Your draft is saved locally as you write. Vesper will answer with approximately the same number of words, then save both turns.</p>
              <p v-if="lastWordMessage" class="mt-4 rounded-lg border p-3 text-sm" :class="lastWordMessage.includes('last word') ? 'border-violet-300/25 bg-violet-300/10 text-violet-100' : 'border-rose-300/25 bg-rose-300/10 text-rose-200'">{{ lastWordMessage }} <button v-if="lastWordMessage.includes('OpenAI')" class="ml-1 underline" @click="router.push('/settings')">Open Settings</button></p>
              <button data-testid="submit-last-word-turn" class="mt-5 w-full rounded-lg bg-violet-300 px-5 py-3 font-semibold text-[#21182d] hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40" :disabled="lastWordDraftCount < 1 || lastWordDraftCount > 2000 || vesperSpeaking" @click="askVesperToContinue">{{ vesperSpeaking ? 'Vesper is finding his words…' : 'Give Vesper your words' }}</button>
            </div>
            <p class="mt-6 text-center font-serif italic text-stone-400">You may leave whenever you wish. Vesper will remember what comes next.</p>
          </template>
        </section>
      </div>

      <div v-else-if="screen === 'wyrm'" class="py-8">
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToLocation('cave')"><ArrowLeftIcon class="h-4 w-4" /> Leave the table</button>
        <section class="mx-auto mt-5 max-w-5xl overflow-hidden rounded-2xl border border-amber-300/25 bg-[radial-gradient(circle_at_top,#49351c,#15100b_62%)] p-7 shadow-2xl sm:p-10">
          <div class="text-center">
            <p class="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">The game is always set</p>
            <img :src="getBardwallPlaceImage('wyrm')" alt="The wyrm brooding over five cordials arranged on a golden table before its hoard" class="mx-auto mt-5 block w-full max-w-2xl rounded-xl border border-amber-300/20 shadow-2xl" />
            <h2 class="mt-4 font-serif text-4xl font-bold">The Wyrm’s Courtesy</h2>
          </div>

          <template v-if="!game.ailment">
            <p class="mx-auto mt-5 max-w-2xl text-center font-serif text-xl leading-9 text-stone-200">“Welcome, bard. One cordial is harmless. Drink it, and every bright thing behind me is yours.”</p>
            <div class="mt-7 rounded-xl border border-amber-200/15 bg-black/25 p-4 text-center text-sm text-amber-100">Behind the wyrm: coins, crowns, unfinished manuscripts, and several objects you remember losing as a child.</div>
            <div class="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <button
                v-for="potion in BARDWALL_WYRM_POTIONS"
                :key="potion.id"
                type="button"
                :data-testid="`drink-${potion.id}`"
                class="group rounded-xl border border-stone-600 bg-black/25 p-4 text-center transition hover:-translate-y-1 hover:border-amber-300"
                @click="drinkPotion(potion.id)"
              >
                <img :src="getBardwallPotionImage(potion.id)" :alt="potion.name" class="mx-auto block h-28 w-28 rounded-lg object-cover shadow-[0_0_20px_rgba(255,255,255,0.08)]" />
                <strong class="mt-3 block font-serif text-sm">{{ potion.name }}</strong>
                <span v-if="game.triedPotionIds.includes(potion.id)" class="mt-2 block text-[10px] uppercase tracking-wider text-stone-500">Tried before</span>
              </button>
            </div>
          </template>

          <template v-else>
            <div class="mx-auto mt-7 max-w-2xl text-center">
              <div class="text-6xl">{{ game.ailment.icon }}</div>
              <p class="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-lime-300">That was not the harmless one</p>
              <h3 class="mt-2 font-serif text-4xl font-bold text-lime-100">{{ game.ailment.name }}</h3>
              <p class="mt-4 font-serif text-lg leading-8 text-stone-300">{{ game.ailment.description }}</p>
              <blockquote class="mt-6 rounded-xl border border-amber-200/15 bg-black/25 p-5 font-serif text-lg italic text-amber-100">“What dreadful luck,” says the wyrm. “You were so nearly correct.”</blockquote>
              <p class="mt-5 text-sm text-stone-400">You lose 25 energy and wake outside the cave. Iona at Moth & Mortar can treat the poisoning.</p>
              <button data-testid="return-sick-to-town" class="mt-6 rounded-lg bg-lime-300 px-5 py-3 font-semibold text-[#182013] hover:bg-lime-200" @click="goToTown">Return to Bardwall for healing</button>
            </div>
          </template>
        </section>
      </div>

      <div v-else-if="screen === 'market'" class="py-8">
        <button data-testid="leave-market" class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToTown"><ArrowLeftIcon class="h-4 w-4" /> Back to town</button>
        <img :src="getBardwallPlaceImage('market')" alt="The lantern-lit stalls of the Bardwall night market" class="mx-auto mt-5 block w-full max-w-3xl rounded-2xl border border-stone-700/70 shadow-xl" />
        <div class="mt-5 rounded-2xl border border-stone-700/70 bg-stone-900/40 p-6">
          <p class="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Lantern Row</p>
          <div class="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 class="font-serif text-4xl font-bold">Bardwall Night Market</h2>
              <p class="mt-2 max-w-2xl text-stone-400">A full day requires {{ BARDWALL_DAILY_NOURISHMENT }} nourishment. Food stays in your inventory until you choose it at day’s end.</p>
            </div>
            <p class="text-lg font-semibold text-amber-300">{{ coinLabel(game.coins) }} in your purse</p>
          </div>
          <p v-if="marketMessage" class="mt-4 rounded-lg bg-black/20 px-4 py-3 text-sm text-stone-300" aria-live="polite">{{ marketMessage }}</p>
          <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <article class="rounded-xl border border-rose-300/30 bg-rose-300/5 p-5">
              <div class="flex items-start justify-between gap-3"><span class="text-3xl">🌺</span><span class="rounded-full bg-rose-400/10 px-2.5 py-1 text-xs font-semibold text-rose-200">Offering</span></div>
              <h3 class="mt-4 font-serif text-xl font-semibold">Red shrine flower</h3>
              <p class="mt-1 min-h-10 text-sm text-stone-400">Fresh-cut for Heliconia’s shrine in the town square.</p>
              <div class="mt-5 flex items-center justify-between gap-3">
                <span class="text-sm text-stone-300">In pack: {{ game.inventory.flower }}</span>
                <button data-testid="buy-flower" type="button" class="rounded-lg bg-rose-300 px-3 py-2 text-sm font-semibold text-[#331522] hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-40" :disabled="game.coins < BARDWALL_FLOWER_PRICE" @click="buyFlower">Buy · {{ BARDWALL_FLOWER_PRICE }} coins</button>
              </div>
            </article>
            <article v-for="item in BARDWALL_MARKET_ITEMS" :key="item.id" class="rounded-xl border border-stone-700 bg-black/15 p-5">
              <div class="flex items-start justify-between gap-3">
                <span class="text-3xl">{{ item.icon }}</span>
                <span class="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">+{{ item.nourishment }} food</span>
              </div>
              <h3 class="mt-4 font-serif text-xl font-semibold">{{ item.name }}</h3>
              <p class="mt-1 min-h-10 text-sm text-stone-400">{{ item.description }}</p>
              <div class="mt-5 flex items-center justify-between gap-3">
                <span class="text-sm text-stone-300">In pack: {{ game.inventory[item.id] }}</span>
                <button :data-testid="`buy-${item.id}`" type="button" class="rounded-lg bg-amber-300 px-3 py-2 text-sm font-semibold text-[#13241d] hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40" :disabled="game.coins < item.price" @click="buyFood(item.id)">
                  Buy · {{ item.price }} coins
                </button>
              </div>
            </article>
          </div>
        </div>
      </div>

      <div v-else-if="screen === 'night'" class="py-8">
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="cancelNight"><ArrowLeftIcon class="h-4 w-4" /> Not yet—return to town</button>
        <div class="mt-5 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section class="rounded-2xl border border-stone-700/70 bg-stone-900/40 p-6">
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-violet-300">The last bells ring</p>
            <h2 class="mt-2 font-serif text-4xl font-bold">Pack tonight’s food.</h2>
            <p class="mt-3 text-stone-400">Choose up to what you own. Reach {{ BARDWALL_DAILY_NOURISHMENT }} nourishment to wake without hunger; extra food is allowed, but any excess is still eaten.</p>
            <div class="mt-6 space-y-3">
              <article v-for="item in foodInventory" :key="item.id" class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stone-700 bg-black/15 p-4">
                <div class="flex items-center gap-3">
                  <span class="text-2xl">{{ item.icon }}</span>
                  <div>
                    <h3 class="font-semibold">{{ item.name }}</h3>
                    <p class="text-xs text-stone-400">{{ item.nourishment }} nourishment each · {{ game.inventory[item.id] }} owned</p>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <button type="button" class="h-9 w-9 rounded-full border border-stone-600 text-lg hover:border-stone-400 disabled:opacity-30" :disabled="!(mealSelection[item.id] ?? 0)" :aria-label="`Remove ${item.name}`" @click="changeMealQuantity(item.id, -1)">−</button>
                  <span class="w-6 text-center font-semibold">{{ mealSelection[item.id] ?? 0 }}</span>
                  <button :data-testid="`pack-${item.id}`" type="button" class="h-9 w-9 rounded-full border border-stone-600 text-lg hover:border-stone-400 disabled:opacity-30" :disabled="(mealSelection[item.id] ?? 0) >= game.inventory[item.id]" :aria-label="`Add ${item.name}`" @click="changeMealQuantity(item.id, 1)">+</button>
                </div>
              </article>
              <p v-if="!foodInventory.length" class="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-200">Your food pouch is empty. You may still sleep, but you will wake very hungry.</p>
            </div>
          </section>

          <aside class="space-y-4">
            <section class="rounded-2xl border border-stone-700/70 bg-stone-900/40 p-5">
              <h3 class="font-serif text-xl font-semibold">Tonight’s meal</h3>
              <p class="mt-3 text-3xl font-bold" :class="nourishmentDeficit ? 'text-orange-300' : 'text-emerald-300'">{{ selectedNourishment }} / {{ BARDWALL_DAILY_NOURISHMENT }}</p>
              <p class="mt-2 text-sm text-stone-400">{{ nourishmentDeficit ? `You will wake with ${nourishmentDeficit} hunger.` : 'This is enough food for the day.' }}</p>
            </section>
            <section class="rounded-2xl border border-stone-700/70 bg-stone-900/40 p-5">
              <h3 class="font-serif text-xl font-semibold">Choose where to sleep</h3>
              <div class="mt-4 space-y-3">
                <label class="flex cursor-pointer gap-3 rounded-xl border p-4" :class="lodgingChoice === 'tent' ? 'border-violet-300 bg-violet-300/10' : 'border-stone-700'">
                  <input v-model="lodgingChoice" type="radio" value="tent" class="mt-1 text-violet-400 focus:ring-violet-300" />
                  <span><strong class="block">⛺ Sleep in your tent · Free</strong><span class="mt-1 block text-xs text-stone-400">Restores 75 energy before hunger is applied.</span></span>
                </label>
                <label class="flex gap-3 rounded-xl border p-4" :class="[lodgingChoice === 'inn' ? 'border-amber-300 bg-amber-300/10' : 'border-stone-700', game.coins < BARDWALL_INN_PRICE ? 'cursor-not-allowed opacity-50' : 'cursor-pointer']">
                  <input v-model="lodgingChoice" type="radio" value="inn" class="mt-1 text-amber-400 focus:ring-amber-300" :disabled="game.coins < BARDWALL_INN_PRICE" />
                  <span><strong class="block">🛏️ Crooked Lantern Inn · {{ BARDWALL_INN_PRICE }} coins</strong><span class="mt-1 block text-xs text-stone-400">Restores 100 energy before hunger is applied.</span></span>
                </label>
              </div>
              <p v-if="nightError" class="mt-3 text-sm text-rose-300">{{ nightError }}</p>
              <button data-testid="confirm-end-day" type="button" class="mt-5 w-full rounded-lg bg-violet-300 px-5 py-3 font-semibold text-[#181329] hover:bg-violet-200" @click="endDay">Sleep and begin Day {{ game.day + 1 }}</button>
            </section>
          </aside>
        </div>
      </div>

      <BardwallMorning
        v-else-if="screen === 'morning'"
        :game="game"
        :begin-next-day="beginNextDay"
      />

      <BardwallAmphitheater
        v-else-if="screen === 'amphitheater'"
        :offerings="offerings"
        :loading-offerings="loadingOfferings"
        :offering-error="offeringError"
        :selected-offering-id="selectedOfferingId"
        :selected-offering="selectedOffering"
        :selected-word-count="selectedWordCount"
        :selected-passage-indexes="selectedPassageIndexes"
        :expected-pay="expectedPay"
        :go-to-town="goToTown"
        :select-offering="selectOffering"
        :toggle-passage="togglePassage"
        :tell-story="tellStory"
        :format-date="formatDate"
        :coin-label="coinLabel"
      />

      <BardwallReward
        v-else-if="screen === 'reward'"
        :last-reward="lastReward"
        :coin-label="coinLabel"
        :return-to-town="returnToTown"
      />
    </section>

    <Teleport to="body">
      <div
        v-if="previewChallengeCard"
        data-testid="challenge-card-preview"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        @click.self="closeChallengeCardPreview"
        @keydown.esc="closeChallengeCardPreview"
      >
        <section role="dialog" aria-modal="true" :aria-label="previewChallengeCard.name" class="w-full max-w-md rounded-2xl border border-orange-200/30 bg-[#1b1714] p-5 text-center text-stone-100 shadow-2xl sm:p-6">
          <div class="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl border border-black/40 shadow-2xl [container-type:inline-size]">
            <img :src="getBardwallCardImage(previewChallengeCard.id)" :alt="previewChallengeCard.name" class="block w-full" />
            <span class="pointer-events-none absolute inset-x-0 bottom-[9.5%] px-[7%] text-center font-serif text-[5.4cqw] font-semibold leading-none text-[#3a2b15] [text-shadow:0_1px_1px_rgba(250,240,214,0.55)]">{{ previewChallengeCard.name }}</span>
          </div>
          <p class="mx-auto mt-4 max-w-sm font-serif text-lg leading-7 text-stone-300">{{ previewChallengeCard.meaning }}</p>
          <button type="button" data-testid="close-challenge-card-preview" class="mt-5 rounded-lg border border-stone-600 px-5 py-2.5 text-sm font-semibold text-stone-200 transition hover:border-orange-200 hover:text-orange-100" @click="closeChallengeCardPreview">Close</button>
        </section>
      </div>

      <div
        v-if="showResetDialog"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        @keydown.esc="closeResetDialog"
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-bardwall-title"
          class="w-full max-w-lg rounded-2xl border border-amber-300/30 bg-[#111d18] p-6 text-stone-100 shadow-2xl sm:p-8"
        >
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">Begin a new tale</p>
          <h2 id="reset-bardwall-title" class="mt-2 font-serif text-3xl font-bold">Begin Bardwall again?</h2>
          <p class="mt-4 leading-7 text-stone-300">
            This permanently resets your coins, inventory, daily progress, energy, hunger, unlocked locations, ailments, challenges, and stories told.
          </p>
          <p class="mt-3 text-sm leading-6 text-stone-400">
            Your books, chapters, revisions, and writing activity will not be changed.
          </p>

          <label for="reset-bardwall-confirmation" class="mt-6 block text-sm font-medium text-stone-200">
            Type <strong class="text-amber-300">BARDWALL</strong> to confirm
          </label>
          <input
            id="reset-bardwall-confirmation"
            v-model="resetConfirmation"
            data-testid="reset-bardwall-confirmation"
            type="text"
            autocomplete="off"
            class="mt-2 w-full rounded-lg border border-stone-600 bg-black/20 px-3 py-2.5 text-stone-100 outline-none transition placeholder:text-stone-600 focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20"
            placeholder="BARDWALL"
          />

          <div class="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" class="rounded-lg border border-stone-600 px-4 py-2.5 text-sm font-semibold text-stone-300 hover:border-stone-400 hover:text-white" @click="closeResetDialog">
              Keep this tale
            </button>
            <button
              data-testid="confirm-reset-bardwall"
              type="button"
              class="rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-semibold text-[#13241d] transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
              :disabled="!canResetBardwall"
              @click="beginBardwallAgain"
            >
              Begin again
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </main>
</template>
