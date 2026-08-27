<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Component } from 'vue'
import {
  BookOpenIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PhotoIcon,
  TrashIcon,
  XMarkIcon
} from '@heroicons/vue/24/outline'
import type { Book } from '@/lib/database'
import type { BookChapter, BookChaptersByPart, BookWikiPage } from '@/types/bookView'
import BookDesktopChapterSidebar from './BookDesktopChapterSidebar.vue'
import BookDesktopWikiSidebar from './BookDesktopWikiSidebar.vue'
import { useLibraryContext } from '@/composables/useLibraryContext'
import ExampleDisabledControl from '@/components/ExampleDisabledControl.vue'

const props = defineProps<{
  book: Book | null
  bookId: string
  isEditingBookTitle: boolean
  editingBookTitle: string
  chapterCount: number
  totalWordCount: number
  currentTab: 'chapters' | 'wiki' | 'images'
  hasChapters: boolean
  loadingChapters: boolean
  chaptersByPart: BookChaptersByPart
  sidebarPartLists: Record<string, BookChapter[]>
  sidebarUncategorized: BookChapter[]
  expandedParts: Set<string>
  togglePart: (partId: string) => void
  expandPart: (partId: string) => void
  createNewChapter: () => void
  createNewChapterInPart: (partId: string) => void
  goToOrganizeChapters: () => void
  openSearchModal: () => void
  onSidebarDragStart: () => void
  onSidebarDragEnd: () => void | Promise<void>
  editChapter: (chapterId: string) => void
  insertChapter: (chapter: BookChapter, placement: 'before' | 'after') => void
  formatWordCount: (count: number) => string
  wordCountForChapters: (chapters: BookChapter[]) => number
  loadingWiki: boolean
  hasWikiPages: boolean
  wikiPagesByType: Record<string, BookWikiPage[]>
  wikiPageThumbnails?: Record<string, string>
  getTypeIcon: (type: string) => Component
  getTypeColor: (type: string) => string
  activeChapterId?: string
  activeWikiPageId?: string
  toggleWikiPagePinned: (page: BookWikiPage) => void | Promise<void>
  openCreateWikiModal?: () => void
  startEditingBookTitle: () => void
  saveBookTitle: () => void
  cancelEditingBookTitle: () => void
  updateEditingBookTitle: (value: string) => void
  canSelectImages: boolean
  coverImageSrc?: string | null
  coverLoading: boolean
  coverError?: string | null
  selectBookCover: () => void
  deleteBookCover?: (() => void) | null
  chapterThumbnails: Record<string, string>
  partThumbnails: Record<string, string>
}>()
const { booksPath, readOnly, readOnlyReason } = useLibraryContext()

const showSectionDropdown = ref(false)
const showLightbox = ref(false)

const sectionOptions = [
  { id: 'chapters', label: 'Chapters', icon: DocumentTextIcon, route: (bookId: string) => `${booksPath}/${bookId}` },
  { id: 'wiki', label: 'Wiki Pages', icon: BookOpenIcon, route: (bookId: string) => `${booksPath}/${bookId}?tab=wiki` },
  { id: 'images', label: 'Images', icon: PhotoIcon, route: (bookId: string) => `${booksPath}/${bookId}?tab=images` }
]

// Secondary filter shown when the Wiki Pages section is active
type WikiTypeFilter = 'all' | 'character' | 'location' | 'concept' | 'other'
const showWikiTypeDropdown = ref(false)
const wikiTypeFilter = ref<WikiTypeFilter>('all')

const wikiTypeOptions: { id: WikiTypeFilter; label: string }[] = [
  { id: 'all', label: 'All Types' },
  { id: 'character', label: 'Characters' },
  { id: 'location', label: 'Locations' },
  { id: 'concept', label: 'Concepts' },
  { id: 'other', label: 'Other' }
]

const wikiTypeIcon = (id: WikiTypeFilter): Component =>
  id === 'all' ? BookOpenIcon : props.getTypeIcon(id)

const currentWikiTypeOption = () =>
  wikiTypeOptions.find((option) => option.id === wikiTypeFilter.value) || wikiTypeOptions[0]

const closeWikiTypeDropdown = () => {
  showWikiTypeDropdown.value = false
}

const selectWikiType = (id: WikiTypeFilter) => {
  wikiTypeFilter.value = id
  closeWikiTypeDropdown()
}

const filteredWikiPagesByType = computed<Record<string, BookWikiPage[]>>(() => {
  if (wikiTypeFilter.value === 'all') {
    return props.wikiPagesByType
  }
  const key = wikiTypeFilter.value
  const pages = props.wikiPagesByType[key]
  return pages && pages.length ? { [key]: pages } : {}
})

const currentSectionLabel = () => {
  const section = sectionOptions.find((option) => option.id === props.currentTab)
  return section?.label || 'Chapters'
}

const currentSectionIcon = () => {
  const section = sectionOptions.find((option) => option.id === props.currentTab)
  return section?.icon || DocumentTextIcon
}

