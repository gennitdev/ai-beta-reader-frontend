<script setup lang="ts">
import type { PropType } from 'vue'
import TextEditor from '@/components/TextEditor.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

const props = defineProps({
  isEditing: {
    type: Boolean,
    default: false,
  },
  editedText: {
    type: String,
    default: '',
  },
  chapterText: {
    type: String,
    default: '',
  },
  showFullChapterText: {
    type: Boolean,
    default: false,
  },
  truncatedChapterText: {
    type: Object as PropType<{ truncated: string; needsTruncation: boolean }>,
    required: true,
  },
  maxLength: {
    type: Number,
    default: 50000,
  },
})

const emit = defineEmits<{
  (e: 'update:editedText', value: string): void
  (e: 'toggle-full-chapter', value: boolean): void
}>()

const toggleFullChapter = (value: boolean) => {
  emit('toggle-full-chapter', value)
}
</script>

<template>
  <div class="rounded-lg border border-gray-200 bg-white shadow-md dark:border-gray-700 dark:bg-gray-800">
    <div class="p-6">
      <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Chapter Text</h2>

      <div v-if="isEditing">
        <TextEditor
          :model-value="editedText"
          :max-length="maxLength"
          placeholder="Write your chapter content here..."
          height="500px"
          @update:modelValue="emit('update:editedText', $event)"
        />
      </div>

      <div v-else class="prose prose-gray max-w-none dark:prose-invert">
        <template v-if="!showFullChapterText && truncatedChapterText.needsTruncation">
          <MarkdownRenderer :text="truncatedChapterText.truncated" />
          <div class="not-prose">
            <span class="text-gray-500">...</span>
            <button
              @click="toggleFullChapter(true)"
              class="ml-2 inline-flex items-center px-3 py-1 text-sm font-medium text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Show more
            </button>
          </div>
        </template>
        <template v-else>
          <MarkdownRenderer :text="chapterText" />
          <div v-if="truncatedChapterText.needsTruncation" class="not-prose">
            <button
              @click="toggleFullChapter(false)"
              class="mt-3 inline-flex items-center px-3 py-1 text-sm font-medium text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Show less
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
