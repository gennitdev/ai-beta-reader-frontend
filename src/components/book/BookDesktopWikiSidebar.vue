<script setup lang="ts">
import { computed, type Component } from 'vue'
import { BookmarkIcon, BookOpenIcon, PlusIcon } from '@heroicons/vue/24/outline'
import type { BookWikiPage } from '@/types/bookView'

const props = defineProps<{
  bookId: string
  loadingWiki: boolean
  hasWikiPages: boolean
  wikiPagesByType: Record<string, BookWikiPage[]>
  wikiPageThumbnails?: Record<string, string>
  getTypeIcon: (type: string) => Component
  getTypeColor: (type: string) => string
  activeWikiPageId?: string
  toggleWikiPagePinned: (page: BookWikiPage) => void | Promise<void>
  openCreateWikiModal?: () => void
  filterActive?: boolean
  filterLabel?: string
}>()

const hasFilteredPages = computed(() =>
  Object.values(props.wikiPagesByType).some((pages) => pages.length > 0)
)
</script>

<template>
  <div>
    <div v-if="loadingWiki" class="flex justify-center items-center h-32">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-gold-600"></div>
    </div>

    <div v-else-if="hasFilteredPages" class="space-y-4">
      <button
        v-if="openCreateWikiModal"
        @click="openCreateWikiModal"
        class="w-full inline-flex items-center justify-center px-3 py-2 text-sm bg-gold-600 text-white rounded-md hover:bg-gold-700 transition-colors"
      >
        <PlusIcon class="w-4 h-4 mr-1.5" />
        New Wiki Page
      </button>
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
            class="flex gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gold-300 dark:hover:border-gold-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            :class="
              activeWikiPageId === page.id
                ? 'bg-gold-50 dark:bg-gold-900/20 border-gold-300 dark:border-gold-600'
                : ''
            "
          >
            <div
              v-if="wikiPageThumbnails?.[page.id]"
              class="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-gray-700"
            >
              <img
                :src="wikiPageThumbnails[page.id]"
                class="h-full w-full object-cover"
                :alt="page.page_name"
              />
            </div>
            <div class="min-w-0 flex-1">
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
                <button
                  @click.prevent.stop="toggleWikiPagePinned(page)"
                  class="ml-2 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gold-600 dark:hover:bg-gray-700 dark:hover:text-gold-300"
                  :class="page.is_pinned ? 'text-gold-600 dark:text-gold-300' : ''"
                  :title="page.is_pinned ? 'Unpin wiki page' : 'Pin wiki page'"
                  :aria-label="page.is_pinned ? 'Unpin wiki page' : 'Pin wiki page'"
                >
                  <BookmarkIcon
                    class="h-4 w-4"
                    :class="page.is_pinned ? 'fill-current' : ''"
                  />
                </button>
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
            </div>
          </router-link>
        </div>
      </div>
    </div>

    <div v-else-if="hasWikiPages && filterActive" class="text-center py-8">
      <BookOpenIcon class="w-8 h-8 text-gray-400 mx-auto mb-3" />
      <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-2">
        No {{ filterLabel }} pages yet
      </h3>
      <p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
        Try a different type, or add a new page.
      </p>
      <button
        v-if="openCreateWikiModal"
        @click="openCreateWikiModal"
        class="inline-flex items-center px-3 py-1.5 text-sm bg-gold-600 text-white rounded-md hover:bg-gold-700 transition-colors"
      >
        <PlusIcon class="w-4 h-4 mr-1" />
        New Wiki Page
      </button>
    </div>

    <div v-else class="text-center py-8">
      <BookOpenIcon class="w-8 h-8 text-gray-400 mx-auto mb-3" />
      <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-2">
        No wiki pages yet
      </h3>
      <p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
        Create wiki pages to track characters, locations, and concepts.
      </p>
      <button
        v-if="openCreateWikiModal"
        @click="openCreateWikiModal"
        class="inline-flex items-center px-3 py-1.5 text-sm bg-gold-600 text-white rounded-md hover:bg-gold-700 transition-colors"
      >
        <PlusIcon class="w-4 h-4 mr-1" />
        Create Wiki Page
      </button>
    </div>
  </div>
</template>
