<script setup lang="ts">
defineProps<{
  heroImageSrc: string | null;
  bookTitle: string;
  chapterTitle: string;
  wordCount: number;
  hasSummary: boolean;
  isEditing: boolean;
  editedTitle: string;
  savingChapter: boolean;
  hasUnsavedChanges: boolean;
}>();

const emit = defineEmits<{
  'update:editedTitle': [value: string];
  'open-lightbox': [];
  'go-back': [];
  'start-edit': [];
  'cancel-edit': [];
  'save-chapter': [];
}>();
</script>

<template>
  <div class="relative w-full">
    <!-- Hero image container -->
    <div
      class="relative h-48 w-full overflow-hidden bg-gray-900 sm:h-64 md:h-80 lg:h-96 cursor-pointer"
      @click="emit('open-lightbox')"
    >
      <img
        :src="heroImageSrc!"
        class="h-full w-full object-cover opacity-90 transition-opacity hover:opacity-100"
        alt="Chapter hero"
      />
      <!-- Gradient overlay -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
      <!-- Chapter info overlay -->
      <div class="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8">
        <p class="text-sm font-medium text-white/80">{{ bookTitle }}</p>
        <h2 v-if="!isEditing" class="mt-1 text-2xl font-bold text-white sm:text-3xl lg:text-4xl">
          {{ chapterTitle || 'Untitled Chapter' }}
        </h2>
        <p class="mt-2 text-sm text-white/70">
          {{ wordCount?.toLocaleString() || 0 }} words
          <span v-if="hasSummary"> &middot; Summarized</span>
        </p>
      </div>
    </div>

    <!-- Title edit field when editing with hero image -->
    <div v-if="isEditing" class="border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
      <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Chapter Title</label>
      <input
        :value="editedTitle"
        @input="emit('update:editedTitle', ($event.target as HTMLInputElement).value)"
        type="text"
        placeholder="Enter chapter title..."
        class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-lg font-semibold text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
      />
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

    <!-- Action buttons overlay -->
    <div class="absolute right-4 top-4 flex items-center gap-2">
      <button
        v-if="!isEditing"
        @click="emit('start-edit')"
        class="inline-flex items-center rounded-md bg-black/50 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-black/70"
      >
        Edit
      </button>
      <button
        v-if="isEditing"
        @click="emit('save-chapter')"
        :disabled="savingChapter || !hasUnsavedChanges"
        class="inline-flex items-center rounded-md bg-blue-600/90 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-blue-700 disabled:opacity-50"
      >
        {{ savingChapter ? 'Saving...' : 'Save' }}
      </button>
      <button
        v-if="isEditing"
        @click="emit('cancel-edit')"
        class="inline-flex items-center rounded-md bg-black/50 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-black/70"
      >
        Cancel
      </button>
    </div>
  </div>
</template>
