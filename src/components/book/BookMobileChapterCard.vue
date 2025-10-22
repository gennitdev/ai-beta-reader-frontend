<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'
import { CheckCircleIcon } from '@heroicons/vue/24/solid'
import { PencilIcon } from '@heroicons/vue/24/outline'
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
  expandedSummaries: {
    type: Object as PropType<Set<string>>,
    required: true
  },
  getSummaryPreview: {
    type: Function as PropType<(summary: string) => string>,
    required: true
  },
  toggleSummary: {
    type: Function as PropType<(chapterId: string) => void>,
    required: true
  },
  editChapter: {
    type: Function as PropType<(chapterId: string) => void>,
    required: true
  },
  linkPrefix: {
    type: String,
    default: '/m/books'
  }
})

const chapterLink = computed(
  () => `${props.linkPrefix}/${props.bookId}/chapters/${props.chapter.id}`
)
</script>

<template>
  <div class="px-4 py-4">
    <div class="flex items-start gap-3">
      <router-link :to="chapterLink" class="flex-1">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
          {{ chapter.title || chapter.id }}
        </h3>
        <div class="mt-1 flex flex-wrap items-center gap-4">
          <span class="text-sm text-gray-500 dark:text-gray-400">
            {{ chapter.word_count?.toLocaleString() || 0 }} words
          </span>
          <div class="flex items-center" :title="chapter.has_summary ? 'Summarized' : 'Not summarized'">
            <CheckCircleIcon
              :class="chapter.has_summary ? 'text-green-500' : 'text-gray-300'"
              class="w-4 h-4 mr-1"
            />
            <span :class="chapter.has_summary ? 'text-green-600' : 'text-gray-500'" class="text-sm">
              {{ chapter.has_summary ? 'Summarized' : 'Not summarized' }}
            </span>
          </div>
        </div>

        <div v-if="chapter.has_summary && chapter.summary" class="mt-3">
          <div class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            <span v-if="!expandedSummaries.has(chapter.id)">
              {{ getSummaryPreview(chapter.summary) }}
              <button
                @click.stop.prevent="toggleSummary(chapter.id)"
                class="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
              >
                See more
              </button>
            </span>
            <span v-else>
              {{ chapter.summary }}
              <button
                @click.stop.prevent="toggleSummary(chapter.id)"
                class="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
              >
                Show less
              </button>
            </span>
          </div>
        </div>
      </router-link>

      <button
        @click="editChapter(chapter.id)"
        class="mt-1 inline-flex items-center px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
      >
        <PencilIcon class="w-4 h-4 mr-1" />
        Edit
      </button>
    </div>
  </div>
</template>
