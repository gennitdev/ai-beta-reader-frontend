<script setup lang="ts">
import { computed } from 'vue'
import draggable from 'vuedraggable'
import {
  PlusIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  PencilIcon,
  TrashIcon
} from '@heroicons/vue/24/outline'
import { Cog6ToothIcon } from '@heroicons/vue/24/solid'
import type { ChaptersByPart, Chapter } from '@/types/organize'

const props = defineProps<{
  loading: boolean
  errorMessage: string
  creatingPart: boolean
  creatingPartLoading: boolean
  newPartName: string
  chaptersByPart: ChaptersByPart
  partOrder: string[]
  editingPartId: string | null
  editingPartName: string
}>()

const emit = defineEmits<{
  (e: 'start-create-part'): void
  (e: 'cancel-create-part'): void
  (e: 'create-part'): void
  (e: 'update:newPartName', value: string): void
  (e: 'move-chapter-up', list: Chapter[], index: number): void
  (e: 'move-chapter-down', list: Chapter[], index: number): void
  (e: 'move-chapter-to-part', chapterId: string, partId: string | null): void
  (e: 'save-order'): void
  (e: 'move-part-up', partId: string): void
  (e: 'move-part-down', partId: string): void
  (e: 'start-edit-part', partId: string): void
  (e: 'update:editingPartName', value: string): void
  (e: 'save-part', partId: string): void
  (e: 'cancel-edit-part'): void
  (e: 'delete-part', partId: string): void
}>()

