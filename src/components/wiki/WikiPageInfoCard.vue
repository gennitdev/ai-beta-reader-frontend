<script setup lang="ts">
import { formatDate } from '@/utils/wikiPageView'

defineProps<{
  pageType: string
  summary: string | null
  aliases: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
  isEditingAliases: boolean
  editedAliases: string[]
  savingAliases: boolean
  aliasError: string
  isEditingTags: boolean
  editedTags: string[]
  savingTags: boolean
}>()

const newAlias = defineModel<string>('newAlias', { required: true })
const newTag = defineModel<string>('newTag', { required: true })

defineEmits<{
  (event: 'start-editing-aliases'): void
  (event: 'cancel-edit-aliases'): void
  (event: 'add-alias'): void
  (event: 'remove-alias', alias: string): void
  (event: 'save-aliases'): void
  (event: 'start-editing-tags'): void
  (event: 'cancel-edit-tags'): void
  (event: 'add-tag'): void
  (event: 'remove-tag', tag: string): void
  (event: 'save-tags'): void
}>()
</script>

<template>
  <div class="bg-white dark:bg-navy-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
    <div class="p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Page Info</h3>

      <div class="space-y-3 text-sm">
        <div>
          <span class="font-medium text-gray-300 ">Type:</span>
          <span class="ml-2 capitalize text-gray-400 dark:text-gray-100">{{ pageType }}</span>
        </div>

        <div v-if="summary">
          <span class="font-medium text-gray-700 dark:text-gray-300">Summary:</span>
          <p class="mt-1 text-gray-600 dark:text-gray-400">{{ summary }}</p>
        </div>

        <div>
          <div class="flex items-center justify-between gap-3">
            <span class="font-medium text-gray-700 dark:text-gray-300">Alternate names:</span>
            <button
              v-if="!isEditingAliases"
              type="button"
              class="text-xs font-medium text-gold-600 transition-colors hover:text-gold-700 dark:text-gold-400 dark:hover:text-gold-300"
              @click="$emit('start-editing-aliases')"
            >
              {{ aliases.length ? 'Edit names' : 'Add names' }}
            </button>
          </div>

          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Nicknames, titles, and other names that should resolve to this page.
          </p>

          <div v-if="isEditingAliases" class="mt-3 space-y-3">
            <div v-if="editedAliases.length" class="flex flex-wrap gap-2">
              <button
                v-for="alias in editedAliases"
                :key="alias"
                type="button"
                class="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-1 text-xs text-purple-800 transition-colors hover:bg-purple-200 dark:bg-purple-900 dark:text-purple-200 dark:hover:bg-purple-800"
                @click="$emit('remove-alias', alias)"
              >
                <span>{{ alias }}</span>
                <span class="ml-1.5 text-[11px]" aria-hidden="true">x</span>
                <span class="sr-only">Remove {{ alias }}</span>
              </button>
            </div>

            <div class="flex gap-2">
              <input
                v-model="newAlias"
                type="text"
                class="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-gold-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="Add an alternate name"
                @keyup.enter="$emit('add-alias')"
              />
              <button
                type="button"
                class="rounded-md bg-gold-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-700"
                @click="$emit('add-alias')"
              >
                Add
              </button>
            </div>

            <p v-if="aliasError" class="text-xs text-red-600 dark:text-red-400" role="alert">
              {{ aliasError }}
            </p>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-md bg-gold-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="savingAliases"
                @click="$emit('save-aliases')"
              >
                {{ savingAliases ? 'Saving...' : 'Save names' }}
              </button>
              <button
                type="button"
                class="text-sm font-medium text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                :disabled="savingAliases"
                @click="$emit('cancel-edit-aliases')"
              >
                Cancel
              </button>
            </div>
          </div>

          <div v-else-if="aliases.length" class="mt-2 flex flex-wrap gap-1">
            <span
              v-for="alias in aliases"
              :key="alias"
              class="rounded bg-purple-100 px-2 py-1 text-xs text-purple-800 dark:bg-purple-900 dark:text-purple-200"
            >
              {{ alias }}
            </span>
          </div>
          <p v-else class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            No alternate names yet.
          </p>
        </div>

        <div>
          <div class="flex items-center justify-between">
            <span class="font-medium text-gray-700 dark:text-gray-300">Tags:</span>
            <button
              v-if="!isEditingTags"
              type="button"
              class="text-xs font-medium text-gold-600 transition-colors hover:text-gold-700 dark:text-gold-400 dark:hover:text-gold-300"
              @click="$emit('start-editing-tags')"
            >
              {{ tags.length ? 'Edit tags' : 'Add tags' }}
            </button>
          </div>

          <div v-if="isEditingTags" class="mt-2 space-y-3">
            <div v-if="editedTags.length" class="flex flex-wrap gap-2">
              <button
                v-for="tag in editedTags"
                :key="tag"
                type="button"
                class="inline-flex items-center rounded-full bg-gold-100 px-2.5 py-1 text-xs text-gold-800 transition-colors hover:bg-gold-200 dark:bg-gold-900 dark:text-gold-200 dark:hover:bg-gold-800"
                @click="$emit('remove-tag', tag)"
              >
                <span>{{ tag }}</span>
                <span class="ml-1.5 text-[11px]">x</span>
              </button>
            </div>
            <p v-else class="text-xs text-gray-500 dark:text-gray-400">
              No tags yet. Add a few to improve organization.
            </p>

            <div class="flex gap-2">
              <input
                v-model="newTag"
                type="text"
                class="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-gold-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="Add a tag"
                @keyup.enter="$emit('add-tag')"
              />
              <button
                type="button"
                class="rounded-md bg-gold-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gold-700"
                @click="$emit('add-tag')"
              >
                Add
              </button>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-md bg-gold-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="savingTags"
                @click="$emit('save-tags')"
              >
                {{ savingTags ? 'Saving...' : 'Save tags' }}
              </button>
              <button
                type="button"
                class="text-sm font-medium text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                :disabled="savingTags"
                @click="$emit('cancel-edit-tags')"
              >
                Cancel
              </button>
            </div>
          </div>

          <div v-else-if="tags.length" class="mt-1 flex flex-wrap gap-1">
            <span
              v-for="tag in tags"
              :key="tag"
              class="px-2 py-1 text-xs bg-gold-100 dark:bg-gold-900 text-gold-800 dark:text-gold-200 rounded"
            >
              {{ tag }}
            </span>
          </div>
          <p v-else class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            No tags yet.
          </p>
        </div>

        <div>
          <span class="font-medium text-gray-300 dark:text-gray-300">Created:</span>
          <span class="ml-2 text-gray-400 dark:text-gray-100">{{ formatDate(createdAt) }}</span>
        </div>

        <div>
          <span class="font-medium text-gray-300 dark:text-gray-300">Updated:</span>
          <span class="ml-2 text-gray-400 dark:text-gray-100">{{ formatDate(updatedAt) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
