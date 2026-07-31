<script setup lang="ts">
import { computed } from 'vue'

export type BardwallLocation = 'amphitheater' | 'market' | 'inn' | 'shrine' | 'apothecary' | 'camp' | 'challenge' | 'cave'

const props = defineProps<{ caveUnlocked: boolean }>()
const emit = defineEmits<{ select: [location: BardwallLocation] }>()

const locations = computed(() => [
  { id: 'inn' as const, name: 'Crooked Lantern Inn', detail: 'Rooms, rumors, and advice', icon: '🏠', x: 20, y: 22, tone: 'amber' },
  { id: 'shrine' as const, name: 'Shrine of Heliconia', detail: 'Town Square', icon: '🌺', x: 42, y: 40, tone: 'rose' },
  { id: 'apothecary' as const, name: 'Moth & Mortar', detail: 'Apothecary and physic', icon: '⚗️', x: 15, y: 48, tone: 'emerald' },
  { id: 'market' as const, name: 'Night Market', detail: 'Food, flowers, and provisions', icon: '🏮', x: 63, y: 55, tone: 'amber' },
  { id: 'challenge' as const, name: 'Challenge Hall', detail: 'Coming soon', icon: '🎭', x: 25, y: 68, tone: 'stone' },
  { id: 'amphitheater' as const, name: 'Stone Amphitheater', detail: 'Tell the ghosts a story', icon: '👻', x: 79, y: 18, tone: 'sky' },
  { id: 'camp' as const, name: 'Forest Camp', detail: 'Your tent beyond the wall', icon: '⛺', x: 77, y: 70, tone: 'emerald' },
  ...(props.caveUnlocked
    ? [{ id: 'cave' as const, name: 'The Unwinnable Cave', detail: 'Some games can be played here', icon: '🕯️', x: 91, y: 84, tone: 'violet' }]
    : []),
])
</script>

<template>
  <section class="overflow-hidden rounded-2xl border border-[#8b7653]/60 bg-[#d7c49b] p-3 text-[#2b271e] shadow-2xl sm:p-5">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3 px-2">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.28em] text-[#725b32]">Choose a destination</p>
        <h2 class="mt-1 font-serif text-3xl font-bold">Map of Bardwall</h2>
      </div>
      <p class="max-w-sm text-sm text-[#65583f]">The walls keep out many things. They have never managed to keep out a story.</p>
    </div>

    <div class="bardwall-map relative grid gap-3 overflow-hidden rounded-xl border-2 border-[#796946]/60 p-4 sm:block sm:aspect-[16/10] sm:min-h-[34rem]">
      <div class="pointer-events-none absolute inset-0 hidden sm:block">
        <div class="absolute left-[4%] top-[7%] h-[78%] w-[61%] rounded-[45%_38%_42%_48%] border-[10px] border-double border-[#635c49]/70 bg-[#a9b27a]/35"></div>
        <div class="absolute bottom-[8%] right-[5%] top-[6%] w-[34%] rounded-[45%] bg-[#314533]/35"></div>
        <div class="absolute left-[64%] top-[45%] h-2 w-[32%] rotate-[18deg] rounded-full bg-[#b59b6d]/70"></div>
      </div>

      <button
        v-for="location in locations"
        :key="location.id"
        type="button"
        :data-testid="`map-${location.id}`"
        class="map-location group z-10 flex items-center gap-3 rounded-xl border border-[#6f6248]/60 bg-[#efe2bd]/95 p-3 text-left shadow-md transition hover:-translate-y-1 hover:border-[#3d3525] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#5f4927] sm:w-44"
        :style="{ '--map-x': `${location.x}%`, '--map-y': `${location.y}%` }"
        @click="emit('select', location.id)"
      >
        <span class="text-2xl" aria-hidden="true">{{ location.icon }}</span>
        <span>
          <strong class="block font-serif text-sm leading-tight">{{ location.name }}</strong>
          <span class="mt-1 block text-[11px] leading-tight text-[#706246]">{{ location.detail }}</span>
        </span>
      </button>

      <div v-if="!caveUnlocked" class="pointer-events-none z-10 hidden rounded-xl border border-dashed border-[#d6c7a0]/30 bg-[#1e3025]/70 p-3 text-center text-xs text-[#c8c0a7] sm:absolute sm:bottom-[7%] sm:right-[3%] sm:block sm:w-40">
        The oldest part of the wood is not marked.
      </div>
    </div>
  </section>
</template>

<style scoped>
.bardwall-map {
  background:
    radial-gradient(circle at 42% 44%, rgb(197 188 125 / 55%) 0 8%, transparent 9%),
    radial-gradient(circle at 20% 22%, rgb(121 142 90 / 45%), transparent 25%),
    radial-gradient(circle at 80% 55%, rgb(33 63 43 / 70%), transparent 38%),
    linear-gradient(135deg, #c7b580, #8e9b68 52%, #344b37 53%, #1d3026);
}

@media (min-width: 640px) {
  .map-location {
    position: absolute;
    left: var(--map-x);
    top: var(--map-y);
    transform: translate(-50%, -50%);
  }

  .map-location:hover {
    transform: translate(-50%, calc(-50% - 0.25rem));
  }
}
</style>
