<script setup lang="ts">
import type { Component } from 'vue'
import { BookmarkIcon, BookOpenIcon, PlusIcon } from '@heroicons/vue/24/outline'
import type { BookWikiPage } from '@/types/bookView'

defineProps<{
  bookId: string
  loadingWiki: boolean
  hasWikiPages: boolean
  wikiPagesByType: Record<string, BookWikiPage[]>
  getTypeIcon: (type: string) => Component
  getTypeColor: (type: string) => string
  activeWikiPageId?: string
  toggleWikiPagePinned: (page: BookWikiPage) => void | Promise<void>
  openCreateWikiModal?: () => void
}>()
</script>

<template>
  <div>
    <div v-if="loadingWiki" class="flex justify-center items-center h-32">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
    </div>

    <div v-else-if="hasWikiPages" class="space-y-4">
      <button
        v-if="openCreateWikiModal"
        @click="openCreateWikiModal"
        class="w-full inline-flex items-center justify-center px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
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
              <button
                @click.prevent.stop="toggleWikiPagePinned(page)"
                class="ml-2 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-blue-600 dark:hover:bg-gray-700 dark:hover:text-blue-300"
                :class="page.is_pinned ? 'text-blue-600 dark:text-blue-300' : ''"
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
          </router-link>
        </div>
      </div>
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
        class="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        <PlusIcon class="w-4 h-4 mr-1" />
        Create Wiki Page
      </button>
    </div>
  </div>
</template>
