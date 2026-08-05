<script setup lang="ts">
import type { BardwallState } from '@/lib/bardwall'

defineProps<{
  game: BardwallState
  beginNextDay: () => void
}>()
</script>

<template>
  <div class="flex min-h-[34rem] items-center justify-center py-10">
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
</template>
