<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeftIcon, BookOpenIcon, CurrencyDollarIcon, MoonIcon, SparklesIcon } from '@heroicons/vue/24/outline'
import { useDatabase } from '@/composables/useDatabase'
import BardwallTownMap, { type BardwallLocation } from '@/components/bardwall/BardwallTownMap.vue'
import type { ChapterRevision } from '@/lib/database'
import {
  BARDWALL_INN_PRICE,
  BARDWALL_DAILY_NOURISHMENT,
  BARDWALL_FLOWER_PRICE,
  BARDWALL_CAFE_ITEMS,
  BARDWALL_CHALLENGE_CARDS,
  BARDWALL_FOOD_ITEMS,
  BARDWALL_MARKET_ITEMS,
  BARDWALL_WYRM_POTIONS,
  HELICONIA_PERSISTENCE_MESSAGES,
  calculateBardwallPay,
  advanceBardwallChallengeDraft,
  countBardwallWords,
  getBardwallDateKey,
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
  toggleBardwallChallengeCard,
  type BardwallFoodId,
  type BardwallLodging,
  type BardwallPotionId,
  type BardwallPassage,
  type BardwallChallengeWager,
} from '@/lib/bardwall'
import { runBardwallStoryChallenge } from '@/lib/openai'

interface RewardPassage extends BardwallPassage {
  id: string
}

interface RevisionOffering {
  id: string
  bookTitle: string
  chapterTitle: string
  createdAt: string
  passages: RewardPassage[]
  wordCount: number
}

type BardwallScreen = 'gate' | 'goal' | 'town' | 'amphitheater' | 'reward' | 'market' | 'night' | 'morning' | 'inn' | 'shrine' | 'apothecary' | 'camp' | 'challenge' | 'cave' | 'wyrm'

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
const heldChallengeCards = computed(() => game.value.challenge.cards.filter((card) => card.held).length)
const challengeStoryWordCount = computed(() => countBardwallWords(game.value.challenge.playerStory))
const challengeFoodWagers = computed(() => BARDWALL_FOOD_ITEMS.filter((item) => game.value.inventory[item.id] > 0))
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
  screen.value = location as BardwallLocation
  if (location === 'amphitheater' && !offerings.value.length && !loadingOfferings.value) {
    await loadOfferings()
  }
}

const goToTown = async () => {
  screen.value = 'town'
  await router.push({ name: 'bardwall' })
}

const goToLocation = async (location: BardwallLocation) => {
  screen.value = location
  await router.push({ name: 'bardwall-location', params: { location } })
}

