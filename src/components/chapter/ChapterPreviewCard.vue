<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  content?: string
  expanded?: boolean
  previewWordCount?: number
}>(), {
  content: '',
  expanded: false,
  previewWordCount: 24,
})

const emit = defineEmits<{
  'toggle-expanded': []
}>()

const preview = computed(() => {
  const plainText = props.content
    .replace(/[`*_#>\[\]()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = plainText.split(' ').filter(Boolean)
  const truncated = words.slice(0, props.previewWordCount).join(' ')
  return words.length > props.previewWordCount ? `${truncated}…` : truncated
})

const showPreview = computed(() => Boolean(props.content) && !props.expanded)
</script>

<template>
  <section
    class="rounded-xl border border-gray-200 bg-white p-4 pt-5 dark:border-gray-700 dark:bg-navy-800"
    :aria-label="title"
  >
    <template v-if="showPreview">
      <h3 class="text-sm font-semibold text-gray-900 dark:text-white">{{ title }}</h3>
      <p class="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
        {{ preview }}
      </p>
      <button
        type="button"
        class="mt-3 text-sm font-medium text-gold-600 transition-colors hover:text-gold-800 dark:text-gold-400 dark:hover:text-gold-300"
        @click="emit('toggle-expanded')"
      >
        Show all
      </button>
    </template>

    <template v-else>
      <slot />
      <button
        v-if="content && expanded"
        type="button"
        class="mt-2 text-sm font-medium text-gold-600 transition-colors hover:text-gold-800 dark:text-gold-400 dark:hover:text-gold-300"
        @click="emit('toggle-expanded')"
      >
        Show less
      </button>
    </template>
  </section>
</template>
