<script setup lang="ts">
import { ArrowLeftIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
  bookTitle: string | null
  chaptersCount: number
  totalWordCountLabel: string
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'refresh'): void
}>()
</script>

<template>
  <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="space-y-2">
      <button
        type="button"
        class="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        @click="emit('back')"
      >
        <ArrowLeftIcon class="w-4 h-4 mr-1" />
        Back to Book
      </button>
      <div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Organize Chapters</h1>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          {{ props.bookTitle ?? 'Loading book...' }}
          <span v-if="props.chaptersCount">
            · {{ props.chaptersCount }} chapter{{ props.chaptersCount === 1 ? '' : 's' }}
            · {{ props.totalWordCountLabel }} words
          </span>
        </p>
      </div>
    </div>
    <div class="flex gap-2">
      <button
        type="button"
        class="inline-flex items-center px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        @click="emit('refresh')"
      >
        Refresh
      </button>
    </div>
  </div>
</template>
