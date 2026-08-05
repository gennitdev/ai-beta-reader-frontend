<script setup lang="ts">
import { SparklesIcon } from '@heroicons/vue/24/outline'

defineProps<{
  lastReward: { coins: number; words: number }
  coinLabel: (value: number) => string
  returnToTown: () => void
}>()
</script>

<template>
  <div class="flex min-h-[32rem] items-center justify-center py-10 text-center">
    <div class="max-w-xl rounded-2xl border border-amber-300/40 bg-amber-300/10 p-8">
      <SparklesIcon class="mx-auto h-12 w-12 text-amber-300" />
      <p class="mt-4 text-xs uppercase tracking-[0.3em] text-amber-300">The ghosts are fed</p>
      <h2 class="mt-3 font-serif text-4xl font-bold">Your story carried through the wood.</h2>
      <p class="mt-4 text-stone-300">The attendant studies the listening dark, then nods. You told {{ lastReward.words.toLocaleString() }} words and earned <strong class="text-amber-300">{{ coinLabel(lastReward.coins) }}</strong>.</p>
      <button data-testid="return-to-town" class="mt-7 rounded-lg bg-amber-300 px-5 py-3 font-semibold text-[#13241d] hover:bg-amber-200" @click="returnToTown">Return to Bardwall</button>
    </div>
  </div>
</template>
