<script setup lang="ts">
import { computed } from 'vue'
import AutocompleteMultiSelect, {
  type AutocompleteOption,
} from '@/components/links/AutocompleteMultiSelect.vue'
import type { ChapterWikiLink } from '@/lib/database'

const props = defineProps<{
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

const groupedLinks = computed(() => {
  const groups = new Map<string, ChapterWikiLink[]>()
  const typeLabels: Record<string, string> = {
    character: 'Characters',
    location: 'Locations',
    concept: 'Concepts',
    other: 'Other',
  }

  for (const link of props.links) {
    const group = groups.get(link.page_type) ?? []
    group.push(link)
    groups.set(link.page_type, group)
  }

  return ['character', 'location', 'concept', 'other']
    .map((type) => ({
      type,
      label: typeLabels[type] ?? 'Other',
      links: groups.get(type) ?? [],
    }))
    .filter((group) => group.links.length > 0)
})

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
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Linked Wiki Pages</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Permanent links from this chapter to related wiki pages.
          </p>
        </div>
        <button
          v-if="!isEditing && links.length"
          type="button"
          class="text-xs font-medium text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          @click="emit('startEdit')"
        >
          Edit links
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

      <div v-else-if="links.length" class="mt-4 space-y-4">
        <div
          v-for="group in groupedLinks"
          :key="group.type"
          class="space-y-2"
        >
          <h4 class="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
            {{ group.label }}
          </h4>
          <RouterLink
            v-for="link in group.links"
            :key="link.wiki_page_id"
            :to="{
              path: `${routePrefix}/${bookId}/wiki/${link.wiki_page_id}`,
              query: { fromChapterId: chapterId },
            }"
            class="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-left text-sm transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:hover:bg-blue-900/40"
          >
            <div class="min-w-0 truncate font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 dark:text-blue-200">
              {{ link.page_name }}
            </div>
            <span class="ml-3 shrink-0 text-xs font-medium text-blue-600 dark:text-blue-300">
              Open
            </span>
          </RouterLink>
        </div>
      </div>

      <p v-else class="mt-4 text-sm text-gray-500 dark:text-gray-400">
        No linked wiki pages yet.
      </p>

      <button
        v-if="!isEditing && !links.length"
        type="button"
        class="mt-5 block w-full border-t border-gray-200 pt-4 text-left text-xs font-medium text-blue-600 transition-colors hover:text-blue-700 dark:border-gray-700 dark:text-blue-400 dark:hover:text-blue-300"
        @click="emit('startEdit')"
      >
        Add links
      </button>
    </div>
  </section>
</template>
