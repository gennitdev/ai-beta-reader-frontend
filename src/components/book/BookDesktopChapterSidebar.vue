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
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
    </div>

    <div v-else-if="hasChapters" class="divide-y divide-gray-200 dark:divide-gray-800">
      <div v-for="part in chaptersByPart.parts" :key="part.id" class="overflow-hidden">
        <button
          @click="togglePart(part.id)"
          class="w-full text-left transition-colors focus:outline-none"
        >
          <div class="relative overflow-hidden rounded-lg mx-2 my-2">
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
            <div
              v-else
              class="aspect-[16/9] w-full bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 dark:from-indigo-900/40 dark:via-purple-900/30 dark:to-pink-900/40 flex items-center justify-center"
            >
              <BookOpenIcon class="w-12 h-12 text-indigo-300 dark:text-indigo-600 opacity-60" />
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
                      class="text-blue-300 hover:text-blue-200 hover:underline"
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
                :insert-chapter="insertChapter"
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
