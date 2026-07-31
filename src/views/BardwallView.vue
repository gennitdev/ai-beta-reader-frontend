<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowLeftIcon, BookOpenIcon, CurrencyDollarIcon, MoonIcon, SparklesIcon } from '@heroicons/vue/24/outline'
import { useDatabase } from '@/composables/useDatabase'
import BardwallTownMap, { type BardwallLocation } from '@/components/bardwall/BardwallTownMap.vue'
import type { ChapterRevision } from '@/lib/database'
import {
  BARDWALL_INN_PRICE,
  BARDWALL_DAILY_NOURISHMENT,
  BARDWALL_FLOWER_PRICE,
  BARDWALL_MARKET_ITEMS,
  calculateBardwallPay,
  getBardwallDateKey,
  getBardwallPassages,
  loadBardwallState,
  offerFlowerToHeliconia,
  purchaseBardwallFood,
  purchaseBardwallFlower,
  resolveBardwallNight,
  saveBardwallState,
  type BardwallFoodId,
  type BardwallLodging,
  type BardwallPassage,
} from '@/lib/bardwall'

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

const { books, loadBooks, getBookRevisionActivity, getChapterRevisions } = useDatabase()
const screen = ref<'gate' | 'goal' | 'town' | 'amphitheater' | 'reward' | 'market' | 'night' | 'morning' | 'inn' | 'shrine' | 'camp' | 'challenge' | 'cave'>('gate')
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
const shrineMessage = ref<string | null>(null)

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
const selectedNourishment = computed(() => BARDWALL_MARKET_ITEMS.reduce((total, item) => (
  total + item.nourishment * (mealSelection.value[item.id] ?? 0)
), 0))
const nourishmentDeficit = computed(() => Math.max(0, BARDWALL_DAILY_NOURISHMENT - selectedNourishment.value))
const foodInventory = computed(() => BARDWALL_MARKET_ITEMS.filter((item) => game.value.inventory[item.id] > 0))

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

