<script setup lang="ts">
import { ref } from 'vue'
import { ClockIcon, ChevronDownIcon, ChevronRightIcon, ChevronUpIcon } from '@heroicons/vue/24/outline'
import type { ChapterRevision } from '@/lib/database'

defineProps<{
  bookId: string
  chapterId: string
  revisions: ChapterRevision[]
  loading?: boolean
}>()

const expanded = ref(false)

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
}).format(new Date(value))
</script>

<template>
  <section id="chapter-versions" class="scroll-mt-20 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-navy-800">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="flex items-center gap-2">
        <ClockIcon class="h-5 w-5 text-gold-600" />
        <span>
          <span class="block text-sm font-semibold text-gray-900 dark:text-white">Chapter versions</span>
          <span class="block text-xs text-gray-500 dark:text-gray-400">
            {{ revisions.length }} saved {{ revisions.length === 1 ? 'version' : 'versions' }}
          </span>
        </span>
      </span>
      <ChevronUpIcon v-if="expanded" class="h-4 w-4 text-gray-500" />
      <ChevronDownIcon v-else class="h-4 w-4 text-gray-500" />
    </button>

    <div v-if="expanded" class="border-t border-gray-200 dark:border-gray-700">
      <p v-if="loading" class="px-4 py-5 text-sm text-gray-500">Loading versions…</p>
      <p v-else-if="revisions.length === 0" class="px-4 py-5 text-sm text-gray-500 dark:text-gray-400">
        Your next chapter save will appear here.
      </p>
      <div v-else class="max-h-72 overflow-y-auto">
          <RouterLink
            v-for="revision in revisions"
            :key="revision.id"
            :to="`/books/${bookId}/chapters/${chapterId}/versions/${revision.id}`"
            class="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-navy-700"
          >
            <span>
              <span class="block text-sm font-medium text-gray-900 dark:text-white">
                {{ revision.revision_kind === 'baseline' ? 'Original version' : formatDate(revision.created_at) }}
              </span>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ revision.word_count.toLocaleString() }} words</span>
            </span>
            <span class="flex shrink-0 items-center gap-3">
              <span v-if="revision.revision_kind === 'save'" class="text-xs">
                <span class="text-emerald-600">+{{ revision.words_added }}</span>
                <span class="ml-2 text-rose-600">−{{ revision.words_removed }}</span>
              </span>
              <ChevronRightIcon class="h-4 w-4 text-gray-400" />
            </span>
          </RouterLink>
      </div>
    </div>
  </section>
</template>
