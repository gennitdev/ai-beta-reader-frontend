<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { BookDeletionPreview } from '@/lib/database'

const props = defineProps<{
  show: boolean
  preview: BookDeletionPreview | null
  deleting: boolean
  error: string | null
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const confirmation = ref('')
const confirmationInput = ref<HTMLInputElement | null>(null)
const canConfirm = computed(
  () => Boolean(props.preview) && confirmation.value === props.preview?.title && !props.deleting,
)

watch(() => props.show, async (show) => {
  confirmation.value = ''
  if (show) {
    await nextTick()
    confirmationInput.value?.focus()
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-navy-900/75" @click="!deleting && emit('cancel')"></div>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-book-title"
        class="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl dark:bg-navy-800"
      >
        <h2 id="delete-book-title" class="text-xl font-semibold text-gray-900 dark:text-white">
          Delete “{{ preview?.title }}”?
        </h2>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
          This permanently deletes the book and everything stored inside it. This action cannot be undone.
        </p>
        <ul v-if="preview" class="mt-4 grid grid-cols-2 gap-2 text-sm text-gray-700 dark:text-gray-200">
          <li class="rounded-lg bg-gray-100 px-3 py-2 dark:bg-gray-700">{{ preview.chapterCount }} chapters</li>
          <li class="rounded-lg bg-gray-100 px-3 py-2 dark:bg-gray-700">{{ preview.partCount }} parts</li>
          <li class="rounded-lg bg-gray-100 px-3 py-2 dark:bg-gray-700">{{ preview.wikiPageCount }} wiki pages</li>
          <li class="rounded-lg bg-gray-100 px-3 py-2 dark:bg-gray-700">{{ preview.imageCount }} images</li>
        </ul>
        <label for="delete-book-confirmation" class="mt-5 block text-sm font-medium text-gray-800 dark:text-gray-200">
          Type <span class="font-semibold">{{ preview?.title }}</span> to confirm
        </label>
        <input
          id="delete-book-confirmation"
          ref="confirmationInput"
          v-model="confirmation"
          :disabled="deleting"
          autocomplete="off"
          class="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          @keyup.enter="canConfirm && emit('confirm')"
        />
        <p v-if="error" role="alert" class="mt-3 text-sm text-red-600 dark:text-red-400">{{ error }}</p>
        <div class="mt-6 flex justify-end gap-3">
          <button
            type="button"
            :disabled="deleting"
            class="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="!canConfirm"
            class="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            @click="emit('confirm')"
          >
            <span v-if="deleting" class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
            Delete book
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
