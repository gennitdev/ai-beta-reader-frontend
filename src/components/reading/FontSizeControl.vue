<script setup lang="ts">
import type { ReadingFontSize } from '@/composables/useReadingFontSize'

defineProps<{
  modelValue: ReadingFontSize
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReadingFontSize): void
}>()

const options: { key: ReadingFontSize; label: string; sizeClass: string }[] = [
  { key: 'small', label: 'A', sizeClass: 'text-xs' },
  { key: 'medium', label: 'A', sizeClass: 'text-base' },
  { key: 'large', label: 'A', sizeClass: 'text-xl' },
]
</script>

<template>
  <div
    class="rounded-lg border border-gray-200 bg-white p-4 shadow-md dark:border-gray-700 dark:bg-gray-800"
  >
    <h3 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Text size</h3>
    <div
      class="inline-flex w-full overflow-hidden rounded-md border border-gray-300 dark:border-gray-600"
      role="group"
      aria-label="Reading text size"
    >
      <button
        v-for="option in options"
        :key="option.key"
        type="button"
        class="flex flex-1 items-center justify-center py-1.5 leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        :class="[
          option.sizeClass,
          modelValue === option.key
            ? 'bg-blue-600 font-semibold text-white'
            : 'bg-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
        ]"
        :aria-pressed="modelValue === option.key"
        :title="option.key.charAt(0).toUpperCase() + option.key.slice(1)"
        @click="emit('update:modelValue', option.key)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