const closeSectionDropdown = () => {
  showSectionDropdown.value = false
}

const openLightbox = () => {
  if (props.coverImageSrc) {
    showLightbox.value = true
  }
}

const closeLightbox = () => {
  showLightbox.value = false
}
</script>

<template>
  <div
    class="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-navy-800 overflow-y-auto relative"
  >
    <div class="p-2 pt-2">
      <div class="mb-4">
        <div
          v-if="coverImageSrc"
          class="mx-auto flex w-fit max-w-full cursor-pointer overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700"
          @click="openLightbox"
        >
          <img
            :src="coverImageSrc"
            class="max-h-56 h-auto w-auto max-w-full object-contain transition-opacity hover:opacity-90"
            alt="Book cover"
            title="Click to view full size"
          />
        </div>
        <div
          v-else
          class="mx-auto flex h-28 w-full max-w-48 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-gold-100 via-indigo-50 to-purple-100 dark:from-gold-900/40 dark:via-indigo-900/30 dark:to-purple-900/40"
        >
          <BookOpenIcon class="h-12 w-12 text-gold-300 opacity-60 dark:text-gold-600" />
        </div>

        <div class="mt-3 px-1">
          <div v-if="isEditingBookTitle" class="flex flex-col space-y-2">
            <input
              :value="editingBookTitle"
              @input="updateEditingBookTitle(($event.target as HTMLInputElement).value)"
              @keyup.enter="saveBookTitle"
              @keyup.esc="cancelEditingBookTitle"
              type="text"
              class="rounded border border-gray-300 bg-white px-2 py-1 text-lg font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-gold-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              placeholder="Book title"
              autofocus
              @click.stop
            />
            <div class="flex space-x-2">
              <button
                @click.stop="saveBookTitle"
                class="flex-1 px-3 py-1.5 bg-gold-600 text-white text-sm rounded hover:bg-gold-700 transition-colors"
              >
                Save
              </button>
              <button
                @click.stop="cancelEditingBookTitle"
                class="flex-1 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>

          <div v-else class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <h1 class="truncate text-lg font-bold text-gray-900 dark:text-white">
                {{ book?.title }}
              </h1>
              <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {{ chapterCount }} chapter{{ chapterCount !== 1 ? 's' : '' }} · {{ formatWordCount(totalWordCount) }} words
              </p>
            </div>
            <ExampleDisabledControl :active="readOnly" :explanation="readOnlyReason">
            <button
              :disabled="readOnly"
              @click.stop="startEditingBookTitle"
              class="ml-2 flex-shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              title="Rename book"
            >
              <PencilIcon class="w-4 h-4" />
            </button>
            </ExampleDisabledControl>
          </div>
        </div>
      </div>

      <div class="mb-3 flex items-center space-x-2">
        <ExampleDisabledControl :active="readOnly" :explanation="readOnlyReason">
        <button
          :disabled="readOnly"
          @click="createNewChapter"
          class="inline-flex items-center justify-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          + Add Chapter
        </button>
        </ExampleDisabledControl>
        <ExampleDisabledControl :active="readOnly" :explanation="readOnlyReason">
        <button
          :disabled="readOnly"
          @click="goToOrganizeChapters"
          class="inline-flex items-center justify-center rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          Organize
        </button>
        </ExampleDisabledControl>
        <ExampleDisabledControl :active="readOnly" :explanation="readOnlyReason">
        <button
          :disabled="readOnly"
          @click="openSearchModal"
          class="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          <MagnifyingGlassIcon class="w-5 h-5" />
        </button>
        </ExampleDisabledControl>
      </div>

      <div
        v-if="canSelectImages"
        class="mb-3 flex items-center gap-2"
      >
        <button
          type="button"
          class="inline-flex items-center rounded-md bg-gold-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="coverLoading || readOnly"
          @click="selectBookCover"
        >
          <span
            v-if="coverLoading"
            class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
          ></span>
          {{ coverImageSrc ? 'Replace cover' : 'Add cover' }}
        </button>
        <button
          v-if="coverImageSrc && deleteBookCover"
          type="button"
          class="inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-700 dark:bg-navy-800 dark:text-red-400 dark:hover:bg-red-900/20 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="coverLoading || readOnly"
          @click="deleteBookCover"
        >
          <TrashIcon class="h-4 w-4" />
        </button>
        <p v-if="coverError" class="text-xs text-red-600 dark:text-red-400">
          {{ coverError }}
        </p>
      </div>

      <div class="relative mb-2">
        <button
          @click="showSectionDropdown = !showSectionDropdown"
          class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium bg-white dark:bg-gray-700 rounded-lg shadow border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
        >
          <span class="flex items-center">
            <component :is="currentSectionIcon()" class="w-4 h-4 mr-2 text-gold-600 dark:text-gold-400" />
            <span class="text-gray-900 dark:text-white">{{ currentSectionLabel() }}</span>
          </span>
          <ChevronDownIcon
            :class="['w-4 h-4 text-gray-500 transition-transform', showSectionDropdown ? 'rotate-180' : '']"
          />
        </button>

        <div
          v-if="showSectionDropdown"
          class="fixed inset-0 z-0"
          @click="closeSectionDropdown"
        ></div>

        <Transition
          enter-active-class="transition ease-out duration-100"
          enter-from-class="transform opacity-0 scale-95"
          enter-to-class="transform opacity-100 scale-100"
          leave-active-class="transition ease-in duration-75"
          leave-from-class="transform opacity-100 scale-100"
          leave-to-class="transform opacity-0 scale-95"
        >
          <div
            v-if="showSectionDropdown"
            class="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 py-1"
          >
            <router-link
              v-for="option in sectionOptions"
              :key="option.id"
              :to="option.route(bookId)"
              @click="closeSectionDropdown"
              :class="[
                'flex items-center px-3 py-2 text-sm transition-colors',
                currentTab === option.id
                  ? 'bg-gold-50 dark:bg-gold-900/30 text-gold-700 dark:text-gold-300'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
              ]"
            >
              <component :is="option.icon" class="w-4 h-4 mr-2" />
              {{ option.label }}
            </router-link>
          </div>
        </Transition>
      </div>

      <div v-if="currentTab === 'wiki'" class="relative mb-2">
        <button
          @click="showWikiTypeDropdown = !showWikiTypeDropdown"
          class="w-full flex items-center justify-between px-3 py-2 text-sm font-medium bg-gray-50 dark:bg-gray-700/60 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
        >
          <span class="flex items-center">
            <component
              :is="wikiTypeIcon(wikiTypeFilter)"
              :class="['w-4 h-4 mr-2', wikiTypeFilter === 'all' ? 'text-gold-600 dark:text-gold-400' : getTypeColor(wikiTypeFilter)]"
            />
            <span class="text-gray-900 dark:text-white">{{ currentWikiTypeOption().label }}</span>
          </span>
          <ChevronDownIcon
            :class="['w-4 h-4 text-gray-500 transition-transform', showWikiTypeDropdown ? 'rotate-180' : '']"
          />
        </button>

        <div
          v-if="showWikiTypeDropdown"
          class="fixed inset-0 z-0"
          @click="closeWikiTypeDropdown"
        ></div>

        <Transition
          enter-active-class="transition ease-out duration-100"
          enter-from-class="transform opacity-0 scale-95"
          enter-to-class="transform opacity-100 scale-100"
          leave-active-class="transition ease-in duration-75"
          leave-from-class="transform opacity-100 scale-100"
          leave-to-class="transform opacity-0 scale-95"
        >
          <div
            v-if="showWikiTypeDropdown"
            class="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 py-1"
          >
            <button
              v-for="option in wikiTypeOptions"
              :key="option.id"
              type="button"
              @click="selectWikiType(option.id)"
              :class="[
                'flex w-full items-center px-3 py-2 text-sm transition-colors',
                wikiTypeFilter === option.id
                  ? 'bg-gold-50 dark:bg-gold-900/30 text-gold-700 dark:text-gold-300'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
              ]"
            >
              <component
                :is="wikiTypeIcon(option.id)"
                :class="['w-4 h-4 mr-2', option.id === 'all' ? '' : getTypeColor(option.id)]"
              />
              {{ option.label }}
            </button>
          </div>
        </Transition>
      </div>

      <BookDesktopChapterSidebar
        v-if="currentTab === 'chapters'"
        :book-id="bookId"
        :has-chapters="hasChapters"
        :loading-chapters="loadingChapters"
        :chapters-by-part="chaptersByPart"
        :sidebar-part-lists="sidebarPartLists"
        :sidebar-uncategorized="sidebarUncategorized"
        :expanded-parts="expandedParts"
        :toggle-part="togglePart"
        :expand-part="expandPart"
        :create-new-chapter-in-part="createNewChapterInPart"
        :on-sidebar-drag-start="onSidebarDragStart"
        :on-sidebar-drag-end="onSidebarDragEnd"
        :edit-chapter="editChapter"
        :insert-chapter="insertChapter"
        :format-word-count="formatWordCount"
        :word-count-for-chapters="wordCountForChapters"
        :active-chapter-id="activeChapterId"
        :chapter-thumbnails="chapterThumbnails"
        :part-thumbnails="partThumbnails"
      />

      <BookDesktopWikiSidebar
        v-else-if="currentTab === 'wiki'"
        :book-id="bookId"
        :loading-wiki="loadingWiki"
        :has-wiki-pages="hasWikiPages"
        :wiki-pages-by-type="filteredWikiPagesByType"
        :wiki-page-thumbnails="wikiPageThumbnails"
        :get-type-icon="getTypeIcon"
        :get-type-color="getTypeColor"
        :active-wiki-page-id="activeWikiPageId"
        :toggle-wiki-page-pinned="toggleWikiPagePinned"
        :open-create-wiki-modal="openCreateWikiModal"
        :filter-active="wikiTypeFilter !== 'all'"
        :filter-label="wikiTypeFilter"
      />

    </div>
  </div>

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
