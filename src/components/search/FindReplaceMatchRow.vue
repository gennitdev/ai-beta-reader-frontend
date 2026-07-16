<script setup lang="ts">
import type { TextMatch } from '@/lib/findReplace'

interface Props {
  match: TextMatch
  selected: boolean
  replacing: boolean
  replacementReady: boolean
  disabled?: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  toggle: [selected: boolean]
  replace: []
}>()

const fieldLabels: Record<TextMatch['field'], string> = {
  title: 'Title',
  text: 'Chapter content',
  page_name: 'Page name',
  summary: 'Summary',
  content: 'Content',
}
</script>

<template>
  <div class="flex items-start gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700">
    <input
      :checked="selected"
      :disabled="disabled"
      type="checkbox"
      class="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
      :aria-label="`Select match in ${fieldLabels[match.field]}`"
      @change="emit('toggle', ($event.target as HTMLInputElement).checked)"
    />

    <div class="min-w-0 flex-1">
      <div class="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ fieldLabels[match.field] }}
      </div>
      <p class="whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">
        <span>{{ match.before }}</span><mark class="rounded bg-yellow-200 px-0.5 text-gray-900 dark:bg-yellow-800 dark:text-gray-100">{{ match.matchedText }}</mark><span>{{ match.after }}</span>
      </p>
    </div>

    <button
      v-if="replacementReady"
      type="button"
      :disabled="disabled"
      class="shrink-0 rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      @click="emit('replace')"
    >
      {{ replacing ? 'Replacing…' : 'Replace' }}
    </button>
  </div>
</template>
