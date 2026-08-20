<script setup lang="ts">
import { computed } from 'vue'
import type { ReadingFontFamily, ReadingFontSize } from '@/composables/useReadingFontSize'

const props = withDefaults(
  defineProps<{
    modelValue: ReadingFontSize
    fontFamily: ReadingFontFamily
    /**
     * 'card'  — matches sidebar info cards (rounded-lg, gray-800, shadow).
     * 'panel' — matches the chapter illustration panel (rounded-xl, no
     *           shadow, extra top padding).
     */
    variant?: 'card' | 'panel'
  }>(),
  { variant: 'card', fontFamily: 'system' }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: ReadingFontSize): void
  (e: 'update:fontFamily', value: ReadingFontFamily): void
}>()

const containerClass = computed(() =>
  props.variant === 'panel'
    ? 'rounded-xl border border-gray-200 bg-white p-4 pt-5 dark:border-gray-700 dark:bg-navy-800'
    : 'rounded-lg border border-gray-200 bg-white p-4 shadow-md dark:border-gray-700 dark:bg-navy-800'
)

const options: { key: ReadingFontSize; label: string; sizeClass: string }[] = [
  { key: 'small', label: 'A', sizeClass: 'text-xs' },
  { key: 'medium', label: 'A', sizeClass: 'text-base' },
  { key: 'large', label: 'A', sizeClass: 'text-xl' },
]

const fontOptions: { key: ReadingFontFamily; label: string }[] = [
  { key: 'system', label: 'System Sans' },
  { key: 'atkinson', label: 'Atkinson Hyperlegible' },
  { key: 'serif', label: 'Georgia Serif' },
  { key: 'literata', label: 'Literata' },
  { key: 'source-serif', label: 'Source Serif 4' },
  { key: 'lora', label: 'Lora' },
  { key: 'opendyslexic', label: 'OpenDyslexic' },
]
</script>

<template>
  <div :class="containerClass">
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
        class="flex flex-1 items-center justify-center py-1.5 leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-500"
        :class="[
          option.sizeClass,
          modelValue === option.key
            ? 'bg-gold-600 font-semibold text-white'
            : 'bg-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
        ]"
        :aria-pressed="modelValue === option.key"
        :title="option.key.charAt(0).toUpperCase() + option.key.slice(1)"
        @click="emit('update:modelValue', option.key)"
      >
        {{ option.label }}
      </button>
    </div>

    <label class="mt-4 block">
      <span class="mb-2 block text-xs font-medium text-gray-500 dark:text-gray-400">Text font</span>
      <select
        :value="fontFamily"
        class="w-full rounded-md border-gray-300 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-gold-500 focus:ring-gold-500 dark:border-gray-600 dark:bg-navy-900 dark:text-gray-200"
        aria-label="Reading text font"
        @change="emit('update:fontFamily', ($event.target as HTMLSelectElement).value as ReadingFontFamily)"
      >
        <option v-for="option in fontOptions" :key="option.key" :value="option.key">
          {{ option.label }}
        </option>
      </select>
    </label>
  </div>
</template>
