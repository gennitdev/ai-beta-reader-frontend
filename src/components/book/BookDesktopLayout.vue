<script setup lang="ts">
import { toRefs } from 'vue'
import draggable from 'vuedraggable'
import {
  PlusIcon,
  DocumentTextIcon,
  BookOpenIcon,
  PencilIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon
} from '@heroicons/vue/24/outline'
import type { PropType } from 'vue'
import type { Book } from '@/lib/database'
import type { BookChapter, BookChaptersByPart, BookWikiPage } from '@/types/bookView'
import BookDesktopChapterListItem from './BookDesktopChapterListItem.vue'

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
  chapterCount: {
    type: Number,
    default: 0
  },
  totalWordCount: {
    type: Number,
    default: 0
  },
  currentTab: {
    type: String as PropType<'chapters' | 'wiki'>,
    default: 'chapters'
  },
  hasChapters: {
    type: Boolean,
    default: false
  },
  loadingChapters: {
    type: Boolean,
    default: false
  },
  chaptersByPart: {
    type: Object as PropType<BookChaptersByPart>,
    required: true
  },
  sidebarPartLists: {
    type: Object as PropType<Record<string, BookChapter[]>>,
    required: true
  },
  sidebarUncategorized: {
    type: Array as PropType<BookChapter[]>,
    required: true
  },
  expandedParts: {
    type: Object as PropType<Set<string>>,
    required: true
  },
  shouldExpandPart: {
    type: Function as PropType<(partId: string) => boolean>,
    required: true
  },
  togglePart: {
    type: Function as PropType<(partId: string) => void>,
    required: true
  },
  createNewChapter: {
    type: Function as PropType<() => void>,
    required: true
  },
  createNewChapterInPart: {
    type: Function as PropType<(partId: string) => void>,
    required: true
  },
  goToOrganizeChapters: {
    type: Function as PropType<() => void>,
    required: true
  },
  openSearchModal: {
    type: Function as PropType<() => void>,
    required: true
  },
  onSidebarDragStart: {
    type: Function as PropType<() => void>,
    required: true
  },
  onSidebarDragEnd: {
    type: Function as PropType<() => void | Promise<void>>,
    required: true
  },
  editChapter: {
    type: Function as PropType<(chapterId: string) => void>,
    required: true
  },
  formatWordCount: {
    type: Function as PropType<(count: number) => string>,
    required: true
  },
  wordCountForChapters: {
    type: Function as PropType<(chapters: BookChapter[]) => number>,
    required: true
  },
  loadingWiki: {
    type: Boolean,
    default: false
  },
  hasWikiPages: {
    type: Boolean,
    default: false
  },
  wikiPagesByType: {
    type: Object as PropType<Record<string, BookWikiPage[]>>,
    default: () => ({})
  },
  getTypeIcon: {
    type: Function as PropType<(type: string) => any>,
    required: true
  },
  getTypeColor: {
    type: Function as PropType<(type: string) => string>,
    required: true
  },
  activeChapterId: {
    type: String,
    default: undefined
  },
  activeWikiPageId: {
    type: String,
    default: undefined
  },
  isOnBookOnly: {
    type: Boolean,
    default: false
  },
  routerViewKey: {
    type: Number,
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
  }
})

const {
  book,
  chapterCount,
  totalWordCount,
  sidebarPartLists,
  sidebarUncategorized,
  expandedParts,
  wikiPagesByType
} = toRefs(props)
</script>

