<script setup lang="ts">
import { Cog6ToothIcon, DocumentTextIcon, PhotoIcon, TrashIcon } from '@heroicons/vue/24/outline'
import IllustrationDetail from '@/components/images/IllustrationDetail.vue'
import { useLibraryContext } from '@/composables/useLibraryContext'
import type { ImageAsset, ImageWikiTag } from '@/lib/database'
import type { ChapterRevisionActivity } from '@/lib/database'
import type { BookChaptersByPart, BookWikiPage } from '@/types/bookView'
import BookActivityHeatmap from './BookActivityHeatmap.vue'

defineProps<{
  bookId: string
  booksPath: string
  currentTab: 'chapters' | 'wiki' | 'images'
  chaptersByPart: BookChaptersByPart
  partSummaries?: Record<string, string>
  partThumbnails?: Record<string, string>
  formatWordCount: (count: number) => string
  selectedImageId?: string | null
  selectedImageSrc?: string | null
  selectedImage?: ImageAsset | null
  selectedImageTags?: ImageWikiTag[]
  wikiPages?: BookWikiPage[]
  savingSelectedImageNotes?: boolean
  savingSelectedImageTags?: boolean
  saveSelectedImageNotes?: (notes: string) => void | Promise<void>
  saveSelectedImageTags?: (wikiPageIds: string[]) => void | Promise<void>
  downloadSelectedImage?: (imageId: string) => void
  isOnBookOnly: boolean
  routerViewKey: number
  wikiPagePinChanged: (payload: { id: string; isPinned: boolean; updatedAt: string }) => void
  revisionActivity?: ChapterRevisionActivity[]
  requestDeleteBook?: () => void
}>()

const { readOnly } = useLibraryContext()
</script>

<template>
  <div class="flex-1 bg-gray-50 dark:bg-navy-900 overflow-y-auto">
    <div v-if="currentTab === 'images' && selectedImageId && selectedImageSrc" class="h-full flex flex-col">
      <IllustrationDetail
        :image="selectedImage || null"
        :image-src="selectedImageSrc"
        :tags="selectedImageTags || []"
        :wiki-pages="wikiPages || []"
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

    <div v-else-if="currentTab === 'images' && !selectedImageId" class="flex items-center justify-center h-full">
      <div class="text-center">
        <PhotoIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 class="text-xl font-medium text-gray-900 dark:text-white mb-2">
          Please select an image
        </h3>
        <p class="text-gray-600 dark:text-gray-400 max-w-md">
          Choose an image from the sidebar to view it at full size.
        </p>
      </div>
    </div>

    <div v-else-if="isOnBookOnly" class="h-full overflow-y-auto p-8">
      <div class="mx-auto max-w-5xl">
        <div class="py-6 text-center">
          <DocumentTextIcon class="mx-auto mb-4 h-16 w-16 text-gray-400" />
          <h3 class="mb-2 text-xl font-medium text-gray-900 dark:text-white">
            Please select a chapter
          </h3>
          <p
            data-testid="chapter-selection-help"
            class="mx-auto max-w-md text-gray-600 dark:text-gray-400"
          >
            Choose a chapter from the sidebar to view and edit its content, or explore a
            part overview below.
          </p>
        </div>

        <section v-if="chaptersByPart.parts.length" class="mt-8" aria-labelledby="book-parts-heading">
          <div class="mb-4">
            <h2 id="book-parts-heading" class="text-xl font-semibold text-gray-900 dark:text-white">
              Parts
            </h2>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Review the shape of the book before opening an individual chapter.
            </p>
          </div>

          <div class="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <router-link
              v-for="(part, index) in chaptersByPart.parts"
              :key="part.id"
              :to="`${booksPath}/${bookId}/parts/${part.id}`"
              :data-testid="`book-overview-part-${part.id}`"
              class="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-gold-400 hover:shadow-md dark:border-gray-700 dark:bg-navy-800 dark:hover:border-gold-500"
            >
              <div v-if="partThumbnails?.[part.id]" class="aspect-[16/7] overflow-hidden bg-gray-100 dark:bg-navy-700">
                <img
                  :src="partThumbnails[part.id]"
                  :alt="`${part.name} cover`"
                  class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                />
              </div>
              <div class="p-5">
                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-gold-700 dark:text-gold-300">
                  Part {{ index + 1 }}
                </p>
                <h3 class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {{ part.name }}
                </h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {{ part.chapters.length }} chapter{{ part.chapters.length === 1 ? '' : 's' }} ·
                  {{ formatWordCount(part.wordCount) }} words
                </p>
                <p
                  :data-testid="`book-overview-part-summary-${part.id}`"
                  class="mt-4 line-clamp-4 text-sm leading-6 text-gray-600 dark:text-gray-300"
                >
                  {{ partSummaries?.[part.id] || 'Open this part to review its chapters and add a part summary.' }}
                </p>
                <span class="mt-4 inline-flex text-sm font-semibold text-gold-700 group-hover:underline dark:text-gold-300">
                  View part →
                </span>
              </div>
            </router-link>
          </div>
        </section>

        <div class="mt-12">
          <BookActivityHeatmap :book-id="bookId" :activity="revisionActivity || []" />
        </div>

        <div
          class="mt-8 flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-6 dark:border-gray-700"
          data-testid="book-overview-actions"
        >
          <router-link
            to="/settings"
            class="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:bg-navy-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
            title="User Settings"
          >
            <Cog6ToothIcon class="mr-2 h-5 w-5" />
            Settings
          </router-link>
          <button
            v-if="!readOnly && requestDeleteBook"
            type="button"
            class="inline-flex items-center rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-red-600 shadow-sm transition-colors hover:bg-red-50 dark:border-red-800 dark:bg-navy-800 dark:text-red-400 dark:hover:bg-red-900/20"
            title="Delete book"
            @click="requestDeleteBook"
          >
            <TrashIcon class="mr-2 h-5 w-5" />
            Delete
          </button>
        </div>
      </div>
    </div>

    <router-view
      v-else
      :key="routerViewKey"
      @wiki-page-pin-changed="wikiPagePinChanged"
    />
  </div>
</template>
