<script setup lang="ts">
import {
  UserIcon,
  MapPinIcon,
  LightBulbIcon,
  BookOpenIcon,
} from '@heroicons/vue/24/outline'

defineProps<{
  heroImageSrc: string | null;
  bookTitle: string;
  pageName: string;
  pageType: string;
  isMajor: boolean;
}>();

const emit = defineEmits<{
  'open-lightbox': [];
  'go-back': [];
}>();

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'character': return UserIcon
    case 'location': return MapPinIcon
    case 'concept': return LightBulbIcon
    default: return BookOpenIcon
  }
}
</script>

<template>
  <div class="relative w-full">
    <!-- Hero image container -->
    <div
      class="relative h-48 w-full cursor-pointer overflow-hidden bg-navy-900 sm:h-64 md:h-80 lg:h-96"
      @click="emit('open-lightbox')"
    >
      <img
        :src="heroImageSrc!"
        class="h-full w-full object-cover opacity-90 transition-opacity hover:opacity-100"
        alt="Wiki page hero"
      />
      <!-- Gradient overlay -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
      <!-- Page info overlay -->
      <div class="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8">
        <p class="text-sm font-medium text-white/80">{{ bookTitle }}</p>
        <div class="mt-1 flex items-center gap-3">
          <component :is="getTypeIcon(pageType)" class="h-8 w-8 text-white/90" />
          <h2 class="text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
            {{ pageName }}
          </h2>
        </div>
        <div class="mt-2 flex items-center gap-2 text-sm text-white/70">
          <span class="capitalize">{{ pageType }}</span>
          <span v-if="isMajor" class="rounded-full bg-yellow-500/80 px-2 py-0.5 text-xs font-medium text-white">
            Major
          </span>
        </div>
      </div>
    </div>

    <!-- Back button overlay -->
    <button
      @click="emit('go-back')"
      class="absolute left-4 top-4 inline-flex items-center rounded-md bg-black/50 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-black/70"
    >
      <svg class="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  </div>
</template>
