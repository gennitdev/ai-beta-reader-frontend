<script setup lang="ts">
import { computed, type Component } from 'vue'
import { BookmarkIcon, BookOpenIcon, Cog6ToothIcon, DocumentTextIcon, PhotoIcon, PlusIcon, TrashIcon } from '@heroicons/vue/24/outline'
import IllustrationDetail from '@/components/images/IllustrationDetail.vue'
import IllustrationGrid from '@/components/images/IllustrationGrid.vue'
import ImageLightbox from '@/components/images/ImageLightbox.vue'
import { useLibraryContext } from '@/composables/useLibraryContext'
import type { ImageAsset, ImageWikiTag } from '@/lib/database'
import type { ChapterRevisionActivity } from '@/lib/database'
import type { BookChaptersByPart, BookWikiPage } from '@/types/bookView'
import BookActivityHeatmap from './BookActivityHeatmap.vue'

const props = defineProps<{
  bookId: string
  booksPath: string
  currentTab: 'chapters' | 'wiki' | 'images'
  chaptersByPart: BookChaptersByPart
  partSummaries?: Record<string, string>
  partThumbnails?: Record<string, string>
  loadingWiki?: boolean
  wikiPagesByType?: Record<string, BookWikiPage[]>
  wikiPageThumbnails?: Record<string, string>
  getTypeIcon?: (type: string) => Component
  getTypeColor?: (type: string) => string
  toggleWikiPagePinned?: (page: BookWikiPage) => void | Promise<void>
  openCreateWikiModal?: () => void
  formatWordCount: (count: number) => string
  bookImages?: ImageAsset[]
  bookImageSources?: Record<string, string>
  bookImageTags?: Record<string, ImageWikiTag[]>
  loadingImages?: boolean
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
  selectBookImage?: (imageId: string | null) => void
  isOnBookOnly: boolean
  routerViewKey: number
  wikiPagePinChanged: (payload: { id: string; isPinned: boolean; updatedAt: string }) => void
  revisionActivity?: ChapterRevisionActivity[]
  requestDeleteBook?: () => void
}>()

const { readOnly } = useLibraryContext()

const images = computed(() => props.bookImages || [])
const activeImageIndex = computed(() =>
  props.selectedImageId ? images.value.findIndex((image) => image.id === props.selectedImageId) : -1,
)
const hasPreviousImage = computed(() => activeImageIndex.value > 0)
const hasNextImage = computed(() =>
  activeImageIndex.value >= 0 && activeImageIndex.value < images.value.length - 1,
)

const selectAdjacentImage = (offset: number) => {
  const nextImage = images.value[activeImageIndex.value + offset]
  if (nextImage) props.selectBookImage?.(nextImage.id)
}
</script>

