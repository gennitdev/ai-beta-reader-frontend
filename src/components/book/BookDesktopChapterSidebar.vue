<script setup lang="ts">
import draggable from 'vuedraggable'
import { BookOpenIcon, DocumentTextIcon, PlusIcon } from '@heroicons/vue/24/outline'
import type { BookChapter, BookChaptersByPart } from '@/types/bookView'
import BookDesktopChapterListItem from './BookDesktopChapterListItem.vue'

defineProps<{
  bookId: string
  hasChapters: boolean
  loadingChapters: boolean
  chaptersByPart: BookChaptersByPart
  sidebarPartLists: Record<string, BookChapter[]>
  sidebarUncategorized: BookChapter[]
  expandedParts: Set<string>
  togglePart: (partId: string) => void
  expandPart: (partId: string) => void
  createNewChapterInPart: (partId: string) => void
  onSidebarDragStart: () => void
  onSidebarDragEnd: () => void | Promise<void>
  editChapter: (chapterId: string) => void
  insertChapter: (chapter: BookChapter, placement: 'before' | 'after') => void
  formatWordCount: (count: number) => string
  wordCountForChapters: (chapters: BookChapter[]) => number
  activeChapterId?: string
  chapterThumbnails: Record<string, string>
  partThumbnails: Record<string, string>
}>()
</script>

<template>
  <div>
    <div v-if="loadingChapters" class="flex justify-center items-center h-32">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-gold-600"></div>
    </div>

    <div v-else-if="hasChapters" class="divide-y divide-gray-200 dark:divide-gray-800">
      <div v-for="part in chaptersByPart.parts" :key="part.id" class="overflow-hidden">
        <button
          type="button"
          @click="togglePart(part.id)"
          class="w-full text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500"
          :aria-expanded="expandedParts.has(part.id)"
          :aria-controls="`sidebar-part-${part.id}`"
        >
          <div
            v-if="partThumbnails[part.id]"
            class="relative mx-2 my-2 overflow-hidden rounded-lg"
          >
            <div class="aspect-[16/9] w-full overflow-hidden bg-gray-100 dark:bg-gray-700">
              <img
                :src="partThumbnails[part.id]"
                class="h-full w-full object-cover"
                alt=""
              />
            </div>

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
                      class="text-gold-300 hover:text-gold-200 hover:underline"
                      @click.stop="expandPart(part.id)"
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

          <div
            v-else
            class="mx-2 my-2 rounded-lg border border-gray-200 bg-white px-3 py-3 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-navy-800 dark:hover:bg-gray-700"
          >
            <div class="flex items-center justify-between gap-3">
              <div class="flex min-w-0 items-center gap-3">
                <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-300">
                  <BookOpenIcon class="h-5 w-5" />
                </div>
                <div class="min-w-0">
                  <h4 class="truncate font-medium text-gray-900 dark:text-white">
                    {{ part.name }}
                  </h4>
                  <p class="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
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
                      class="text-gold-600 hover:text-gold-700 hover:underline dark:text-gold-400 dark:hover:text-gold-300"
                      @click.stop="expandPart(part.id)"
                    >View</router-link>
                  </p>
                </div>
              </div>
              <svg
                :class="expandedParts.has(part.id) ? 'rotate-180' : ''"
                class="h-5 w-5 flex-shrink-0 text-gray-500 transition-transform dark:text-gray-400"
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
        </button>

        <div
          v-if="expandedParts.has(part.id)"
          :id="`sidebar-part-${part.id}`"
          class="bg-white dark:bg-navy-800"
        >
          <div class="pr-2 pt-3 pb-2 flex justify-end border-t border-gray-200 dark:border-gray-700">
            <button
              @click.prevent.stop="createNewChapterInPart(part.id)"
              class="inline-flex items-center rounded-md bg-gold-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gold-700"
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
                :insert-chapter="insertChapter"
                :thumbnail-src="chapterThumbnails[chapter.id]"
              />
            </template>
          </draggable>
        </div>
      </div>

      <div
        v-if="sidebarUncategorized.length > 0"
        :class="chaptersByPart.parts.length > 0
          ? 'border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden'
          : ''"
      >
        <div
          v-if="chaptersByPart.parts.length > 0"
          class="px-2 py-3 bg-gray-50 dark:bg-gray-700"
        >
          <h4 class="font-medium text-gray-900 dark:text-white">Uncategorized</h4>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {{ sidebarUncategorized.length }} chapter{{
              sidebarUncategorized.length !== 1 ? 's' : ''
            }}
            · {{ formatWordCount(wordCountForChapters(sidebarUncategorized)) }} words
          </p>
        </div>
        <div class="bg-white dark:bg-navy-800">
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
                :insert-chapter="insertChapter"
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
</template>
