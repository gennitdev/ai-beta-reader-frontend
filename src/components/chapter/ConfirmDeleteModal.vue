<script setup lang="ts">
defineProps<{
  show: boolean;
  title: string;
  itemName: string;
  description?: string;
  deleting: boolean;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();
</script>

<template>
  <teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div class="absolute inset-0 bg-gray-900/70" @click="emit('cancel')"></div>
      <div
        class="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
      >
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{{ title }}</h2>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
          <slot>
            This will permanently delete
            <span class="font-medium text-gray-900 dark:text-gray-200">
              {{ itemName }}
            </span>.
            {{ description || 'This action cannot be undone.' }}
          </slot>
        </p>
        <div class="mt-6 flex justify-end space-x-3">
          <button
            @click="emit('cancel')"
            :disabled="deleting"
            class="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            @click="emit('confirm')"
            :disabled="deleting"
            class="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span
              v-if="deleting"
              class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
            ></span>
            Delete
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>
