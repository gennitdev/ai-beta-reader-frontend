<script setup lang="ts">
import { ref, toRefs, watch } from 'vue'
import { DocumentTextIcon, BookOpenIcon, PlusIcon, Cog6ToothIcon, PencilIcon } from '@heroicons/vue/24/outline'
import type { Book } from '@/lib/database'
import type { BookChapter, BookChaptersByPart, BookWikiPage } from '@/types/bookView'
import type { PropType } from 'vue'
import BookMobileChapterCard from './BookMobileChapterCard.vue'

const props = defineProps({
  book: {
    type: Object as PropType<Book | null>,
    default: null
  },
  bookId: {
    type: String,
    required: true
  },
  isEditingBookTitle: {
    type: Boolean,
    default: false
  },
  editingBookTitle: {
    type: String,
    default: ''
  },
  currentTab: {
    type: String as PropType<'chapters' | 'wiki'>,
    default: 'chapters'
  },
  loading: {
    type: Boolean,
    default: false
  },
  loadingWiki: {
    type: Boolean,
    default: false
  },
  chaptersByPart: {
    type: Object as PropType<BookChaptersByPart>,
    required: true
  },
  sortedChapters: {
    type: Array as PropType<BookChapter[]>,
    default: () => []
  },
  chapterCount: {
    type: Number,
    default: 0
  },
  totalWordCount: {
    type: Number,
    default: 0
  },
  expandedSummaries: {
    type: Object as PropType<Set<string>>,
    required: true
  },
  wikiPagesByType: {
    type: Object as PropType<Record<string, BookWikiPage[]>>,
    default: () => ({})
  },
  formatWordCount: {
    type: Function as PropType<(count: number) => string>,
    required: true
  },
  wordCountForChapters: {
    type: Function as PropType<(chapters: BookChapter[]) => number>,
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
  createNewChapter: {
    type: Function as PropType<() => void>,
    required: true
  },
  goToOrganizeChapters: {
    type: Function as PropType<() => void>,
    required: true
  },
  createNewChapterInPart: {
    type: Function as PropType<(partId: string) => void>,
    required: true
  },
  editChapter: {
    type: Function as PropType<(chapterId: string) => void>,
    required: true
  },
  startEditingBookTitle: {
    type: Function as PropType<() => void>,
    required: true
  },
  saveBookTitle: {
    type: Function as PropType<() => void>,
    required: true
  },
  cancelEditingBookTitle: {
    type: Function as PropType<() => void>,
    required: true
  },
  updateEditingBookTitle: {
    type: Function as PropType<(value: string) => void>,
    required: true
  },
  getTypeIcon: {
    type: Function as PropType<(type: string) => any>,
    required: true
  },
  getTypeColor: {
    type: Function as PropType<(type: string) => string>,
    required: true
  }
})

const {
  book,
  bookId,
  isEditingBookTitle,
  editingBookTitle,
  currentTab,
  loading,
  loadingWiki,
  sortedChapters,
  chaptersByPart,
  chapterCount,
  totalWordCount,
  expandedSummaries,
  wikiPagesByType
} = toRefs(props)

const expandedMobileParts = ref<Set<string>>(new Set())

const isPartExpanded = (partId: string) => expandedMobileParts.value.has(partId)

const toggleMobilePart = (partId: string) => {
  const next = new Set(expandedMobileParts.value)
  if (next.has(partId)) {
    next.delete(partId)
  } else {
    next.add(partId)
  }
  expandedMobileParts.value = next
}

watch(
  () => chaptersByPart.value.parts.map(part => part.id),
  ids => {
    const next = new Set<string>()
    ids.forEach(id => {
      if (expandedMobileParts.value.has(id)) {
        next.add(id)
      }
    })
    expandedMobileParts.value = next
  }
)
</script>

<template>
  <div class="lg:hidden max-w-6xl mx-auto p-6">
    <div class="mb-8">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="flex-1">
          <div v-if="isEditingBookTitle" class="flex items-center space-x-2">
            <input
              :value="editingBookTitle"
              @input="updateEditingBookTitle(($event.target as HTMLInputElement).value)"
              @keyup.enter="saveBookTitle"
              @keyup.esc="cancelEditingBookTitle"
              type="text"
              class="text-3xl font-bold bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Book title"
              autofocus
            />
            <button @click="saveBookTitle" class="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
              Save
            </button>
            <button @click="cancelEditingBookTitle" class="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
              Cancel
            </button>
          </div>

          <div v-else class="flex items-center space-x-2 group">
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">{{ book?.title }}</h1>
            <button
              @click="startEditingBookTitle"
              class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Rename book"
            >
              <PencilIcon class="w-5 h-5" />
            </button>
          </div>

          <p class="text-gray-600 dark:text-gray-400 mt-1">
            {{ chapterCount }} chapters · {{ formatWordCount(totalWordCount) }} words total
          </p>
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <button @click="createNewChapter" class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <PlusIcon class="w-5 h-5 mr-2" />
            New Chapter
          </button>
          <button @click="goToOrganizeChapters" class="inline-flex items-center px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
            <Cog6ToothIcon class="w-5 h-5 mr-2" />
            Organize Chapters
          </button>
        </div>
      </div>
    </div>

    <div class="flex space-x-1 rounded-xl bg-blue-900/20 p-1 mb-6">
      <router-link
        :to="`/books/${bookId}`"
        :class="[
          'w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-700 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 flex items-center justify-center',
          currentTab === 'chapters'
            ? 'bg-white text-blue-700 shadow'
            : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
        ]"
      >
        <DocumentTextIcon class="w-5 h-5 inline mr-2" />
        Chapters
      </router-link>
      <router-link
        :to="`/books/${bookId}?tab=wiki`"
        :class="[
          'w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-400 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 flex items-center justify-center',
          currentTab === 'wiki'
            ? 'bg-white text-blue-700 shadow'
            : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
        ]"
      >
        <BookOpenIcon class="w-5 h-5 inline mr-2" />
        Characters
      </router-link>
    </div>

    <div v-if="currentTab === 'chapters'">
      <div v-if="loading" class="flex justify-center items-center h-64">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <div v-else-if="sortedChapters.length > 0" >
        <section
          v-for="part in chaptersByPart.parts"
          :key="part.id"
          class="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm"
        >
          <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <button
              type="button"
              class="w-full flex items-center justify-between gap-3 text-left"
              @click="toggleMobilePart(part.id)"
              :aria-expanded="isPartExpanded(part.id)"
              :aria-controls="`mobile-part-${part.id}`"
            >
              <div class="w-full">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ part.name }}</h2>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {{ part.chapters.length }} chapter{{ part.chapters.length !== 1 ? 's' : '' }} ·
                  {{ formatWordCount(part.wordCount) }} words
                </p>
              </div>
              <svg
                class="h-5 w-5 text-gray-500 dark:text-gray-300 transition-transform duration-200"
                :class="isPartExpanded(part.id) ? 'rotate-180' : ''"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div class="flex items-center gap-2">
              <router-link
                :to="`/books/${bookId}/parts/${part.id}`"
                class="inline-flex items-center rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30"
              >
                View Part
              </router-link>
              <button
                @click="createNewChapterInPart(part.id)"
                class="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700"
              >
                <PlusIcon class="mr-2 h-4 w-4" />
                Add Chapter
              </button>
            </div>
          </div>

          <div
            v-if="isPartExpanded(part.id)"
            :id="`mobile-part-${part.id}`"
            class="space-y-4 px-4 py-4"
          >
            <BookMobileChapterCard
              v-for="chapter in part.chapters"
              :key="chapter.id"
              :book-id="bookId"
              :chapter="chapter"
              :expanded-summaries="expandedSummaries"
              :get-summary-preview="getSummaryPreview"
              :toggle-summary="toggleSummary"
              :edit-chapter="editChapter"
            />
          </div>
        </section>

        <section
          v-if="chaptersByPart.uncategorized.length > 0"
          class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm"
        >
          <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Uncategorized</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {{ chaptersByPart.uncategorized.length }} chapter{{
                  chaptersByPart.uncategorized.length !== 1 ? 's' : ''
                }}
              </p>
            </div>
            <button @click="createNewChapter" class="inline-flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <PlusIcon class="w-4 h-4 mr-2" />
              Add Chapter
            </button>
          </div>

          <div class="divide-y divide-gray-200 dark:divide-gray-700">
            <BookMobileChapterCard
              v-for="chapter in chaptersByPart.uncategorized"
              :key="chapter.id"
              :book-id="bookId"
              :chapter="chapter"
              :expanded-summaries="expandedSummaries"
              :get-summary-preview="getSummaryPreview"
              :toggle-summary="toggleSummary"
              :edit-chapter="editChapter"
            />
          </div>
        </section>

        <section
          v-if="chaptersByPart.parts.length === 0"
          class="space-y-4"
        >
          <div
            v-for="chapter in sortedChapters"
            :key="chapter.id"
            class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm"
          >
            <BookMobileChapterCard
              :book-id="bookId"
              :chapter="chapter"
              :expanded-summaries="expandedSummaries"
              :get-summary-preview="getSummaryPreview"
              :toggle-summary="toggleSummary"
              :edit-chapter="editChapter"
            />
          </div>
        </section>
      </div>

      <div v-else class="text-center py-16">
        <DocumentTextIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No chapters yet</h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Add your first chapter to start getting AI feedback.
        </p>
        <button @click="createNewChapter" class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <PlusIcon class="w-5 h-5 mr-2" />
          Add First Chapter
        </button>
      </div>
    </div>

    <div v-else>
      <div v-if="loadingWiki" class="flex justify-center items-center h-64">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <div v-else-if="Object.keys(wikiPagesByType).length > 0" class="space-y-8">
        <div v-for="(pages, type) in wikiPagesByType" :key="type" class="space-y-4">
          <div class="flex items-center space-x-2">
            <component :is="getTypeIcon(type)" :class="['w-6 h-6', getTypeColor(type)]" />
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white capitalize">
              {{ type }}s
            </h2>
            <span class="text-sm text-gray-500 dark:text-gray-400">({{ pages.length }})</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <router-link
              v-for="page in pages"
              :key="page.id"
              :to="`/m/books/${bookId}/wiki/${page.id}`"
              class="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 p-4 block hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer"
            >
              <div class="flex items-start justify-between mb-2">
                <div class="flex items-center space-x-2">
                  <component :is="getTypeIcon(type)" :class="['w-5 h-5', getTypeColor(type)]" />
                  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {{ page.page_name }}
                  </h3>
                </div>
                <span
                  v-if="page.is_major"
                  class="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full dark:bg-green-900/40 dark:text-green-300"
                >
                  Major
                </span>
              </div>

              <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
                {{ page.summary || 'No summary available yet.' }}
              </p>

              <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span>{{ page.content_length ? `${page.content_length} chars` : 'No content' }}</span>
                <span>Updated {{ new Date(page.updated_at).toLocaleDateString() }}</span>
              </div>

              <div v-if="page.tags && page.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
                <span
                  v-for="tag in page.tags.slice(0, 3)"
                  :key="tag"
                  class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                >
                  {{ tag }}
                </span>
                <span v-if="page.tags.length > 3" class="text-xs text-gray-500">
                  +{{ page.tags.length - 3 }} more
                </span>
              </div>
            </router-link>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-16">
        <BookOpenIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No wiki pages yet</h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          Wiki pages will be automatically created when you generate chapter summaries with character mentions.
        </p>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          💡 Try generating a summary for a chapter to see the wiki in action!
        </div>
      </div>
    </div>
  </div>
</template>
