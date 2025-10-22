<script setup lang="ts">
import { ArrowLeftIcon, CheckCircleIcon, PencilIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
  isMobileRoute: boolean
  chapterTitle: string | null
  chapterId: string
  wordCount: number
  isSummarized: boolean
  isEditing: boolean
  editedTitle: string
  showSummaryPanel: boolean
  savingChapter: boolean
  hasUnsavedChanges: boolean
}>()

const emit = defineEmits<{
  (e: 'go-back'): void
  (e: 'update:editedTitle', value: string): void
  (e: 'toggle-summary-panel'): void
  (e: 'start-edit'): void
  (e: 'cancel-edit'): void
  (e: 'save-chapter'): void
}>()

const handleTitleInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:editedTitle', target.value)
}
</script>

<template>
  <div class="sticky top-0 z-30 border-b border-gray-200/60 bg-white/95 px-4 py-4 backdrop-blur dark:border-gray-700/60 dark:bg-gray-900/95 sm:px-6 lg:px-8">
    <div class="flex items-start justify-between gap-4">
      <div class="flex flex-1 items-center">
        <button
          v-if="isMobileRoute"
          @click="emit('go-back')"
          class="mr-4 rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
        >
          <ArrowLeftIcon class="h-5 w-5" />
        </button>

        <div class="flex-1">
          <div v-if="isEditing" class="space-y-2">
            <input
              :value="editedTitle"
              type="text"
              placeholder="Chapter title (optional)"
              class="w-full border-b-2 border-gray-300 bg-transparent text-2xl font-bold text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:text-white sm:text-3xl"
              @input="handleTitleInput"
            />
          </div>
          <div v-else>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
              {{ chapterTitle || chapterId }}
            </h1>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
            <span class="whitespace-nowrap">{{ wordCount.toLocaleString() }} words</span>
            <div class="flex items-center whitespace-nowrap">
              <CheckCircleIcon
                :class="isSummarized ? 'text-green-500' : 'text-gray-300'"
                class="mr-1 h-4 w-4"
              />
              <span :class="isSummarized ? 'text-green-600' : 'text-gray-500'">
                {{ isSummarized ? 'Summarized' : 'Not summarized' }}
              </span>
            </div>
            <button
              @click="emit('toggle-summary-panel')"
              class="font-medium text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {{ showSummaryPanel ? 'Hide Summary Panel' : 'Show Summary Panel' }}
            </button>
          </div>
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <template v-if="isEditing">
          <button
            @click="emit('cancel-edit')"
            class="rounded-md border border-gray-300 px-3 py-2 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            @click="emit('save-chapter')"
            :disabled="!hasUnsavedChanges || savingChapter"
            class="inline-flex items-center whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              v-if="savingChapter"
              class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            ></span>
            {{ savingChapter ? 'Saving...' : 'Save' }}
          </button>
        </template>
        <template v-else>
          <button
            @click="emit('start-edit')"
            class="inline-flex items-center rounded-md bg-gray-100 px-3 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            <PencilIcon class="mr-1 h-4 w-4" />
            Edit
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
