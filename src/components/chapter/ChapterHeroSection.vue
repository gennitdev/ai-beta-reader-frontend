<script setup lang="ts">
import CoverHeroImage from '@/components/images/CoverHeroImage.vue';

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
    <CoverHeroImage
      :src="heroImageSrc!"
      alt="Chapter hero"
      test-id-prefix="chapter"
      @activate="emit('open-lightbox')"
    >
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/10"></div>
    </CoverHeroImage>

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
