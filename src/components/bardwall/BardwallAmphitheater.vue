<script setup lang="ts">
import { ArrowLeftIcon, BookOpenIcon, SparklesIcon } from '@heroicons/vue/24/outline'
import { getBardwallPlaceImage } from '@/lib/bardwallAssets'
import type { RevisionOffering } from '@/types/bardwallView'

defineProps<{
  offerings: RevisionOffering[]
  loadingOfferings: boolean
  offeringError: string | null
  selectedOfferingId: string | null
  selectedOffering: RevisionOffering | null
  selectedWordCount: number
  selectedPassageIndexes: number[]
  expectedPay: number
  goToTown: () => void
  selectOffering: (offering: RevisionOffering) => void
  togglePassage: (index: number) => void
  tellStory: () => void
  formatDate: (value: string) => string
  coinLabel: (value: number) => string
}>()
</script>

<template>
  <div class="py-8">
    <button class="inline-flex items-center gap-2 text-sm text-stone-400 hover:text-white" @click="goToTown"><ArrowLeftIcon class="h-4 w-4" /> Back to town</button>
    <img :src="getBardwallPlaceImage('amphitheater')" alt="The moonlit stone amphitheater where the ghosts gather to listen" class="mx-auto mt-5 block w-full max-w-3xl rounded-2xl border border-stone-700/70 shadow-xl" />
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
</template>
