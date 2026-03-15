<script setup lang="ts">
import { toRefs, ref } from 'vue'
import draggable from 'vuedraggable'
import {
  PlusIcon,
  DocumentTextIcon,
  BookOpenIcon,
  PencilIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  TrashIcon
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
  },
  desktopImagesAvailable: {
    type: Boolean,
    default: false
  },
  coverImageSrc: {
    type: String as PropType<string | null>,
    default: null
  },
  coverLoading: {
    type: Boolean,
    default: false
  },
  coverError: {
    type: String as PropType<string | null>,
    default: null
  },
  selectBookCover: {
    type: Function as PropType<() => void>,
    required: true
  },
  deleteBookCover: {
    type: Function as PropType<() => void>,
    default: null
  },
  chapterThumbnails: {
    type: Object as PropType<Record<string, string>>,
    default: () => ({})
  },
  partThumbnails: {
    type: Object as PropType<Record<string, string>>,
    default: () => ({})
  }
})

const {
  book,
  chapterCount,
  totalWordCount,
  sidebarPartLists,
  sidebarUncategorized,
  expandedParts,
  wikiPagesByType,
  desktopImagesAvailable,
  coverImageSrc,
  coverLoading,
  coverError,
  chapterThumbnails,
  partThumbnails
} = toRefs(props)

const selectBookCover = props.selectBookCover
const deleteBookCover = props.deleteBookCover

// Lightbox state
const showLightbox = ref(false)

const openLightbox = () => {
  if (coverImageSrc.value) {
    showLightbox.value = true
  }
}

const closeLightbox = () => {
  showLightbox.value = false
}
</script>

<template>
  <div class="hidden lg:flex h-[calc(100vh-4rem-1px)]">
    <div class="flex flex-1 overflow-hidden">
      <div
        class="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto relative"
      >
        <div class="p-2 pt-4 pb-16">
          <div>
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

          <div class="my-2 flex items-center space-x-2">
            <button
              @click="createNewChapter"
              class="inline-flex items-center justify-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              + Add Chapter
            </button>
            <button
              @click="goToOrganizeChapters"
              class="inline-flex items-center justify-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Organize
            </button>
            <button
              @click="openSearchModal"
              class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <MagnifyingGlassIcon class="w-5 h-5" />
            </button>
          </div>

          <div
            v-if="desktopImagesAvailable"
            class="mb-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
          >
            <div class="flex gap-3">
              <div class="h-40 w-28 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                <img
                  v-if="coverImageSrc"
                  :src="coverImageSrc"
                  class="h-full w-full object-cover cursor-pointer transition-opacity hover:opacity-90"
                  alt="Book cover"
                  title="Click to view full size"
                  @click="openLightbox"
                />
                <div
                  v-else
                  class="flex h-full w-full items-center justify-center text-center text-xs text-gray-500 dark:text-gray-400"
                >
                  No cover yet
                </div>
              </div>
              <div class="flex flex-1 flex-col justify-between">
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  Desktop covers live in your local library.
                </p>
                <div class="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    class="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="coverLoading"
                    @click="selectBookCover"
                  >
                    <span
                      v-if="coverLoading"
                      class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                    ></span>
                    {{ coverImageSrc ? 'Replace' : 'Add cover' }}
                  </button>
                  <button
                    v-if="coverImageSrc && deleteBookCover"
                    type="button"
                    class="inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/20 disabled:cursor-not-allowed disabled:opacity-60"
                    :disabled="coverLoading"
                    @click="deleteBookCover"
                  >
                    <TrashIcon class="h-4 w-4" />
                  </button>
                  <p v-if="coverError" class="mt-2 text-xs text-red-600 dark:text-red-400">
                    {{ coverError }}
                  </p>
                </div>
              </div>
            </div>
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

            <div v-else-if="hasChapters" class="divide-y divide-gray-200 dark:divide-gray-800">
              <div v-for="part in chaptersByPart.parts" :key="part.id" class="overflow-hidden">
                <button
                  @click="togglePart(part.id)"
                  class="w-full text-left transition-colors focus:outline-none"
                >
                  <!-- Card with full-width image and overlaid metadata -->
                  <div class="relative overflow-hidden rounded-lg mx-2 my-2">
                    <!-- Cover image - full width -->
                    <div
                      v-if="partThumbnails[part.id]"
                      class="aspect-[16/9] w-full overflow-hidden bg-gray-100 dark:bg-gray-700"
                    >
                      <img
                        :src="partThumbnails[part.id]"
                        class="h-full w-full object-cover"
                        alt=""
                      />
                    </div>
                    <!-- Fallback when no image -->
                    <div
                      v-else
                      class="aspect-[16/9] w-full bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 dark:from-indigo-900/40 dark:via-purple-900/30 dark:to-pink-900/40 flex items-center justify-center"
                    >
                      <BookOpenIcon class="w-12 h-12 text-indigo-300 dark:text-indigo-600 opacity-60" />
                    </div>

                    <!-- Overlaid metadata with gradient background -->
                    <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-3 py-3 pt-8">
                      <div class="flex items-end justify-between">
                        <div>
                          <h4 class="font-medium text-white drop-shadow-md">{{ part.name }}</h4>
                          <p class="mt-0.5 text-xs text-gray-200">
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
                            ·
                            <router-link
                              :to="`/books/${bookId}/parts/${part.id}`"
                              class="text-blue-300 hover:text-blue-200 hover:underline"
                              @click.stop
                            >View</router-link>
                          </p>
                        </div>
                        <svg
                          :class="expandedParts.has(part.id) ? 'rotate-180' : ''"
                          class="h-5 w-5 text-white transition-transform flex-shrink-0"
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
                      </div>
                    </div>
                  </div>
                </button>

                <div
                  v-if="expandedParts.has(part.id)"
                  class="bg-white dark:bg-gray-800"
                >
                  <div class="pr-2 pt-3 pb-2 flex justify-end border-t border-gray-200 dark:border-gray-700">
                    <button
                      @click.prevent.stop="createNewChapterInPart(part.id)"
                      class="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
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
                        :thumbnail-src="chapterThumbnails[chapter.id]"
                      />
                    </template>
                  </draggable>
                </div>
              </div>

              <div
                v-if="sidebarUncategorized.length > 0"
                class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
              >
                <div class="px-2 py-3 bg-gray-50 dark:bg-gray-700">
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
                        :thumbnail-src="chapterThumbnails[chapter.id]"
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

  <!-- Cover image lightbox -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showLightbox && coverImageSrc"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        @click="closeLightbox"
      >
        <button
          class="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
          @click.stop="closeLightbox"
          title="Close"
        >
          <XMarkIcon class="h-6 w-6" />
        </button>
        <img
          :src="coverImageSrc"
          class="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          alt="Book cover"
          @click.stop
        />
      </div>
    </Transition>
  </Teleport>
</template>
