<script setup lang="ts">
import { computed, ref, toRefs, watch } from 'vue'
import type { Component } from 'vue'
import { DocumentTextIcon, BookOpenIcon, PhotoIcon, PlusIcon, Cog6ToothIcon, PencilIcon, XMarkIcon, TrashIcon, BookmarkIcon, ArrowLeftIcon, ChevronDownIcon } from '@heroicons/vue/24/outline'
import type { Book, ImageAsset, ImageWikiTag } from '@/lib/database'
import type { BookChapter, BookChaptersByPart, BookWikiPage } from '@/types/bookView'
import type { PropType } from 'vue'
import BookMobileChapterCard from './BookMobileChapterCard.vue'
import IllustrationDetail from '@/components/images/IllustrationDetail.vue'

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
    type: String as PropType<'chapters' | 'wiki' | 'images'>,
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
  wikiPageThumbnails: {
    type: Object as PropType<Record<string, string>>,
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
    type: Function as PropType<(type: string) => Component>,
    required: true
  },
  getTypeColor: {
    type: Function as PropType<(type: string) => string>,
    required: true
  },
  toggleWikiPagePinned: {
    type: Function as PropType<(page: BookWikiPage) => void | Promise<void>>,
    required: true
  },
  openCreateWikiModal: {
    type: Function as PropType<() => void>,
    default: () => {}
  },
  canSelectImages: {
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
  },
  bookImages: {
    type: Array as PropType<ImageAsset[]>,
    default: () => []
  },
  bookImageSources: {
    type: Object as PropType<Record<string, string>>,
    default: () => ({})
  },
  loadingImages: {
    type: Boolean,
    default: false
  },
  selectedImageId: {
    type: String as PropType<string | null>,
    default: null
  },
  selectedImageSrc: {
    type: String as PropType<string | null>,
    default: null
  },
  selectedImage: {
    type: Object as PropType<ImageAsset | null>,
    default: null
  },
  selectedImageTags: {
    type: Array as PropType<ImageWikiTag[]>,
    default: () => []
  },
  wikiPages: {
    type: Array as PropType<BookWikiPage[]>,
    default: () => []
  },
  savingSelectedImageNotes: {
    type: Boolean,
    default: false
  },
  savingSelectedImageTags: {
    type: Boolean,
    default: false
  },
  saveSelectedImageNotes: {
    type: Function as PropType<(notes: string) => void | Promise<void>>,
    default: undefined
  },
  saveSelectedImageTags: {
    type: Function as PropType<(wikiPageIds: string[]) => void | Promise<void>>,
    default: undefined
  },
  downloadSelectedImage: {
    type: Function as PropType<(imageId: string) => void>,
    default: undefined
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
  wikiPagesByType,
  canSelectImages,
  coverImageSrc,
  coverLoading,
  coverError,
  chapterThumbnails,
  partThumbnails,
  bookImages,
  bookImageSources,
  loadingImages,
  selectedImageId,
  selectedImageSrc,
  selectedImage,
  selectedImageTags,
  wikiPages,
  savingSelectedImageNotes,
  savingSelectedImageTags
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

// Wiki type filter (mirrors the desktop sidebar's secondary select)
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

const selectWikiType = (id: WikiTypeFilter) => {
  wikiTypeFilter.value = id
  showWikiTypeDropdown.value = false
}

const hasAnyWikiPages = computed(() =>
  Object.values(wikiPagesByType.value).some((pages) => pages.length > 0)
)

const filteredWikiPagesByType = computed<Record<string, BookWikiPage[]>>(() => {
  if (wikiTypeFilter.value === 'all') {
    return wikiPagesByType.value
  }
  const key = wikiTypeFilter.value
  const pages = wikiPagesByType.value[key]
  return pages && pages.length ? { [key]: pages } : {}
})

const hasFilteredWikiPages = computed(() =>
  Object.values(filteredWikiPagesByType.value).some((pages) => pages.length > 0)
)

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
              class="text-3xl font-bold bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gold-500"
              placeholder="Book title"
              autofocus
            />
            <button @click="saveBookTitle" class="px-3 py-2 bg-gold-600 text-white rounded hover:bg-gold-700 transition-colors">
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
          <button @click="createNewChapter" class="inline-flex items-center px-4 py-2 bg-gold-600 text-white rounded-lg hover:bg-gold-700 transition-colors">
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

    <div
      v-if="canSelectImages || coverImageSrc"
      class="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-navy-900"
    >
      <div class="flex gap-4">
        <div class="h-48 w-32 overflow-hidden rounded-lg bg-gray-100 dark:bg-navy-800">
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
            No cover selected
          </div>
        </div>
        <div class="flex flex-1 flex-col justify-between">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ canSelectImages ? 'Covers are stored locally on this device.' : 'Restored cover image.' }}
          </p>
          <div v-if="canSelectImages" class="mt-2 flex items-center gap-2">
            <button
              type="button"
              class="inline-flex items-center rounded-md bg-gold-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-60"
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
              class="inline-flex items-center rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-700 dark:bg-navy-800 dark:text-red-400 dark:hover:bg-red-900/20 disabled:cursor-not-allowed disabled:opacity-60"
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

    <div class="flex space-x-1 rounded-xl bg-gold-900/20 p-1 mb-6">
      <router-link
        :to="`/books/${bookId}`"
        :class="[
          'w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-gold-700 ring-white/60 ring-offset-2 ring-offset-gold-400 focus:outline-none focus:ring-2 flex items-center justify-center',
          currentTab === 'chapters'
            ? 'bg-white text-gold-700 shadow'
            : 'text-gold-100 hover:bg-white/[0.12] hover:text-white'
        ]"
      >
        <DocumentTextIcon class="w-5 h-5 inline mr-2" />
        Chapters
      </router-link>
      <router-link
        :to="`/books/${bookId}?tab=wiki`"
        :class="[
          'w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-gold-400 ring-white/60 ring-offset-2 ring-offset-gold-400 focus:outline-none focus:ring-2 flex items-center justify-center',
          currentTab === 'wiki'
            ? 'bg-white text-gold-700 shadow'
            : 'text-gold-100 hover:bg-white/[0.12] hover:text-white'
        ]"
      >
        <BookOpenIcon class="w-5 h-5 inline mr-2" />
        Wiki
      </router-link>
      <router-link
        :to="`/books/${bookId}?tab=images`"
        :class="[
          'w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-gold-400 ring-white/60 ring-offset-2 ring-offset-gold-400 focus:outline-none focus:ring-2 flex items-center justify-center',
          currentTab === 'images'
            ? 'bg-white text-gold-700 shadow'
            : 'text-gold-100 hover:bg-white/[0.12] hover:text-white'
        ]"
      >
        <PhotoIcon class="w-5 h-5 inline mr-2" />
        Images
      </router-link>
    </div>

    <div v-if="currentTab === 'chapters'">
      <div v-if="loading" class="flex justify-center items-center h-64">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-600"></div>
      </div>

      <div v-else-if="sortedChapters.length > 0" >
        <section
          v-for="part in chaptersByPart.parts"
          :key="part.id"
          class="bg-white dark:bg-navy-900 border-gray-200 dark:border-gray-800 shadow-sm"
        >
          <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <button
              type="button"
              class="w-full flex items-center justify-between gap-3 text-left"
              @click="toggleMobilePart(part.id)"
              :aria-expanded="isPartExpanded(part.id)"
              :aria-controls="`mobile-part-${part.id}`"
            >
              <div class="flex items-center gap-3 w-full">
                <div
                  v-if="partThumbnails[part.id]"
                  class="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700"
                >
                  <img
                    :src="partThumbnails[part.id]"
                    class="h-full w-full object-cover"
                    alt=""
                  />
                </div>
                <div class="flex-1">
                  <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ part.name }}</h2>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {{ part.chapters.length }} chapter{{ part.chapters.length !== 1 ? 's' : '' }} ·
                    {{ formatWordCount(part.wordCount) }} words ·
                    <router-link
                      :to="`/m/books/${bookId}/parts/${part.id}`"
                      class="text-gold-600 hover:text-gold-700 hover:underline dark:text-gold-400 dark:hover:text-gold-300"
                      @click.stop
                    >View</router-link>
                  </p>
                </div>
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
              <button
                @click="createNewChapterInPart(part.id)"
                class="inline-flex items-center rounded-lg bg-gold-600 px-3 py-2 text-sm text-white transition-colors hover:bg-gold-700"
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
              :thumbnail-src="chapterThumbnails[chapter.id]"
            />
          </div>
        </section>

        <section
          v-if="chaptersByPart.parts.length > 0 && chaptersByPart.uncategorized.length > 0"
          class="bg-white dark:bg-navy-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm"
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
            <button @click="createNewChapter" class="inline-flex items-center px-3 py-2 text-sm bg-gold-600 text-white rounded-lg hover:bg-gold-700 transition-colors">
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
              :thumbnail-src="chapterThumbnails[chapter.id]"
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
            class="bg-white dark:bg-navy-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm"
          >
            <BookMobileChapterCard
              :book-id="bookId"
              :chapter="chapter"
              :expanded-summaries="expandedSummaries"
              :get-summary-preview="getSummaryPreview"
              :toggle-summary="toggleSummary"
              :edit-chapter="editChapter"
              :thumbnail-src="chapterThumbnails[chapter.id]"
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
        <button @click="createNewChapter" class="inline-flex items-center px-4 py-2 bg-gold-600 text-white rounded-lg hover:bg-gold-700 transition-colors">
          <PlusIcon class="w-5 h-5 mr-2" />
          Add First Chapter
        </button>
      </div>
    </div>

    <div v-else-if="currentTab === 'wiki'">
      <div v-if="loadingWiki" class="flex justify-center items-center h-64">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-600"></div>
      </div>

      <template v-else>
        <div v-if="hasAnyWikiPages" class="relative mb-6">
          <button
            @click="showWikiTypeDropdown = !showWikiTypeDropdown"
            class="w-full flex items-center justify-between px-4 py-3 text-base font-medium bg-white dark:bg-navy-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"
          >
            <span class="flex items-center">
              <component
                :is="wikiTypeIcon(wikiTypeFilter)"
                :class="['w-5 h-5 mr-2', wikiTypeFilter === 'all' ? 'text-gold-600 dark:text-gold-400' : getTypeColor(wikiTypeFilter)]"
              />
              <span class="text-gray-900 dark:text-white">{{ currentWikiTypeOption().label }}</span>
            </span>
            <ChevronDownIcon
              :class="['w-5 h-5 text-gray-500 transition-transform', showWikiTypeDropdown ? 'rotate-180' : '']"
            />
          </button>

          <div
            v-if="showWikiTypeDropdown"
            class="fixed inset-0 z-0"
            @click="showWikiTypeDropdown = false"
          ></div>

          <div
            v-if="showWikiTypeDropdown"
            class="absolute z-10 mt-1 w-full bg-white dark:bg-navy-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1"
          >
            <button
              v-for="option in wikiTypeOptions"
              :key="option.id"
              type="button"
              @click="selectWikiType(option.id)"
              :class="[
                'flex w-full items-center px-4 py-3 text-base transition-colors',
                wikiTypeFilter === option.id
                  ? 'bg-gold-50 dark:bg-gold-900/30 text-gold-700 dark:text-gold-300'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
              ]"
            >
              <component
                :is="wikiTypeIcon(option.id)"
                :class="['w-5 h-5 mr-2', option.id === 'all' ? '' : getTypeColor(option.id)]"
              />
              {{ option.label }}
            </button>
          </div>
        </div>

        <div v-if="hasFilteredWikiPages" class="space-y-8">
        <div class="flex justify-end">
          <button
            @click="openCreateWikiModal"
            class="inline-flex items-center px-4 py-2 bg-gold-600 text-white rounded-lg hover:bg-gold-700 transition-colors"
          >
            <PlusIcon class="w-5 h-5 mr-2" />
            New Wiki Page
          </button>
        </div>
        <div v-for="(pages, type) in filteredWikiPagesByType" :key="type" class="space-y-4">
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
              class="flex gap-3 bg-white dark:bg-navy-800 rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 p-4 hover:border-gold-300 dark:hover:border-gold-600 cursor-pointer"
            >
              <div
                v-if="wikiPageThumbnails[page.id]"
                class="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700"
              >
                <img
                  :src="wikiPageThumbnails[page.id]"
                  class="h-full w-full object-cover"
                  :alt="page.page_name"
                />
              </div>
              <div class="min-w-0 flex-1">
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
                  <button
                    @click.prevent.stop="toggleWikiPagePinned(page)"
                    class="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gold-600 dark:hover:bg-gray-700 dark:hover:text-gold-300"
                    :class="page.is_pinned ? 'text-gold-600 dark:text-gold-300' : ''"
                    :title="page.is_pinned ? 'Unpin wiki page' : 'Pin wiki page'"
                    :aria-label="page.is_pinned ? 'Unpin wiki page' : 'Pin wiki page'"
                  >
                    <BookmarkIcon
                      class="h-5 w-5"
                      :class="page.is_pinned ? 'fill-current' : ''"
                    />
                  </button>
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
              </div>
            </router-link>
          </div>
        </div>
      </div>

        <div v-else-if="hasAnyWikiPages" class="text-center py-16">
          <BookOpenIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No {{ wikiTypeFilter }} pages yet
          </h3>
          <p class="text-gray-600 dark:text-gray-400 mb-4">
            Try a different type, or add a new page.
          </p>
          <button
            @click="openCreateWikiModal"
            class="inline-flex items-center px-4 py-2 bg-gold-600 text-white rounded-lg hover:bg-gold-700 transition-colors"
          >
            <PlusIcon class="w-5 h-5 mr-2" />
            New Wiki Page
          </button>
        </div>

        <div v-else class="text-center py-16">
          <BookOpenIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No wiki pages yet</h3>
          <p class="text-gray-600 dark:text-gray-400 mb-4">
            Create wiki pages to track characters, locations, and concepts in your book.
          </p>
          <button
            @click="openCreateWikiModal"
            class="inline-flex items-center px-4 py-2 bg-gold-600 text-white rounded-lg hover:bg-gold-700 transition-colors"
          >
            <PlusIcon class="w-5 h-5 mr-2" />
            Create Wiki Page
          </button>
          <p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Wiki pages can also be auto-generated when you create chapter summaries.
          </p>
        </div>
      </template>
    </div>

    <!-- Images Tab Content -->
    <div v-else-if="currentTab === 'images'">
      <!-- Image Detail View -->
      <div v-if="selectedImageId && selectedImageSrc">
        <router-link
          :to="`/books/${bookId}?tab=images`"
          class="inline-flex items-center text-sm text-gold-600 dark:text-gold-400 hover:text-gold-800 dark:hover:text-gold-300 mb-4"
        >
          <ArrowLeftIcon class="w-4 h-4 mr-1" />
          Back to images
        </router-link>
        <div class="bg-white dark:bg-navy-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
          <IllustrationDetail
            :image="selectedImage"
            :image-src="selectedImageSrc"
            :tags="selectedImageTags"
            :wiki-pages="wikiPages"
            :saving-notes="savingSelectedImageNotes"
            :saving-tags="savingSelectedImageTags"
            :can-edit-notes="Boolean(saveSelectedImageNotes)"
            :can-edit-tags="Boolean(saveSelectedImageTags)"
            :can-download="Boolean(downloadSelectedImage)"
            @save-notes="saveSelectedImageNotes?.($event)"
            @save-tags="saveSelectedImageTags?.($event)"
            @download="downloadSelectedImage?.($event)"
          />
        </div>
      </div>

      <!-- Image Grid -->
      <template v-else>
        <div v-if="loadingImages" class="flex justify-center items-center h-64">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-600"></div>
        </div>

        <div v-else-if="!canSelectImages && bookImages.length === 0" class="text-center py-16">
          <PhotoIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No images yet</h3>
          <p class="text-gray-600 dark:text-gray-400">
            Images added to chapters and covers will appear here.
          </p>
        </div>

        <div v-else-if="bookImages.length > 0" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <router-link
            v-for="image in bookImages"
            :key="image.id"
            :to="`/books/${bookId}?tab=images&imageId=${image.id}`"
            class="relative aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700 cursor-pointer transition-all hover:ring-2 hover:ring-gold-400"
          >
            <img
              v-if="bookImageSources[image.id]"
              :src="bookImageSources[image.id]"
              class="h-full w-full object-cover"
              :alt="image.file_name || 'Book illustration'"
            />
            <div v-else class="h-full w-full flex items-center justify-center">
              <PhotoIcon class="w-8 h-8 text-gray-400" />
            </div>
            <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
              <p class="text-xs text-white truncate">
                {{ image.file_name || 'Untitled' }}
              </p>
            </div>
          </router-link>
        </div>

        <div v-else class="text-center py-16">
          <PhotoIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No images yet</h3>
          <p class="text-gray-600 dark:text-gray-400">
            Add illustrations to your chapters to see them here.
          </p>
        </div>
      </template>
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
