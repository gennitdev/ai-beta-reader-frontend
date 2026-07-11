<script setup lang="ts">
import AutocompleteMultiSelect, {
  type AutocompleteOption,
} from '@/components/links/AutocompleteMultiSelect.vue'
import type { ChapterWikiLink } from '@/lib/database'

defineProps<{
  routePrefix: string
  bookId: string
  chapterId: string
  links: ChapterWikiLink[]
  options: AutocompleteOption[]
  selectedIds: string[]
  loading: boolean
  isEditing: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  startEdit: []
  cancelEdit: []
  save: []
  'update:selectedIds': [value: string[]]
}>()
</script>

<template>
  <section class="rounded-lg border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800">
    <div class="p-6">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Linked Wiki Pages</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Permanent links from this chapter to related wiki pages.
          </p>
        </div>
        <button
          v-if="!isEditing"
          type="button"
          class="text-xs font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          @click="emit('startEdit')"
        >
          {{ links.length ? 'Edit links' : 'Add links' }}
        </button>
      </div>

      <div v-if="loading" class="mt-4 text-sm text-gray-500 dark:text-gray-400">
        Loading links...
      </div>

      <div v-else-if="isEditing" class="mt-4 space-y-3">
        <AutocompleteMultiSelect
          :options="options"
          :selected-ids="selectedIds"
          :disabled="saving"
          placeholder="Link a wiki page..."
          empty-message="No wiki pages match this search."
          @update:selected-ids="emit('update:selectedIds', $event)"
        />
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="saving"
            @click="emit('save')"
          >
            {{ saving ? 'Saving...' : 'Save links' }}
          </button>
          <button
            type="button"
            class="text-sm font-medium text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
            :disabled="saving"
            @click="emit('cancelEdit')"
          >
            Cancel
          </button>
        </div>
      </div>

      <div v-else-if="links.length" class="mt-4 space-y-2">
        <RouterLink
          v-for="link in links"
          :key="link.wiki_page_id"
          :to="{
            path: `${routePrefix}/${bookId}/wiki/${link.wiki_page_id}`,
            query: { fromChapterId: chapterId },
          }"
          class="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
        >
          <div class="min-w-0">
            <div class="truncate font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 dark:text-blue-200">
              {{ link.page_name }}
            </div>
            <div class="mt-0.5 text-xs capitalize text-blue-500 dark:text-blue-300">
              {{ link.page_type }} wiki page
            </div>
          </div>
          <span class="ml-3 shrink-0 text-xs font-medium text-blue-600 dark:text-blue-300">
            Open
          </span>
        </RouterLink>
      </div>

      <p v-else class="mt-4 text-sm text-gray-500 dark:text-gray-400">
        No linked wiki pages yet.
      </p>
    </div>
  </section>
</template>