const disableCreateSubmit = computed(
  () => !props.newPartName.trim() || props.creatingPartLoading
)
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
      <h3 class="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">
        How to organize chapters
      </h3>
      <p class="text-sm text-blue-800 dark:text-blue-300">
        Use the dropdown next to each chapter to assign it to a part. Create new parts as
        needed to organize your chapters into logical sections.
      </p>
    </div>

    <div
      v-if="errorMessage"
      class="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
    >
      {{ errorMessage }}
    </div>

    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white">Parts</h3>
      <button
        v-if="!creatingPart"
        class="inline-flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        @click="emit('start-create-part')"
      >
        <PlusIcon class="w-4 h-4 mr-1" />
        New Part
      </button>
    </div>

    <div v-if="creatingPart" class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          :value="newPartName"
          type="text"
          placeholder="Enter part name..."
          class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          autofocus
          @input="emit('update:newPartName', ($event.target as HTMLInputElement).value)"
          @keyup.enter="emit('create-part')"
          @keyup.escape="emit('cancel-create-part')"
        />
        <div class="flex gap-2">
          <button
            class="inline-flex items-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
            :disabled="disableCreateSubmit"
            @click="emit('create-part')"
          >
            <div
              v-if="creatingPartLoading"
              class="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent mr-2"
            ></div>
            {{ creatingPartLoading ? 'Creating…' : 'Create' }}
          </button>
          <button
            class="px-3 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors text-sm"
            @click="emit('cancel-create-part')"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="py-12 text-center">
      <div class="inline-flex items-center text-gray-600 dark:text-gray-300">
        <svg class="w-5 h-5 mr-2 animate-spin" viewBox="0 0 24 24">
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
            fill="none"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        Loading chapters…
      </div>
    </div>

    <div v-else class="space-y-6">
      <div
        v-if="chaptersByPart.uncategorized.length > 0"
        class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
      >
        <div class="px-4 py-3 bg-gray-50 dark:bg-gray-700">
          <h4 class="font-medium text-gray-900 dark:text-white">Uncategorized Chapters</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {{ chaptersByPart.uncategorized.length }} chapter{{
              chaptersByPart.uncategorized.length !== 1 ? 's' : ''
            }}
          </p>
        </div>
        <div class="bg-white dark:bg-gray-800">
          <draggable
            v-model="chaptersByPart.uncategorized"
            item-key="id"
            group="organize-chapters"
            class="divide-y divide-gray-200 dark:divide-gray-700"
            @change="emit('save-order')"
          >
            <template #item="{ element: chapter, index }">
              <div class="flex items-center justify-between gap-3 py-3 px-4">
                <div class="flex-1">
                  <h5 class="text-sm font-medium text-gray-900 dark:text-white">
                    {{ chapter.title || chapter.id }}
                  </h5>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ chapter.word_count?.toLocaleString() || 0 }} words
                  </p>
                </div>
                <div class="flex items-center space-x-2">
                  <div class="flex flex-col">
                    <button
                      :disabled="index === 0"
                      class="p-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                      @click="emit('move-chapter-up', chaptersByPart.uncategorized, index)"
                    >
                      <ChevronUpIcon class="w-4 h-4" />
                    </button>
                    <button
                      :disabled="index >= chaptersByPart.uncategorized.length - 1"
                      class="p-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                      @click="emit('move-chapter-down', chaptersByPart.uncategorized, index)"
                    >
                      <ChevronDownIcon class="w-4 h-4" />
                    </button>
                  </div>
                  <div class="relative">
                    <select
                      :value="chapter.part_id || ''"
                      class="appearance-none text-sm px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-36 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none"
                      @change="
                        emit(
                          'move-chapter-to-part',
                          chapter.id,
                          ($event.target as HTMLSelectElement)?.value || null
                        )
                      "
                    >
                      <option value="">Uncategorized</option>
                      <option v-for="part in chaptersByPart.parts" :key="part.id" :value="part.id">
                        {{ part.name }}
                      </option>
                    </select>
                    <ChevronDownIcon
                      class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-300"
                    />
                  </div>
                </div>
              </div>
            </template>
          </draggable>
        </div>
      </div>

      <div
        v-for="part in chaptersByPart.parts"
        :key="part.id"
        class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
      >
        <div class="px-4 py-3 bg-gray-50 dark:bg-gray-700">
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <input
                v-if="editingPartId === part.id"
                :value="editingPartName"
                type="text"
                class="font-medium text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm w-full"
                autofocus
                @input="emit('update:editingPartName', ($event.target as HTMLInputElement).value)"
                @keyup.enter="emit('save-part', part.id)"
                @keyup.escape="emit('cancel-edit-part')"
              />
              <h4 v-else class="font-medium text-gray-900 dark:text-white">
                {{ part.name }}
              </h4>
              <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {{ part.chapters.length }} chapter{{ part.chapters.length !== 1 ? 's' : '' }}
                · {{ part.wordCount.toLocaleString() }} words
              </p>
            </div>
            <div class="flex items-center gap-1">
              <template v-if="editingPartId === part.id">
                <button
                  class="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  @click="emit('save-part', part.id)"
                >
                  Save
                </button>
                <button
                  class="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                  @click="emit('cancel-edit-part')"
                >
                  Cancel
                </button>
              </template>
              <template v-else>
                <button
                  :disabled="partOrder.indexOf(part.id) === 0"
                  class="p-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move part up"
                  @click="emit('move-part-up', part.id)"
                >
                  <ChevronUpIcon class="w-4 h-4" />
                </button>
                <button
                  :disabled="partOrder.indexOf(part.id) === partOrder.length - 1"
                  class="p-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move part down"
                  @click="emit('move-part-down', part.id)"
                >
                  <ChevronDownIcon class="w-4 h-4" />
                </button>
                <button
                  class="p-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  title="Edit name"
                  @click="emit('start-edit-part', part.id)"
                >
                  <PencilIcon class="w-4 h-4" />
                </button>
                <button
                  class="p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  title="Delete part"
                  @click="emit('delete-part', part.id)"
                >
                  <TrashIcon class="w-4 h-4" />
                </button>
              </template>
            </div>
          </div>
        </div>
        <div class="bg-white dark:bg-gray-800">
          <draggable
            v-model="part.chapters"
            item-key="id"
            group="organize-chapters"
            class="divide-y divide-gray-200 dark:divide-gray-700"
            @change="emit('save-order')"
          >
            <template #item="{ element: chapter, index }">
              <div class="flex items-center justify-between gap-3 py-3 px-4">
                <div class="flex-1">
                  <h5 class="text-sm font-medium text-gray-900 dark:text-white">
                    {{ chapter.title || chapter.id }}
                  </h5>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ chapter.word_count?.toLocaleString() || 0 }} words
                  </p>
                </div>
                <div class="flex items-center space-x-2">
                  <div class="flex flex-col">
                    <button
                      :disabled="index === 0"
                      class="p-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move up"
                      @click="emit('move-chapter-up', part.chapters, index)"
                    >
                      <ChevronUpIcon class="w-4 h-4" />
                    </button>
                    <button
                      :disabled="index >= part.chapters.length - 1"
                      class="p-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Move down"
                      @click="emit('move-chapter-down', part.chapters, index)"
                    >
                      <ChevronDownIcon class="w-4 h-4" />
                    </button>
                  </div>
                  <div class="relative">
                    <select
                      :value="chapter.part_id || ''"
                      class="appearance-none text-sm px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white min-w-36 focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none"
                      @change="
                        emit(
                          'move-chapter-to-part',
                          chapter.id,
                          ($event.target as HTMLSelectElement)?.value || null
                        )
                      "
                    >
                      <option value="">Uncategorized</option>
                      <option v-for="p in chaptersByPart.parts" :key="p.id" :value="p.id">
                        {{ p.name }}
                      </option>
                    </select>
                    <ChevronDownIcon
                      class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-300"
                    />
                  </div>
                </div>
              </div>
            </template>
          </draggable>
        </div>
      </div>

      <div
        v-if="chaptersByPart.parts.length === 0 && chaptersByPart.uncategorized.length === 0"
        class="text-center py-12"
      >
        <Cog6ToothIcon class="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No chapters to organize
        </h3>
        <p class="text-gray-600 dark:text-gray-400">
          Create some chapters first, then organize them into parts.
        </p>
      </div>
    </div>
  </div>
</template>