<template>
  <div class="hidden lg:flex h-[calc(100vh-4rem-1px)]">
    <div class="flex flex-1 overflow-hidden">
      <div
        class="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto relative"
      >
        <div class="p-4 pb-16">
          <div class="mb-6">
            <div v-if="isEditingBookTitle" class="flex flex-col space-y-2">
              <input
                :value="editingBookTitle"
                @input="updateEditingBookTitle(($event.target as HTMLInputElement).value)"
                @keyup.enter="saveBookTitle"
                @keyup.esc="cancelEditingBookTitle"
                type="text"
                class="text-xl font-bold bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Book title"
                autofocus
              />
              <div class="flex space-x-2">
                <button
                  @click="saveBookTitle"
                  class="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
                <button
                  @click="cancelEditingBookTitle"
                  class="flex-1 px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>

            <div v-else class="flex items-center space-x-2">
              <h1 class="text-xl font-bold text-gray-900 dark:text-white flex-1">
                {{ book?.title }}
              </h1>
              <button
                @click="startEditingBookTitle"
                class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                title="Rename book"
              >
                <PencilIcon class="w-5 h-5" />
              </button>
            </div>

            <p class="text-gray-600 dark:text-gray-400 mt-1">
              {{ chapterCount }} chapters · {{ formatWordCount(totalWordCount) }} words total
            </p>
          </div>

          <div class="space-y-3 mb-6 flex space-x-2">
            <button
              @click="createNewChapter"
              class="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusIcon class="w-5 h-5" />
            </button>
            <button
              @click="goToOrganizeChapters"
              class="inline-flex items-center justify-center px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <Cog6ToothIcon class="w-5 h-5" />
            </button>
            <button
              @click="openSearchModal"
              class="inline-flex items-center justify-center px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <MagnifyingGlassIcon class="w-5 h-5" />
            </button>
          </div>

          <div class="flex space-x-1 rounded-xl bg-blue-900/20 p-1 mb-2">
            <router-link
              :to="`/books/${bookId}`"
              :class="[
                'px-4 py-2 text-sm font-medium leading-5 text-blue-700 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 flex items-center rounded-lg transition-colors',
                currentTab === 'chapters'
                  ? 'bg-white text-blue-700 shadow'
                  : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
              ]"
            >
              <DocumentTextIcon class="w-4 h-4 inline mr-2" />
              Chapters
            </router-link>
            <router-link
              :to="`/books/${bookId}?tab=wiki`"
              :class="[
                'px-4 py-2 text-sm font-medium leading-5 text-blue-400 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 flex items-center rounded-lg transition-colors',
                currentTab === 'wiki'
                  ? 'bg-white text-blue-700 shadow'
                  : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
              ]"
            >
              <BookOpenIcon class="w-4 h-4 inline mr-2" />
              Characters
            </router-link>
          </div>

          <div v-if="currentTab === 'chapters'">
            <div v-if="loadingChapters" class="flex justify-center items-center h-32">
              <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>

            <div v-else-if="hasChapters" class="space-y-3">
              <div
                v-for="part in chaptersByPart.parts"
                :key="part.id"
                class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                <button
                  @click="togglePart(part.id)"
                  class="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-between text-left transition-colors"
                >
                  <div>
                    <h4 class="font-medium text-gray-900 dark:text-white">{{ part.name }}</h4>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {{ (sidebarPartLists[part.id]?.length || 0) }} chapter{{
                        (sidebarPartLists[part.id]?.length || 0) !== 1 ? 's' : ''
                      }}
                      ·
                      {{
                        formatWordCount(
                          wordCountForChapters(sidebarPartLists[part.id] || [])
                        )
                      }}
                      words
                    </p>
                  </div>
                  <svg
                    :class="
                      expandedParts.has(part.id) || shouldExpandPart(part.id) ? 'rotate-180' : ''
                    "
                    class="w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 9l-7 7-7-7"
                    ></path>
                  </svg>
                </button>

                <div
                  v-if="expandedParts.has(part.id) || shouldExpandPart(part.id)"
                  class="bg-white dark:bg-gray-800"
                >
                  <div class="px-4 pt-3 pb-2 flex justify-end border-t border-gray-200 dark:border-gray-700">
                    <button
                      @click.prevent.stop="createNewChapterInPart(part.id)"
                      class="inline-flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      <PlusIcon class="w-4 h-4 mr-1" />
                      Add Chapter in Part
                    </button>
                  </div>
                  <draggable
                    :list="sidebarPartLists[part.id]"
                    item-key="id"
                    group="sidebar-chapters"
                    class="space-y-1"
                    @start="onSidebarDragStart"
                    @end="onSidebarDragEnd"
                    :disabled="false"
                    ghost-class="opacity-50"
                    drag-class="rotate-1"
                    handle=".drag-handle"
                  >
                    <template #item="{ element: chapter }">
                      <BookDesktopChapterListItem
                        :book-id="bookId"
                        :chapter="chapter"
                        :active-chapter-id="activeChapterId"
                        :edit-chapter="editChapter"
                      />
                    </template>
                  </draggable>
                </div>
              </div>

              <div
                v-if="sidebarUncategorized.length > 0"
                class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                <div class="px-4 py-3 bg-gray-50 dark:bg-gray-700">
                  <h4 class="font-medium text-gray-900 dark:text-white">Uncategorized</h4>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {{ sidebarUncategorized.length }} chapter{{
                      sidebarUncategorized.length !== 1 ? 's' : ''
                    }}
                    · {{ formatWordCount(wordCountForChapters(sidebarUncategorized)) }} words
                  </p>
                </div>
                <div class="bg-white dark:bg-gray-800">
                  <draggable
                    :list="sidebarUncategorized"
                    item-key="id"
                    group="sidebar-chapters"
                    class="space-y-1"
                    @start="onSidebarDragStart"
                    @end="onSidebarDragEnd"
                    :disabled="false"
                    ghost-class="opacity-50"
                    drag-class="rotate-1"
                    handle=".drag-handle"
                  >
                    <template #item="{ element: chapter }">
                      <BookDesktopChapterListItem
                        :book-id="bookId"
                        :chapter="chapter"
                        :active-chapter-id="activeChapterId"
                        :edit-chapter="editChapter"
                      />
                    </template>
                  </draggable>
                </div>
              </div>
            </div>

            <div v-else class="text-center py-8">
              <DocumentTextIcon class="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-2">
                No chapters yet
              </h3>
              <p class="text-xs text-gray-600 dark:text-gray-400 mb-4">
                Add your first chapter to get started.
              </p>
            </div>
          </div>

          <div v-else-if="currentTab === 'wiki'">
            <div v-if="loadingWiki" class="flex justify-center items-center h-32">
              <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>

            <div v-else-if="hasWikiPages" class="space-y-4">
              <div v-for="(pages, type) in wikiPagesByType" :key="type" class="space-y-2">
                <div class="flex items-center space-x-2">
                  <component :is="getTypeIcon(type)" :class="['w-4 h-4', getTypeColor(type)]" />
                  <h3 class="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                    {{ type }}s
                  </h3>
                  <span class="text-xs text-gray-500 dark:text-gray-400">({{ pages.length }})</span>
                </div>

                <div class="space-y-1">
                  <router-link
                    v-for="page in pages"
                    :key="page.id"
                    :to="`/books/${bookId}/wiki/${page.id}`"
                    class="block p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    :class="
                      activeWikiPageId === page.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600'
                        : ''
                    "
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center space-x-2 min-w-0">
                        <h4 class="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {{ page.page_name }}
                        </h4>
                        <span
                          v-if="page.is_major"
                          class="px-1 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded"
                        >
                          Major
                        </span>
                      </div>
                    </div>
                    <p
                      v-if="page.summary"
                      class="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2"
                    >
                      {{
                        page.summary.length > 60
                          ? page.summary.substring(0, 60) + '...'
                          : page.summary
                      }}
                    </p>
                  </router-link>
                </div>
              </div>
            </div>

            <div v-else class="text-center py-8">
              <BookOpenIcon class="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-2">
                No wiki pages yet
              </h3>
              <p class="text-xs text-gray-600 dark:text-gray-400">
                Generate chapter summaries to create wiki pages.
              </p>
            </div>
          </div>

          <div class="fixed bottom-4 left-4 z-10">
            <router-link
              to="/settings"
              class="inline-flex items-center px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 shadow-sm border border-gray-200 dark:border-gray-700"
              title="User Settings"
            >
              <Cog6ToothIcon class="w-5 h-5 mr-2" />
              Settings
            </router-link>
          </div>
        </div>
      </div>

      <div class="flex-1 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
        <div v-if="isOnBookOnly" class="flex items-center justify-center h-full">
          <div class="text-center">
            <DocumentTextIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 class="text-xl font-medium text-gray-900 dark:text-white mb-2">
              Please select a chapter
            </h3>
            <p class="text-gray-600 dark:text-gray-400 max-w-md">
              Choose a chapter from the sidebar to view and edit its content, or create a new
              chapter to get started.
            </p>
          </div>
        </div>
        <router-view v-else :key="routerViewKey" />
      </div>
    </div>
  </div>
</template>
