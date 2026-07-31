<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowLeftIcon, BookOpenIcon, BuildingLibraryIcon, CurrencyDollarIcon, SparklesIcon } from '@heroicons/vue/24/outline'
import { useDatabase } from '@/composables/useDatabase'
import type { ChapterRevision } from '@/lib/database'
import {
  BARDWALL_INN_PRICE,
  calculateBardwallPay,
  getBardwallDateKey,
  getBardwallPassages,
  loadBardwallState,
  saveBardwallState,
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
const screen = ref<'gate' | 'goal' | 'town' | 'amphitheater' | 'reward'>('gate')
const game = ref(loadBardwallState())
const offerings = ref<RevisionOffering[]>([])
const loadingOfferings = ref(false)
const offeringError = ref<string | null>(null)
const selectedOfferingId = ref<string | null>(null)
const selectedPassageIndexes = ref<number[]>([])
const lastReward = ref({ coins: 0, words: 0 })
const goalChoice = ref<number | 'custom'>(500)
const customGoal = ref('')

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
        <div class="flex gap-4 text-sm text-stone-300">
          <span class="inline-flex items-center gap-1.5"><CurrencyDollarIcon class="h-4 w-4 text-amber-300" /> {{ coinLabel(game.coins) }}</span>
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
            <h3 class="font-semibold text-stone-100">The quartermaster hands you a starter pack</h3>
            <div class="mt-3 flex flex-wrap gap-2 text-sm">
              <span class="rounded-full bg-stone-800 px-3 py-1.5">⛺ Tent</span>
              <span class="rounded-full bg-stone-800 px-3 py-1.5">🍞 Bread</span>
              <span class="rounded-full bg-stone-800 px-3 py-1.5">🧀 Cheese</span>
            </div>
            <p class="mt-3 text-sm leading-6 text-stone-400">
              Unless you earn enough for the inn, you’ll sleep in this tent beyond the wall tonight. You won’t starve, and another bard will always keep the story going—but a warm bed must be earned.
            </p>
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
            <button data-testid="visit-amphitheater" class="mt-7 inline-flex items-center gap-2 rounded-lg bg-amber-300 px-5 py-3 font-semibold text-[#13241d] hover:bg-amber-200" @click="visitAmphitheater">
              <BuildingLibraryIcon class="h-5 w-5" /> Walk to the amphitheater
            </button>
          </article>
          <aside class="space-y-4">
            <div class="rounded-2xl border border-stone-700/70 bg-stone-900/40 p-5">
              <h3 class="font-serif text-xl font-semibold">Your purse</h3>
              <p class="mt-2 text-3xl font-bold text-amber-300">{{ game.coins }}</p>
              <p class="mt-1 text-sm text-stone-400">A room at the inn will come later. For now, every coin proves the ghosts listened.</p>
            </div>
            <div class="rounded-2xl border border-dashed border-stone-700 p-5 text-stone-500">
              <h3 class="font-semibold">The Crooked Lantern Inn</h3>
              <p class="mt-1 text-sm">One night costs {{ BARDWALL_INN_PRICE }} coins. Until then, your tent waits beyond the wall.</p>
            </div>
            <div class="rounded-2xl border border-stone-700/70 bg-stone-900/40 p-5">
              <h3 class="font-serif text-xl font-semibold">Your starter pack</h3>
              <ul class="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-stone-300">
                <li class="rounded-lg bg-black/20 p-2">⛺<span class="mt-1 block">Tent</span></li>
                <li class="rounded-lg bg-black/20 p-2">🍞<span class="mt-1 block">Bread</span></li>
                <li class="rounded-lg bg-black/20 p-2">🧀<span class="mt-1 block">Cheese</span></li>
              </ul>
            </div>
          </aside>
        </div>
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

      <div v-else class="flex min-h-[32rem] items-center justify-center py-10 text-center">
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