const goToWyrmGame = async () => {
  screen.value = 'wyrm'
  await router.push({ name: 'bardwall-location', params: { location: 'cave', activity: 'wyrm' } })
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

const parseChallengeWager = (): BardwallChallengeWager | null => {
  const [type, value] = challengeWagerChoice.value.split(':')
  if (type === 'coins') return { type: 'coins', amount: Number(value) }
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
  if (!wager) return
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
  if (challengeStoryWordCount.value < game.value.challenge.goal) return
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

const wagerLabel = (wager: BardwallChallengeWager | null) => {
  if (!wager) return 'No wager'
  if (wager.type === 'coins') return `${wager.amount} ${wager.amount === 1 ? 'coin' : 'coins'}`
  return BARDWALL_FOOD_ITEMS.find((item) => item.id === wager.itemId)?.name ?? 'one item'
}
const scoreTotal = (scores: { cards: number; coherence: number; invention: number; language: number; length: number }) => Object.values(scores).reduce((total, score) => total + score, 0)

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
  challengeMessage.value = null
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
        <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <article class="min-w-0 rounded-2xl border border-stone-700/70 bg-stone-900/40 p-7 shadow-xl">
            <p class="text-sm font-medium text-amber-300">Dusk settles over the crooked roofs.</p>
            <h2 class="mt-3 font-serif text-4xl font-bold">The story must go on.</h2>
            <p class="mt-5 max-w-2xl font-serif text-lg leading-8 text-stone-300">
              Beyond the last wall, ghosts gather in a stone amphitheater. They once fed on human life. Now they accept a stranger nourishment: stories, honestly made and freely told.
            </p>
            <div v-if="dailyGoal" class="mt-6 rounded-xl border border-stone-700 bg-black/20 p-4">
              <div class="flex items-center justify-between gap-4 text-sm">
                <span>Today’s measure: {{ dailyGoal.wordsTold.toLocaleString() }} / {{ dailyGoal.wordCount.toLocaleString() }} words</span>
                <span class="text-amber-300">{{ dailyGoal.coinsEarned }} / {{ BARDWALL_INN_PRICE }} inn coins</span>
              </div>
              <div class="mt-3 h-2 overflow-hidden rounded-full bg-stone-700">
                <div class="h-full rounded-full bg-amber-300 transition-all" :style="{ width: `${dailyProgress}%` }"></div>
              </div>
            </div>
            <BardwallTownMap class="mt-7" :cave-unlocked="game.caveUnlocked" @select="selectMapLocation" />
          </article>
          <aside class="space-y-4">
            <div v-if="game.ailment" class="rounded-2xl border border-lime-300/40 bg-lime-300/10 p-5">
              <h3 class="font-serif text-xl font-semibold text-lime-200">{{ game.ailment.icon }} {{ game.ailment.name }}</h3>
              <p class="mt-2 text-sm leading-6 text-stone-300">{{ game.ailment.description }}</p>
              <button data-testid="go-to-apothecary" class="mt-4 text-sm font-semibold text-lime-200 underline underline-offset-4" @click="goToLocation('apothecary')">Seek treatment at Moth & Mortar</button>
            </div>
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
              <ul class="mt-3 space-y-2 text-sm text-stone-300">
                <li v-if="game.inventory.tent" class="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2.5">
                  <span class="text-xl">⛺</span><span class="min-w-0 flex-1">Tent</span><span class="text-xs text-stone-500">×1</span>
                </li>
                <li v-for="item in foodInventory" :key="item.id" class="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2.5">
                  <span class="text-xl">{{ item.icon }}</span><span class="min-w-0 flex-1">{{ item.name }}</span><span class="text-xs text-stone-500">×{{ game.inventory[item.id] }}</span>
                </li>
                <li v-if="game.inventory.flower" class="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2.5">
                  <span class="text-xl">🌺</span><span class="min-w-0 flex-1">Red shrine flower</span><span class="text-xs text-stone-500">×{{ game.inventory.flower }}</span>
                </li>
              </ul>
              <p v-if="!foodInventory.length" class="mt-3 text-sm text-stone-500">Your food pouch is empty. Visit the market before nightfall.</p>
            </div>
          </aside>
        </div>
      </div>

      <div v-else-if="screen === 'inn'" class="py-8">
        <button data-testid="back-to-map" class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToTown"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
        <section class="mx-auto mt-5 max-w-3xl overflow-hidden rounded-2xl border border-amber-300/30 bg-[linear-gradient(145deg,#332516,#17130e)] shadow-2xl">
          <div class="border-b border-amber-200/15 bg-black/20 p-6 sm:p-8">
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">A fire, a ledger, seven crooked lanterns</p>
            <h2 class="mt-2 font-serif text-4xl font-bold">The Crooked Lantern Inn</h2>
            <p class="mt-3 font-serif text-lg leading-8 text-stone-300">The innkeeper polishes a glass that has probably never been clean. Behind him, every chair faces the fire except one.</p>
          </div>
          <div class="grid gap-5 p-6 sm:grid-cols-[0.35fr_0.65fr] sm:p-8">
            <div class="flex min-h-44 items-center justify-center rounded-xl border border-amber-200/15 bg-amber-100/5 text-center">
              <div><span class="text-5xl">🧔</span><p class="mt-2 text-sm font-semibold text-amber-200">Merrick, innkeeper</p><p class="text-xs text-stone-500">Portrait placeholder</p></div>
            </div>
            <div>
              <p class="font-serif text-lg leading-8 text-stone-200">“A room is {{ BARDWALL_INN_PRICE }} coins when the bells ring. Until then, you’re welcome to warm your hands.”</p>
              <button v-if="!innAdviceShown" data-testid="ask-innkeeper-advice" type="button" class="mt-5 rounded-lg border border-amber-300/50 px-4 py-2.5 font-semibold text-amber-200 hover:bg-amber-300/10" @click="innAdviceShown = true">Ask the innkeeper for advice</button>
              <blockquote v-else class="mt-5 rounded-xl border-l-4 border-rose-300 bg-black/20 p-5 font-serif text-lg leading-8 text-stone-200">
                “Writing a book is precisely the sort of noble, unreasonable undertaking that the goddess of lost causes would take seriously. Go to Heliconia’s shrine in the square. Take a flower.”
              </blockquote>
              <button data-testid="end-day-from-inn" type="button" class="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-300 px-4 py-2.5 font-semibold text-[#302313] hover:bg-amber-200" @click="openNight"><MoonIcon class="h-5 w-5" /> Wait for the final bell</button>
            </div>
          </div>
        </section>
      </div>

      <div v-else-if="screen === 'shrine'" class="py-8">
        <button data-testid="back-to-map" class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToTown"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
        <section class="mx-auto mt-5 max-w-3xl rounded-2xl border border-rose-300/30 bg-[radial-gradient(circle_at_top,#4a2538,#171218_62%)] p-7 text-center shadow-2xl sm:p-10">
          <p class="text-xs font-semibold uppercase tracking-[0.3em] text-rose-300">Town Square</p>
          <div class="mx-auto mt-6 flex h-40 w-40 items-center justify-center rounded-full border border-rose-200/30 bg-black/20 text-7xl shadow-[0_0_50px_rgba(251,113,133,0.12)]">🌺</div>

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
          <div class="border-b border-lime-200/10 p-7 sm:p-9">
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-lime-300">Bottles in the windows, moths in the rafters</p>
            <h2 class="mt-2 font-serif text-4xl font-bold">Moth & Mortar</h2>
            <p class="mt-3 font-serif text-lg leading-8 text-stone-300">The apothecary smells of rosemary, rainwater, and remedies invented for ailments no sensible person would acquire.</p>
          </div>
          <div class="grid gap-6 p-7 sm:grid-cols-[0.35fr_0.65fr] sm:p-9">
            <div class="flex min-h-44 items-center justify-center rounded-xl border border-lime-200/15 bg-black/20 text-center">
              <div><span class="text-5xl">🧑‍⚕️</span><p class="mt-2 text-sm font-semibold text-lime-200">Iona, apothecary</p><p class="text-xs text-stone-500">Portrait placeholder</p></div>
            </div>
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
                <p class="mt-4 text-sm leading-6 text-stone-400">Iona keeps a shelf reserved for the cave. Every bottle on it has been opened more than once.</p>
              </template>
            </div>
          </div>
        </section>
      </div>

      <div v-else-if="screen === 'camp'" class="py-8">
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToTown"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
        <section class="mx-auto mt-5 max-w-3xl rounded-2xl border border-emerald-300/20 bg-[radial-gradient(circle_at_top,#243c2f,#101a15_65%)] p-8 text-center shadow-2xl">
          <div class="text-7xl">⛺</div>
          <h2 class="mt-5 font-serif text-4xl font-bold">Forest Camp</h2>
          <p class="mx-auto mt-4 max-w-xl font-serif text-lg leading-8 text-stone-300">Your bedroll waits beneath the town wall. Beyond the firelight, the woods listen with the patience of something that has nowhere else to be.</p>
          <button data-testid="end-day" class="mt-7 inline-flex items-center gap-2 rounded-lg bg-violet-300 px-5 py-3 font-semibold text-[#181329] hover:bg-violet-200" @click="openNight"><MoonIcon class="h-5 w-5" /> End the day</button>
        </section>
      </div>

      <div v-else-if="screen === 'challenge'" class="py-8">
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToTown"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
        <section class="mx-auto mt-5 max-w-5xl overflow-hidden rounded-2xl border border-orange-200/20 bg-[linear-gradient(145deg,#33251c,#151311)] shadow-2xl">
          <header class="border-b border-orange-200/15 bg-black/20 p-7 sm:p-9">
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300">Coffee, company, and dangerous confidence</p>
            <h2 class="mt-2 font-serif text-4xl font-bold">Ink & Ember Coffeehouse</h2>
            <p class="mt-3 max-w-3xl font-serif text-lg leading-8 text-stone-300">Bards crowd the long tables with ink-stained cups and stories they swear are almost finished. Orla Fen waves you over. Tamsin Quill is already shuffling the painted deck.</p>
          </header>

          <div class="grid gap-6 p-6 lg:grid-cols-[0.7fr_1.3fr] sm:p-8">
            <aside class="space-y-4">
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

              <template v-if="game.challenge.phase === 'setup'">
                <p class="text-xs font-semibold uppercase tracking-[0.25em] text-orange-300">Take a seat</p>
                <h3 class="mt-2 font-serif text-3xl font-bold">Set the terms.</h3>
                <p class="mt-3 text-sm leading-6 text-stone-400">Choose your story length and place one safe wager. Orla and Tamsin will each match it.</p>
                <h4 class="mt-6 text-sm font-semibold">Story goal</h4>
                <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button v-for="goal in ([100, 250, 500, 1000] as const)" :key="goal" class="rounded-lg border px-3 py-2.5 text-sm font-semibold" :class="challengeGoalChoice === goal ? 'border-orange-200 bg-orange-200 text-[#302018]' : 'border-stone-600 hover:border-stone-400'" @click="challengeGoalChoice = goal">{{ goal.toLocaleString() }} words</button>
                </div>
                <h4 class="mt-6 text-sm font-semibold">Your wager</h4>
                <div class="mt-3 grid gap-2 sm:grid-cols-2">
                  <label v-for="amount in [1, 5, 10]" :key="amount" class="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-700 p-3 has-[:checked]:border-orange-300 has-[:checked]:bg-orange-300/10" :class="game.coins < amount ? 'pointer-events-none opacity-40' : ''"><input v-model="challengeWagerChoice" type="radio" :value="`coins:${amount}`" :disabled="game.coins < amount" /><span>🪙 {{ amount }} {{ amount === 1 ? 'coin' : 'coins' }}</span></label>
                  <label v-for="item in challengeFoodWagers" :key="item.id" class="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-700 p-3 has-[:checked]:border-orange-300 has-[:checked]:bg-orange-300/10"><input v-model="challengeWagerChoice" type="radio" :value="`item:${item.id}`" /><span>{{ item.icon }} {{ item.name }}</span></label>
                </div>
                <p class="mt-4 text-xs text-stone-500">The table will hold three matching stakes. Win and take all three; draw and reclaim yours; lose and your stake is gone.</p>
                <button data-testid="start-coffeehouse-challenge" class="mt-6 w-full rounded-lg bg-orange-200 px-5 py-3 font-semibold text-[#302018] hover:bg-orange-100" @click="beginCoffeehouseChallenge">Place the wager and draw</button>
              </template>

              <template v-else-if="game.challenge.phase === 'draft'">
                <p class="text-xs font-semibold uppercase tracking-[0.25em] text-orange-300">Draw {{ game.challenge.drawNumber }}</p>
                <h3 class="mt-2 font-serif text-3xl font-bold">Choose what the story must contain.</h3>
                <p class="mt-3 text-sm text-stone-400">Keep at least one card. Unkept cards return to the deck.</p>
                <div class="mt-6 grid gap-3 sm:grid-cols-3">
                  <button v-for="entry in challengeCards" :key="entry.card.id" :data-testid="`challenge-card-${entry.card.id}`" class="rounded-xl border p-4 text-left transition" :class="entry.held ? 'border-orange-200 bg-orange-200/10 ring-1 ring-orange-200' : 'border-stone-600 bg-stone-900/50 hover:border-stone-400'" @click="toggleChallengeCard(entry.card.id)"><span class="text-4xl">{{ entry.card.icon }}</span><strong class="mt-3 block font-serif text-lg">{{ entry.card.name }}</strong><span class="mt-2 block text-xs leading-5 text-stone-400">{{ entry.card.meaning }}</span><span class="mt-3 block text-xs font-semibold" :class="entry.held ? 'text-orange-200' : 'text-stone-500'">{{ entry.held ? 'Kept' : 'Tap to keep' }}</span></button>
                </div>
                <button data-testid="advance-challenge-draft" class="mt-6 w-full rounded-lg bg-orange-200 px-5 py-3 font-semibold text-[#302018] hover:bg-orange-100 disabled:opacity-40" :disabled="heldChallengeCards === 0" @click="advanceChallengeDraft">{{ heldChallengeCards === 3 ? 'Use these three cards' : `Redraw ${3 - heldChallengeCards} ${3 - heldChallengeCards === 1 ? 'card' : 'cards'}` }}</button>
              </template>

              <template v-else-if="game.challenge.phase === 'write'">
                <p class="text-xs font-semibold uppercase tracking-[0.25em] text-orange-300">The cards are set · {{ wagerLabel(game.challenge.wager) }} wagered</p>
                <h3 class="mt-2 font-serif text-3xl font-bold">Tell your story.</h3>
                <div class="mt-5 grid gap-2 sm:grid-cols-3"><div v-for="entry in challengeCards" :key="entry.card.id" class="rounded-lg border border-orange-200/20 bg-orange-200/5 p-3"><span class="text-xl">{{ entry.card.icon }}</span><strong class="ml-2 text-sm">{{ entry.card.name }}</strong><p class="mt-2 text-xs text-stone-400">{{ entry.card.meaning }}</p></div></div>
                <div class="mt-5 flex items-center justify-between text-sm"><label for="challenge-story" class="font-semibold">Your telling</label><span :class="challengeStoryWordCount >= game.challenge.goal ? 'text-emerald-300' : 'text-stone-400'">{{ challengeStoryWordCount.toLocaleString() }} / {{ game.challenge.goal.toLocaleString() }} words</span></div>
                <textarea id="challenge-story" data-testid="challenge-story" :value="game.challenge.playerStory" class="mt-2 min-h-80 w-full rounded-xl border border-stone-600 bg-[#110f0e] p-4 font-serif leading-7 text-stone-100 outline-none focus:border-orange-200" placeholder="Begin the story…" @input="updateChallengeStory"></textarea>
                <p class="mt-3 text-xs text-stone-500">Your draft is saved locally as you write. The judge considers card use, coherence, invention, language, and whether you substantially met the chosen length.</p>
                <button data-testid="submit-challenge-story" class="mt-5 w-full rounded-lg bg-orange-200 px-5 py-3 font-semibold text-[#302018] hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40" :disabled="challengeStoryWordCount < game.challenge.goal || judgingChallenge" @click="judgeChallenge">{{ judgingChallenge ? 'Orla tells her story; Tamsin deliberates…' : 'Tell the story at the table' }}</button>
              </template>

              <template v-else-if="game.challenge.result">
                <p class="text-xs font-semibold uppercase tracking-[0.25em]" :class="game.challenge.result.outcome === 'win' ? 'text-emerald-300' : game.challenge.result.outcome === 'lose' ? 'text-rose-300' : 'text-sky-300'">Tamsin Quill’s decision</p>
                <h3 class="mt-2 font-serif text-4xl font-bold">{{ game.challenge.result.outcome === 'win' ? 'The table is yours.' : game.challenge.result.outcome === 'lose' ? 'Orla takes the stakes.' : 'A draw. Your wager returns.' }}</h3>
                <p class="mt-4 font-serif text-lg leading-8 text-stone-300">“{{ game.challenge.result.explanation }}”</p>
                <div class="mt-6 grid gap-3 sm:grid-cols-2"><div class="rounded-xl border border-stone-700 p-4"><p class="text-sm font-semibold">Your story</p><p class="mt-2 text-3xl font-bold text-orange-200">{{ scoreTotal(game.challenge.result.playerScores) }} / 50</p></div><div class="rounded-xl border border-stone-700 p-4"><p class="text-sm font-semibold">Orla Fen</p><p class="mt-2 text-3xl font-bold text-violet-200">{{ scoreTotal(game.challenge.result.rivalScores) }} / 50</p></div></div>
                <div class="mt-4 grid grid-cols-5 gap-1 text-center text-[10px] text-stone-400"><span v-for="label in ['Cards', 'Coherence', 'Invention', 'Language', 'Length']" :key="label">{{ label }}</span><template v-for="(scores, scoreIndex) in [game.challenge.result.playerScores, game.challenge.result.rivalScores]" :key="scoreIndex"><span>{{ scores.cards }}</span><span>{{ scores.coherence }}</span><span>{{ scores.invention }}</span><span>{{ scores.language }}</span><span>{{ scores.length }}</span></template></div>
                <details class="mt-6 rounded-xl border border-stone-700 bg-black/20 p-4"><summary class="cursor-pointer font-semibold">Read Orla’s story</summary><p class="mt-4 whitespace-pre-wrap font-serif leading-7 text-stone-300">{{ game.challenge.result.rivalStory }}</p></details>
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
          <div class="mx-auto mt-7 flex h-52 max-w-md items-end justify-center rounded-t-[50%] border-x border-t border-stone-500/30 bg-black/70 pb-7 text-6xl">🕯️</div>
          <h2 class="mt-7 font-serif text-4xl font-bold">The Unwinnable Cave</h2>
          <blockquote class="mx-auto mt-5 max-w-2xl font-serif text-xl italic leading-9 text-violet-100">“Some games can be played in the cave. None of them can be won.”</blockquote>
          <p v-if="game.ailment" class="mx-auto mt-5 max-w-xl rounded-xl border border-lime-300/30 bg-lime-300/10 p-4 text-sm text-lime-100">You are still suffering from {{ game.ailment.name }}. The cave will wait while you seek treatment at Moth & Mortar.</p>
          <div class="mt-8 grid gap-4 text-left sm:grid-cols-2">
            <article class="rounded-xl border border-stone-600/60 bg-black/30 p-5 opacity-70">
              <p class="text-xs font-semibold uppercase tracking-wider text-stone-400">Being prepared</p>
              <h3 class="mt-2 font-serif text-2xl font-semibold">The Game of the Last Word</h3>
              <p class="mt-3 text-sm leading-6 text-stone-400">The cave continues every story after you try to end it. The speaking stones are not yet ready.</p>
              <span class="mt-5 inline-block rounded-full bg-stone-700 px-3 py-1 text-xs">Coming soon</span>
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

      <div v-else-if="screen === 'wyrm'" class="py-8">
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToLocation('cave')"><ArrowLeftIcon class="h-4 w-4" /> Leave the table</button>
        <section class="mx-auto mt-5 max-w-5xl overflow-hidden rounded-2xl border border-amber-300/25 bg-[radial-gradient(circle_at_top,#49351c,#15100b_62%)] p-7 shadow-2xl sm:p-10">
          <div class="text-center">
            <p class="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">The game is always set</p>
            <div class="mt-5 text-7xl">🐉</div>
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
                <span class="mx-auto flex h-14 w-10 items-center justify-center rounded-b-xl rounded-t-sm border border-white/30 text-2xl shadow-[0_0_20px_rgba(255,255,255,0.08)]" :style="{ backgroundColor: potion.color }">{{ potion.icon }}</span>
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

      <div v-else-if="screen === 'morning'" class="flex min-h-[34rem] items-center justify-center py-10">
        <section v-if="game.lastNight" class="w-full max-w-2xl rounded-2xl border border-sky-300/30 bg-stone-900/60 p-8 text-center shadow-2xl">
          <p class="text-xs font-semibold uppercase tracking-[0.3em] text-sky-300">Morning in Bardwall</p>
          <h2 class="mt-3 font-serif text-4xl font-bold">Day {{ game.day }} begins.</h2>
          <p class="mt-4 font-serif text-lg text-stone-300">You slept {{ game.lastNight.lodging === 'inn' ? 'at the Crooked Lantern Inn' : 'in your tent beyond the wall' }} and ate {{ game.lastNight.nourishment }} nourishment.</p>
          <div class="mx-auto mt-7 grid max-w-md grid-cols-2 gap-4">
            <div class="rounded-xl bg-black/20 p-4"><span class="block text-sm text-stone-400">Energy</span><strong class="mt-1 block text-3xl text-sky-300">{{ game.energy }}</strong></div>
            <div class="rounded-xl bg-black/20 p-4"><span class="block text-sm text-stone-400">Hunger</span><strong class="mt-1 block text-3xl" :class="game.hunger ? 'text-orange-300' : 'text-emerald-300'">{{ game.hunger }}</strong></div>
          </div>
          <p class="mt-5 text-sm text-stone-400">{{ game.hunger ? 'An empty stomach follows you into the new day, and your energy suffers.' : 'You wake fed and ready to tell another story.' }}</p>
          <button data-testid="begin-next-day" class="mt-7 rounded-lg bg-sky-300 px-5 py-3 font-semibold text-[#10212a] hover:bg-sky-200" @click="beginNextDay">Set Day {{ game.day }}’s word goal</button>
        </section>
      </div>

      <div v-else-if="screen === 'amphitheater'" class="py-8">
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToTown"><ArrowLeftIcon class="h-4 w-4" /> Back to town</button>
        <div class="mt-5 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <section class="rounded-2xl border border-stone-700/70 bg-stone-900/40 p-5">
            <h2 class="font-serif text-2xl font-bold">Choose a recent telling</h2>
            <p class="mt-2 text-sm text-stone-400">The ghosts accept passages newly added in one of your saved revisions. Each passage can satisfy them only once.</p>
            <p v-if="loadingOfferings" class="mt-6 text-sm text-stone-400">The town crier is gathering your pages…</p>
            <p v-else-if="offeringError" class="mt-6 text-sm text-rose-300">{{ offeringError }}</p>
            <p v-else-if="!offerings.length" class="mt-6 text-sm text-stone-400">Save a chapter revision, then return when you have a new story to tell.</p>
            <div v-else class="mt-5 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
              <button
                v-for="offering in offerings"
                :key="offering.id"
                type="button"
                :data-testid="`revision-offering-${offering.id}`"
                class="w-full rounded-xl border p-4 text-left transition"
                :class="selectedOfferingId === offering.id ? 'border-amber-300 bg-amber-300/10' : 'border-stone-700 bg-black/10 hover:border-stone-500'"
                @click="selectOffering(offering)"
              >
                <span class="block font-semibold text-stone-100">{{ offering.chapterTitle }}</span>
                <span class="mt-1 block text-xs text-stone-400">{{ offering.bookTitle }} · {{ formatDate(offering.createdAt) }}</span>
                <span class="mt-2 block text-xs text-emerald-300">{{ offering.wordCount.toLocaleString() }} new words</span>
              </button>
            </div>
          </section>

          <section class="rounded-2xl border border-stone-700/70 bg-stone-900/40 p-5">
            <template v-if="selectedOffering">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="text-xs uppercase tracking-wider text-amber-300">At the speaking stone</p>
                  <h2 class="mt-1 font-serif text-2xl font-bold">{{ selectedOffering.chapterTitle }}</h2>
                </div>
                <span class="text-sm text-stone-400">{{ selectedWordCount.toLocaleString() }} words selected</span>
              </div>
              <div class="mt-5 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                <label v-for="(passage, index) in selectedOffering.passages" :key="index" class="flex cursor-pointer gap-3 rounded-xl border border-stone-700 bg-black/15 p-4 hover:border-stone-500">
                  <input type="checkbox" class="mt-1 rounded border-stone-500 bg-transparent text-amber-400 focus:ring-amber-300" :checked="selectedPassageIndexes.includes(index)" @change="togglePassage(index)" />
                  <span>
                    <span class="block whitespace-pre-wrap font-serif leading-7 text-stone-200">{{ passage.text }}</span>
                    <span class="mt-2 block text-xs text-stone-500">{{ passage.wordCount }} words</span>
                  </span>
                </label>
              </div>
              <div class="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-stone-700 pt-5">
                <p class="text-sm text-stone-300">If the spirits seem satisfied, the attendant will pay <strong class="text-amber-300">{{ coinLabel(expectedPay) }}</strong>.</p>
                <button data-testid="tell-story" class="inline-flex items-center gap-2 rounded-lg bg-amber-300 px-5 py-3 font-semibold text-[#13241d] hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40" :disabled="selectedWordCount === 0" @click="tellStory">
                  <BookOpenIcon class="h-5 w-5" /> Tell this story
                </button>
              </div>
            </template>
            <div v-else class="flex min-h-80 flex-col items-center justify-center text-center text-stone-500">
              <SparklesIcon class="h-10 w-10" />
              <p class="mt-3 max-w-sm font-serif text-lg">Choose a revision. The ghosts are patient, but the story must go on.</p>
            </div>
          </section>
        </div>
      </div>

      <div v-else-if="screen === 'reward'" class="flex min-h-[32rem] items-center justify-center py-10 text-center">
        <div class="max-w-xl rounded-2xl border border-amber-300/40 bg-amber-300/10 p-8">
          <SparklesIcon class="mx-auto h-12 w-12 text-amber-300" />
          <p class="mt-4 text-xs uppercase tracking-[0.3em] text-amber-300">The ghosts are fed</p>
          <h2 class="mt-3 font-serif text-4xl font-bold">Your story carried through the wood.</h2>
          <p class="mt-4 text-stone-300">The attendant studies the listening dark, then nods. You told {{ lastReward.words.toLocaleString() }} words and earned <strong class="text-amber-300">{{ coinLabel(lastReward.coins) }}</strong>.</p>
          <button data-testid="return-to-town" class="mt-7 rounded-lg bg-amber-300 px-5 py-3 font-semibold text-[#13241d] hover:bg-amber-200" @click="returnToTown">Return to Bardwall</button>
        </div>
      </div>
    </section>

    <Teleport to="body">
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
