<script setup lang="ts">
import { PencilIcon, DocumentTextIcon } from '@heroicons/vue/24/outline'
import TextEditor from '@/components/TextEditor.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

const props = defineProps({
  chapterNotes: {
    type: String,
    default: '',
  },
  isEditingNotes: {
    type: Boolean,
    default: false,
  },
  editedNotes: {
    type: String,
    default: '',
  },
  savingNotes: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits<{
  (e: 'update:editedNotes', value: string): void
  (e: 'start-edit'): void
  (e: 'cancel-edit'): void
  (e: 'save'): void
}>()
</script>

<template>
  <div class="py-4">
    <div>
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Chapter Notes</h3>
        <div class="flex items-center space-x-2">
          <button
            v-if="chapterNotes && !isEditingNotes"
            @click="emit('start-edit')"
            class="inline-flex items-center px-2 py-1 text-xs text-purple-600 transition-colors hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
            title="Edit notes"
          >
            <PencilIcon class="mr-1 h-3 w-3" />
            Edit
          </button>
          <button
            v-if="!chapterNotes && !isEditingNotes"
            @click="emit('start-edit')"
            class="inline-flex items-center rounded-md bg-purple-600 px-3 py-1 text-sm text-white transition-colors hover:bg-purple-700"
          >
            <DocumentTextIcon class="mr-1 h-4 w-4" />
            Add Notes
          </button>
        </div>
      </div>

      <template v-if="isEditingNotes">
        <div class="space-y-4">
          <TextEditor
            :model-value="editedNotes"
            @update:model-value="emit('update:editedNotes', $event)"
            placeholder="Write your notes for this chapter..."
            height="300px"
          />
          <div class="flex items-center justify-end space-x-2">
            <button
              @click="emit('cancel-edit')"
              class="px-3 py-1 text-sm text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
            >
              Cancel
            </button>
            <button
              @click="emit('save')"
              :disabled="savingNotes"
              class="inline-flex items-center rounded bg-purple-600 px-3 py-1 text-sm text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                v-if="savingNotes"
                class="mr-1 h-3 w-3 animate-spin rounded-full border border-white border-t-transparent"
              ></span>
              {{ savingNotes ? 'Saving...' : 'Save Notes' }}
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="chapterNotes">
        <div class="prose prose-sm dark:prose-invert max-w-none">
          <MarkdownRenderer :text="chapterNotes" class="text-gray-700 dark:text-gray-300" />
        </div>
      </template>

      <div v-else class="py-4 text-center text-gray-500 dark:text-gray-400">
        <DocumentTextIcon class="mx-auto mb-2 h-8 w-8 text-gray-300" />
        <p class="text-sm">Add notes for this chapter to track ideas, reminders, or research.</p>
      </div>
    </div>
  </div>
</template>
