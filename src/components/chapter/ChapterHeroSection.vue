<script setup lang="ts">
withDefaults(defineProps<{
  heroImageSrc: string | null;
  showBack?: boolean;
}>(), {
  showBack: true,
});

const emit = defineEmits<{
  'open-lightbox': [];
  'go-back': [];
}>();
</script>

<template>
  <div class="relative w-full">
    <!-- Hero image container -->
    <div
      class="relative h-48 w-full cursor-pointer overflow-hidden bg-navy-900 sm:h-64 md:h-80 lg:h-96"
      @click="emit('open-lightbox')"
    >
      <!-- A blurred cover-fill copy carries the image colors into any side gaps. -->
      <img
        :src="heroImageSrc!"
        class="absolute inset-0 h-full w-full scale-110 object-cover opacity-55 blur-2xl"
        alt=""
        aria-hidden="true"
        data-testid="chapter-hero-backdrop"
      />
      <div class="absolute inset-0 bg-black/25"></div>

      <img
        :src="heroImageSrc!"
        class="relative z-10 h-full w-full object-contain transition-opacity hover:opacity-95"
        alt="Chapter hero"
        data-testid="chapter-hero-image"
      />
      <div class="pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-black/15 via-transparent to-black/10"></div>
    </div>

    <!-- Back button overlay -->
    <button
      v-if="showBack"
      @click="emit('go-back')"
      class="absolute left-4 top-4 z-30 inline-flex items-center rounded-md bg-black/50 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-black/70"
    >
      <svg class="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  </div>
</template>
