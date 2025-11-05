<script setup lang="ts">
import type { PropType } from 'vue'
import { PencilIcon } from '@heroicons/vue/24/outline'
import { CheckCircleIcon } from '@heroicons/vue/24/solid'
import type { BookChapter } from '@/types/bookView'

const props = defineProps({
  bookId: {
    type: String,
    required: true
  },
  chapter: {
    type: Object as PropType<BookChapter>,
    required: true
  },
  activeChapterId: {
    type: String,
    default: undefined
  },
  editChapter: {
    type: Function as PropType<(chapterId: string) => void>,
    required: true
  }
})

const chapterLink = `/books/${props.bookId}/chapters/${props.chapter.id}`
</script>

<template>
  <router-link
    :to="chapterLink"
    class="block py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer border-l-4"
    :class="
      activeChapterId === chapter.id
        ? 'bg-blue-50 dark:bg-blue-900/20 border-l-blue-500'
        : 'border-l-transparent hover:border-l-gray-300 dark:hover:border-l-gray-600'
    "
  >
    <div class="flex items-center justify-between">
      <div
        class="drag-handle mr-3 cursor-move text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
        @click.prevent.stop
      >
        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path
            d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
          />
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">
          {{ chapter.title || chapter.id }}
        </h3>
        <div class="flex items-center space-x-3 mt-1">
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ chapter.word_count?.toLocaleString() || 0 }} words
          </span>
          <CheckCircleIcon
            :class="chapter.has_summary ? 'text-green-500' : 'text-gray-300'"
            class="w-3 h-3"
            :title="chapter.has_summary ? 'Summarized' : 'Not summarized'"
          />
        </div>
      </div>
      <div class="flex items-center space-x-1 ml-2">
        <button
          @click.prevent.stop="editChapter(chapter.id)"
          class="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          <PencilIcon class="w-3 h-3" />
        </button>
      </div>
    </div>
  </router-link>
</template>
