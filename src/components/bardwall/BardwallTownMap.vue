<script setup lang="ts">
import { computed } from 'vue'
import { bardwallMapImage } from '@/lib/bardwallAssets'

export type BardwallLocation = 'amphitheater' | 'market' | 'inn' | 'shrine' | 'apothecary' | 'camp' | 'challenge' | 'cave'

const props = defineProps<{ caveUnlocked: boolean }>()
const emit = defineEmits<{ select: [location: BardwallLocation] }>()

// x/y are percentages of the map image, chosen to sit over the matching landmark
// in bardwall_map.png while preserving the destinations' relative arrangement.
const locations = computed(() => [
  { id: 'inn' as const, name: 'Crooked Lantern Inn', detail: 'Rooms, rumors, and advice', icon: '🏠', x: 25, y: 18 },
  { id: 'shrine' as const, name: 'Shrine of Heliconia', detail: 'Town Square', icon: '🌺', x: 49, y: 31 },
  { id: 'apothecary' as const, name: 'Moth & Mortar', detail: 'Apothecary and physic', icon: '⚗️', x: 14, y: 47 },
  { id: 'market' as const, name: 'Night Market', detail: 'Food, flowers, and provisions', icon: '🏮', x: 44, y: 53 },
  { id: 'challenge' as const, name: 'Ink & Ember', detail: 'Coffee, company, and story wagers', icon: '☕', x: 21, y: 80 },
  { id: 'amphitheater' as const, name: 'Stone Amphitheater', detail: 'Tell the ghosts a story', icon: '👻', x: 77, y: 20 },
  { id: 'camp' as const, name: 'Forest Camp', detail: 'Your tent beyond the wall', icon: '⛺', x: 57, y: 76 },
  ...(props.caveUnlocked
    ? [{ id: 'cave' as const, name: 'The Unwinnable Cave', detail: 'Some games can be played here', icon: '🕯️', x: 91, y: 84 }]
    : []),
])
</script>

<template>
  <section class="w-full min-w-0 overflow-hidden rounded-2xl border border-[#8b7653]/60 bg-[#d7c49b] p-3 text-[#2b271e] shadow-2xl sm:p-5">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3 px-2">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.28em] text-[#725b32]">Choose a destination</p>
        <h2 class="mt-1 font-serif text-3xl font-bold">Map of Bardwall</h2>
      </div>
      <p class="max-w-sm text-sm text-[#65583f]">The walls keep out many things. They have never managed to keep out a story.</p>
    </div>

    <!-- On mobile the painted map is a banner and destinations stack beneath it; on
         larger screens the destinations are pinned onto the map itself. -->
    <img
      :src="bardwallMapImage"
      alt="A painted map of Bardwall—its walled town, shrine, amphitheater, forest camp, and the cave beyond the wood."
      class="mb-4 block w-full rounded-xl border-2 border-[#796946]/60 object-cover sm:hidden"
    />

    <div class="bardwall-map relative grid w-full min-w-0 gap-3 overflow-hidden rounded-xl border-2 border-[#796946]/60 p-4 sm:block sm:aspect-[16/10] sm:p-0">
      <img
        :src="bardwallMapImage"
        alt=""
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 hidden h-full w-full object-cover sm:block"
      />

      <button
        v-for="location in locations"
        :key="location.id"
        type="button"
        :data-testid="`map-${location.id}`"
        class="map-location group z-10 flex items-center gap-3 rounded-xl border border-[#6f6248]/70 bg-[#efe2bd]/95 p-3 text-left shadow-md backdrop-blur-[1px] transition hover:border-[#3d3525] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#5f4927] sm:w-44"
        :class="{ 'map-location--right': location.id === 'cave' }"
        :style="{ '--map-x': `${location.x}%`, '--map-y': `${location.y}%` }"
        @click="emit('select', location.id)"
      >
        <span class="text-2xl" aria-hidden="true">{{ location.icon }}</span>
        <span>
          <strong class="block font-serif text-sm leading-tight">{{ location.name }}</strong>
          <span class="mt-1 block text-[11px] leading-tight text-[#706246]">{{ location.detail }}</span>
        </span>
      </button>

      <div v-if="!caveUnlocked" class="pointer-events-none z-10 hidden rounded-xl border border-dashed border-[#d6c7a0]/40 bg-[#1e3025]/80 p-3 text-center text-xs text-[#d8d0b7] backdrop-blur-[1px] sm:absolute sm:bottom-[6%] sm:right-[3%] sm:block sm:w-40">
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

  .map-location--right {
    transform: translate(-100%, -50%);
  }

  .map-location--right:hover {
    transform: translate(-100%, calc(-50% - 0.25rem));
  }
}
</style>
