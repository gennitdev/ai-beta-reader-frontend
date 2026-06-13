<script setup lang="ts">
import { ref } from 'vue'
import type { Component } from 'vue'
import {
  BookOpenIcon,
  ChevronDownIcon,
  Cog6ToothIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PhotoIcon,
  TrashIcon,
  XMarkIcon
} from '@heroicons/vue/24/outline'
import type { Book, ImageAsset } from '@/lib/database'
import type { BookChapter, BookChaptersByPart, BookWikiPage } from '@/types/bookView'
import BookDesktopChapterSidebar from './BookDesktopChapterSidebar.vue'
import BookDesktopImagesSidebar from './BookDesktopImagesSidebar.vue'
import BookDesktopWikiSidebar from './BookDesktopWikiSidebar.vue'

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
  desktopImagesAvailable: boolean
  coverImageSrc?: string | null
  coverLoading: boolean
  coverError?: string | null
  selectBookCover: () => void
  deleteBookCover?: (() => void) | null
  chapterThumbnails: Record<string, string>
  partThumbnails: Record<string, string>
  bookImages: ImageAsset[]
  bookImageSources: Record<string, string>
  loadingImages: boolean
  selectedImageId?: string | null
}>()

const showSectionDropdown = ref(false)
const showLightbox = ref(false)

const sectionOptions = [
  { id: 'chapters', label: 'Chapters', icon: DocumentTextIcon, route: (bookId: string) => `/books/${bookId}` },
  { id: 'wiki', label: 'Wiki Pages', icon: BookOpenIcon, route: (bookId: string) => `/books/${bookId}?tab=wiki` },
  { id: 'images', label: 'Images', icon: PhotoIcon, route: (bookId: string) => `/books/${bookId}?tab=images` }
]

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
    class="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto relative"
  >
    <div class="p-2 pt-2 pb-16">
      <div class="relative overflow-hidden rounded-lg mb-3">
        <div
          v-if="coverImageSrc"
          class="w-full overflow-hidden bg-gray-100 dark:bg-gray-700 cursor-pointer"
          @click="openLightbox"
        >
          <img
            :src="coverImageSrc"
            class="w-full transition-opacity hover:opacity-90"
            alt="Book cover"
            title="Click to view full size"
          />
        </div>
        <div
          v-else
          class="aspect-[16/9] w-full bg-gradient-to-br from-blue-100 via-indigo-50 to-purple-100 dark:from-blue-900/40 dark:via-indigo-900/30 dark:to-purple-900/40 flex items-center justify-center"
        >
          <BookOpenIcon class="w-16 h-16 text-blue-300 dark:text-blue-600 opacity-60" />
        </div>

        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-3 py-3 pt-10">
          <div v-if="isEditingBookTitle" class="flex flex-col space-y-2">
            <input
              :value="editingBookTitle"
              @input="updateEditingBookTitle(($event.target as HTMLInputElement).value)"
              @keyup.enter="saveBookTitle"
              @keyup.esc="cancelEditingBookTitle"
              type="text"
              class="text-lg font-bold bg-white/90 dark:bg-gray-700/90 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Book title"
              autofocus
              @click.stop
            />
            <div class="flex space-x-2">
              <button
                @click.stop="saveBookTitle"
                class="flex-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
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

          <div v-else class="flex items-end justify-between">
            <div class="flex-1 min-w-0">
              <h1 class="text-lg font-bold text-white drop-shadow-md truncate">
                {{ book?.title }}
              </h1>
              <p class="mt-0.5 text-xs text-gray-200">
                {{ chapterCount }} chapter{{ chapterCount !== 1 ? 's' : '' }} · {{ formatWordCount(totalWordCount) }} words
              </p>
            </div>
            <button
              @click.stop="startEditingBookTitle"
              class="p-1 text-white/70 hover:text-white flex-shrink-0 ml-2"
              title="Rename book"
            >
              <PencilIcon class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div class="mb-3 flex items-center space-x-2">
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
        class="mb-3 flex items-center gap-2"
      >
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
          {{ coverImageSrc ? 'Replace cover' : 'Add cover' }}
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
            <component :is="currentSectionIcon()" class="w-4 h-4 mr-2 text-blue-600 dark:text-blue-400" />
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
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
              ]"
            >
              <component :is="option.icon" class="w-4 h-4 mr-2" />
              {{ option.label }}
            </router-link>
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
        :wiki-pages-by-type="wikiPagesByType"
        :get-type-icon="getTypeIcon"
        :get-type-color="getTypeColor"
        :active-wiki-page-id="activeWikiPageId"
        :toggle-wiki-page-pinned="toggleWikiPagePinned"
        :open-create-wiki-modal="openCreateWikiModal"
      />

      <BookDesktopImagesSidebar
        v-else-if="currentTab === 'images'"
        :book-id="bookId"
        :desktop-images-available="desktopImagesAvailable"
        :book-images="bookImages"
        :book-image-sources="bookImageSources"
        :loading-images="loadingImages"
        :selected-image-id="selectedImageId"
      />

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