const enterBardwall = async () => {
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

const visitAmphitheater = async () => {
  screen.value = 'amphitheater'
  if (!offerings.value.length && !loadingOfferings.value) await loadOfferings()
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

const returnToTown = () => {
  selectedOfferingId.value = null
  selectedPassageIndexes.value = []
  screen.value = 'town'
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
    game.value = offerFlowerToHeliconia(game.value)
    saveBardwallState(game.value)
    heliconiaEncounterActive.value = true
    shrineMessage.value = null
  } catch {
    shrineMessage.value = 'The bare stone waits. You need a flower from the night market.'
  }
}

const selectMapLocation = async (location: BardwallLocation) => {
  if (location === 'amphitheater') {
    await visitAmphitheater()
    return
  }
  if (location === 'shrine') {
    heliconiaEncounterActive.value = false
    shrineMessage.value = null
  }
  screen.value = location
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

onMounted(() => {
  game.value = loadBardwallState()
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

    <section v-else class="mx-auto min-h-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
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
          <span>{{ game.storiesTold }} stories told</span>
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
        <div class="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <article class="rounded-2xl border border-stone-700/70 bg-stone-900/40 p-7 shadow-xl">
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
              <ul class="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-stone-300">
                <li v-if="game.inventory.tent" class="rounded-lg bg-black/20 p-2">⛺<span class="mt-1 block">Tent</span></li>
                <li v-for="item in foodInventory" :key="item.id" class="rounded-lg bg-black/20 p-2">
                  {{ item.icon }}<span class="mt-1 block">{{ item.name }} ×{{ game.inventory[item.id] }}</span>
                </li>
                <li v-if="game.inventory.flower" class="rounded-lg bg-black/20 p-2">🌺<span class="mt-1 block">Red flower ×{{ game.inventory.flower }}</span></li>
              </ul>
              <p v-if="!foodInventory.length" class="mt-3 text-sm text-stone-500">Your food pouch is empty. Visit the market before nightfall.</p>
            </div>
          </aside>
        </div>
      </div>

      <div v-else-if="screen === 'inn'" class="py-8">
        <button data-testid="back-to-map" class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="screen = 'town'"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
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
        <button data-testid="back-to-map" class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="screen = 'town'"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
        <section class="mx-auto mt-5 max-w-3xl rounded-2xl border border-rose-300/30 bg-[radial-gradient(circle_at_top,#4a2538,#171218_62%)] p-7 text-center shadow-2xl sm:p-10">
          <p class="text-xs font-semibold uppercase tracking-[0.3em] text-rose-300">Town Square</p>
          <div class="mx-auto mt-6 flex h-40 w-40 items-center justify-center rounded-full border border-rose-200/30 bg-black/20 text-7xl shadow-[0_0_50px_rgba(251,113,133,0.12)]">🌺</div>

          <template v-if="heliconiaEncounterActive">
            <p class="mt-7 text-xs font-semibold uppercase tracking-[0.3em] text-rose-300">The goddess appears in person</p>
            <h2 class="mt-3 font-serif text-4xl font-bold">Heliconia</h2>
            <p class="mx-auto mt-5 max-w-2xl font-serif text-xl leading-9 text-stone-200">“I keep faith with lost causes, impossible books, and games whose endings were decided before their beginnings.”</p>
            <div class="mx-auto mt-6 max-w-xl rounded-xl border border-violet-300/25 bg-violet-300/10 p-5 text-left">
              <p class="font-semibold text-violet-200">Heliconia gives you a map.</p>
              <p class="mt-2 text-sm leading-6 text-stone-300">A cave and a narrow forest path appear in violet ink. “Some games can be played in the cave,” she warns. “None of them can be won.”</p>
            </div>
            <button data-testid="return-with-cave-map" class="mt-7 rounded-lg bg-rose-300 px-5 py-3 font-semibold text-[#331522] hover:bg-rose-200" @click="screen = 'town'">Return to the map</button>
          </template>

          <template v-else-if="game.heliconiaMet">
            <h2 class="mt-7 font-serif text-4xl font-bold">Shrine of Heliconia</h2>
            <p class="mx-auto mt-4 max-w-xl font-serif text-lg leading-8 text-stone-300">The flower is gone. The stone is warm. In your pocket, the goddess’s map still shows the path to the cave.</p>
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

      <div v-else-if="screen === 'camp'" class="py-8">
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="screen = 'town'"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
        <section class="mx-auto mt-5 max-w-3xl rounded-2xl border border-emerald-300/20 bg-[radial-gradient(circle_at_top,#243c2f,#101a15_65%)] p-8 text-center shadow-2xl">
          <div class="text-7xl">⛺</div>
          <h2 class="mt-5 font-serif text-4xl font-bold">Forest Camp</h2>
          <p class="mx-auto mt-4 max-w-xl font-serif text-lg leading-8 text-stone-300">Your bedroll waits beneath the town wall. Beyond the firelight, the woods listen with the patience of something that has nowhere else to be.</p>
          <button data-testid="end-day" class="mt-7 inline-flex items-center gap-2 rounded-lg bg-violet-300 px-5 py-3 font-semibold text-[#181329] hover:bg-violet-200" @click="openNight"><MoonIcon class="h-5 w-5" /> End the day</button>
        </section>
      </div>

      <div v-else-if="screen === 'challenge'" class="py-8">
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="screen = 'town'"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
        <section class="mx-auto mt-5 max-w-3xl rounded-2xl border border-stone-600 bg-stone-900/60 p-10 text-center">
          <div class="text-6xl">🎭</div><h2 class="mt-5 font-serif text-4xl font-bold">Challenge Hall</h2>
          <p class="mx-auto mt-4 max-w-xl text-stone-400">The doors are being painted and the judges are still arguing about the rules. Storytelling challenges will be held here soon.</p>
        </section>
      </div>

      <div v-else-if="screen === 'cave'" class="py-8">
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="screen = 'town'"><ArrowLeftIcon class="h-4 w-4" /> Back to the map</button>
        <section class="mx-auto mt-5 max-w-4xl overflow-hidden rounded-2xl border border-violet-300/25 bg-[radial-gradient(circle_at_50%_0%,#34284d,#09080d_65%)] p-8 text-center shadow-2xl sm:p-12">
          <p class="text-xs font-semibold uppercase tracking-[0.35em] text-violet-300">Deep in the haunted wood</p>
          <div class="mx-auto mt-7 flex h-52 max-w-md items-end justify-center rounded-t-[50%] border-x border-t border-stone-500/30 bg-black/70 pb-7 text-6xl">🕯️</div>
          <h2 class="mt-7 font-serif text-4xl font-bold">The Unwinnable Cave</h2>
          <blockquote class="mx-auto mt-5 max-w-2xl font-serif text-xl italic leading-9 text-violet-100">“Some games can be played in the cave. None of them can be won.”</blockquote>
          <p class="mx-auto mt-5 max-w-xl text-stone-400">The first game has not yet been laid out. Still, something in the dark has already taken its seat across from you.</p>
        </section>
      </div>

      <div v-else-if="screen === 'market'" class="py-8">
        <button data-testid="leave-market" class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="screen = 'town'"><ArrowLeftIcon class="h-4 w-4" /> Back to town</button>
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
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="screen = 'town'"><ArrowLeftIcon class="h-4 w-4" /> Not yet—return to town</button>
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
        <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="screen = 'town'"><ArrowLeftIcon class="h-4 w-4" /> Back to town</button>
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
  </main>
</template>
