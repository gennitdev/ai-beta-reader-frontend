<script setup lang="ts">
import { computed, ref } from 'vue'
import { XMarkIcon } from '@heroicons/vue/20/solid'

export interface AutocompleteOption {
  id: string
  label: string
  detail?: string | null
}

const props = defineProps<{
  options: AutocompleteOption[]
  selectedIds: string[]
  placeholder?: string
  emptyMessage?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:selectedIds': [value: string[]]
}>()

const query = ref('')
const isFocused = ref(false)

const selectedOptions = computed(() =>
  props.selectedIds
    .map((id) => props.options.find((option) => option.id === id))
    .filter((option): option is AutocompleteOption => Boolean(option))
)

const availableOptions = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase()
  return props.options
    .filter((option) => !props.selectedIds.includes(option.id))
    .filter((option) => {
      if (!normalizedQuery) return true
      return (
        option.label.toLowerCase().includes(normalizedQuery) ||
        (option.detail || '').toLowerCase().includes(normalizedQuery)
      )
    })
    .slice(0, 8)
})

const showSuggestions = computed(() => isFocused.value)

function addOption(option: AutocompleteOption) {
  if (props.disabled || props.selectedIds.includes(option.id)) return
  emit('update:selectedIds', [...props.selectedIds, option.id])
  query.value = ''
}

function removeOption(optionId: string) {
  if (props.disabled) return
  emit('update:selectedIds', props.selectedIds.filter((id) => id !== optionId))
}

function handleEnter() {
  const firstOption = availableOptions.value[0]
  if (firstOption) addOption(firstOption)
}

function handleBlur() {
  window.setTimeout(() => {
    isFocused.value = false
  }, 120)
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="selectedOptions.length" class="flex flex-wrap gap-2">
      <span
        v-for="option in selectedOptions"
        :key="option.id"
        class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:ring-blue-700"
      >
        <span>{{ option.label }}</span>
        <span v-if="option.detail" class="text-[11px] text-blue-500 dark:text-blue-300">
          {{ option.detail }}
        </span>
        <button
          type="button"
          class="rounded-full text-blue-500 hover:text-blue-800 disabled:cursor-not-allowed disabled:opacity-60 dark:text-blue-200 dark:hover:text-white"
          :disabled="disabled"
          :aria-label="`Remove ${option.label}`"
          @click="removeOption(option.id)"
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
        :placeholder="placeholder || 'Add a link...'"
        :disabled="disabled"
        @focus="isFocused = true"
        @blur="handleBlur"
        @keydown.enter.prevent="handleEnter"
      />
      <div
        v-if="showSuggestions"
        class="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
      >
        <div
          v-if="availableOptions.length === 0"
          class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400"
        >
          {{ emptyMessage || 'No matches found.' }}
        </div>
        <button
          v-for="option in availableOptions"
          :key="option.id"
          type="button"
          class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
          @mousedown.prevent="addOption(option)"
        >
          <span class="truncate">{{ option.label }}</span>
          <span v-if="option.detail" class="shrink-0 text-xs text-gray-400 dark:text-gray-500">
            {{ option.detail }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