<template>
  <div class="flex-1 bg-gray-50 dark:bg-navy-900 overflow-y-auto">
    <div v-if="currentTab === 'images'" class="h-full overflow-y-auto p-8" data-testid="book-images-overview">
      <div class="mx-auto max-w-6xl">
        <div class="mb-6">
          <div class="flex items-center gap-3">
            <PhotoIcon class="h-8 w-8 text-gold-600 dark:text-gold-400" />
            <div>
              <h2 class="text-2xl font-semibold text-gray-900 dark:text-white">Images</h2>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Browse every illustration and cover associated with this book.
              </p>
            </div>
          </div>
        </div>
        <IllustrationGrid
          :images="images"
          :image-sources="bookImageSources || {}"
          :tags-by-image-id="bookImageTags || {}"
          :loading="loadingImages"
          empty-text="Add illustrations to chapters or covers to see them here."
          @open-image="selectBookImage?.($event)"
        />
      </div>
    </div>

    <div v-else-if="isOnBookOnly && currentTab === 'wiki'" class="h-full overflow-y-auto p-8" data-testid="book-wiki-overview">
      <div class="mx-auto max-w-5xl">
        <div class="py-6 text-center">
          <BookOpenIcon class="mx-auto mb-4 h-16 w-16 text-gray-400" />
          <h3 class="mb-2 text-xl font-medium text-gray-900 dark:text-white">
            Please select a wiki page
          </h3>
          <p class="mx-auto max-w-md text-gray-600 dark:text-gray-400">
            Choose a wiki page from the sidebar, or browse the book’s characters, locations, concepts, and other entries below.
          </p>
        </div>

        <div v-if="loadingWiki" class="flex h-32 items-center justify-center">
          <div class="h-7 w-7 animate-spin rounded-full border-b-2 border-gold-600"></div>
        </div>

        <div v-else-if="Object.keys(wikiPagesByType || {}).length" class="mt-8 space-y-8">
          <div class="flex justify-end">
            <button
              v-if="openCreateWikiModal"
              type="button"
              :disabled="readOnly"
              class="inline-flex items-center rounded-lg bg-gold-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-60"
              @click="openCreateWikiModal"
            >
              <PlusIcon class="mr-2 h-5 w-5" />
              New Wiki Page
            </button>
          </div>

          <section v-for="(pages, type) in wikiPagesByType" :key="type">
            <div class="mb-4 flex items-center gap-2">
              <component v-if="getTypeIcon" :is="getTypeIcon(type)" :class="['h-6 w-6', getTypeColor?.(type)]" />
              <h2 class="text-xl font-semibold capitalize text-gray-900 dark:text-white">{{ type }}s</h2>
              <span class="text-sm text-gray-500 dark:text-gray-400">({{ pages.length }})</span>
            </div>
            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <router-link
                v-for="page in pages"
                :key="page.id"
                :to="`${booksPath}/${bookId}/wiki/${page.id}`"
                :data-testid="`book-overview-wiki-${page.id}`"
                class="flex gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-gold-400 hover:shadow-md dark:border-gray-700 dark:bg-navy-800 dark:hover:border-gold-500"
              >
                <div v-if="wikiPageThumbnails?.[page.id]" class="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700">
                  <img :src="wikiPageThumbnails[page.id]" :alt="page.page_name" class="h-full w-full object-cover" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-2">
                    <h3 class="truncate font-semibold text-gray-900 dark:text-white">{{ page.page_name }}</h3>
                    <button
                      v-if="toggleWikiPagePinned"
                      type="button"
                      :disabled="readOnly"
                      :aria-label="page.is_pinned ? 'Unpin wiki page' : 'Pin wiki page'"
                      :class="['rounded p-1 text-gray-400 hover:text-gold-600 disabled:opacity-50', page.is_pinned ? 'text-gold-600 dark:text-gold-300' : '']"
                      @click.prevent.stop="toggleWikiPagePinned(page)"
                    >
                      <BookmarkIcon :class="['h-4 w-4', page.is_pinned ? 'fill-current' : '']" />
                    </button>
                  </div>
                  <p class="mt-2 line-clamp-3 text-sm text-gray-600 dark:text-gray-400">
                    {{ page.summary || 'No summary available yet.' }}
                  </p>
                </div>
              </router-link>
            </div>
          </section>
        </div>

        <div v-else class="py-12 text-center">
          <BookOpenIcon class="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <h3 class="font-medium text-gray-900 dark:text-white">No wiki pages yet</h3>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">Create a wiki page to start documenting your story world.</p>
        </div>
      </div>
    </div>

    <div v-else-if="isOnBookOnly && currentTab === 'chapters'" class="h-full overflow-y-auto p-8">
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

    <ImageLightbox
      :show="currentTab === 'images' && Boolean(selectedImageId)"
      :image="selectedImage || null"
      :image-src="selectedImageSrc || null"
      :current-index="activeImageIndex + 1"
      :total-images="images.length"
      :has-previous="hasPreviousImage"
      :has-next="hasNextImage"
      @close="selectBookImage?.(null)"
      @previous="selectAdjacentImage(-1)"
      @next="selectAdjacentImage(1)"
    >
      <template #details>
        <IllustrationDetail
          :image="selectedImage || null"
          :image-src="selectedImageSrc || null"
          :tags="selectedImageTags || []"
          :wiki-pages="wikiPages || []"
          :saving-notes="savingSelectedImageNotes"
          :saving-tags="savingSelectedImageTags"
          :can-edit-notes="Boolean(saveSelectedImageNotes)"
          :can-edit-tags="Boolean(saveSelectedImageTags)"
          :can-download="Boolean(downloadSelectedImage)"
          :show-preview="false"
          @save-notes="saveSelectedImageNotes?.($event)"
          @save-tags="saveSelectedImageTags?.($event)"
          @download="downloadSelectedImage?.($event)"
        />
      </template>
    </ImageLightbox>
  </div>
</template>
