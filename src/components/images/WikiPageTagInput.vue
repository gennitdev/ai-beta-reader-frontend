<script setup lang="ts">
import { computed, ref } from 'vue'
import { XMarkIcon } from '@heroicons/vue/20/solid'

export interface WikiPageOption {
  id: string
  page_name: string
  page_type?: string | null
}

const props = defineProps<{
  wikiPages: WikiPageOption[]
  selectedIds: string[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:selectedIds': [value: string[]]
}>()

const query = ref('')
const isFocused = ref(false)

const selectedPages = computed(() =>
  props.selectedIds
    .map((id) => props.wikiPages.find((page) => page.id === id))
    .filter((page): page is WikiPageOption => Boolean(page))
)

const availablePages = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase()
  return props.wikiPages
    .filter((page) => !props.selectedIds.includes(page.id))
    .filter((page) => !normalizedQuery || page.page_name.toLowerCase().includes(normalizedQuery))
    .slice(0, 8)
})

const showSuggestions = computed(() => isFocused.value && availablePages.value.length > 0)

function addPage(page: WikiPageOption) {
  if (props.disabled || props.selectedIds.includes(page.id)) return
  emit('update:selectedIds', [...props.selectedIds, page.id])
  query.value = ''
}

function removePage(pageId: string) {
  if (props.disabled) return
  emit('update:selectedIds', props.selectedIds.filter((id) => id !== pageId))
}

function handleEnter() {
  const firstPage = availablePages.value[0]
  if (firstPage) addPage(firstPage)
}

function handleBlur() {
  window.setTimeout(() => {
    isFocused.value = false
  }, 120)
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="selectedPages.length" class="flex flex-wrap gap-2">
      <span
        v-for="page in selectedPages"
        :key="page.id"
        class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:ring-blue-700"
      >
        {{ page.page_name }}
        <button
          type="button"
          class="rounded-full text-blue-500 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-60 dark:text-blue-200 dark:hover:text-white"
          :disabled="disabled"
          :aria-label="`Remove ${page.page_name}`"
          @click="removePage(page.id)"
        >
          <XMarkIcon class="h-3.5 w-3.5" />
        </button>
      </span>
    </div>

    <div class="relative">
      <input
        v-model="query"
        type="text"
        class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:disabled:bg-gray-800/60"
        placeholder="Tag a wiki page..."
        :disabled="disabled"
        @focus="isFocused = true"
        @blur="handleBlur"
        @keydown.enter.prevent="handleEnter"
      />
      <div
        v-if="showSuggestions"
        class="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
      >
        <button
          v-for="page in availablePages"
          :key="page.id"
          type="button"
          class="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
          @mousedown.prevent="addPage(page)"
        >
          <span>{{ page.page_name }}</span>
          <span v-if="page.page_type" class="text-xs capitalize text-gray-400 dark:text-gray-500">
            {{ page.page_type }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
