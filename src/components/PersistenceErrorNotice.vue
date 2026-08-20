<script setup lang="ts">
defineProps<{
  message: string
  retrying: boolean
}>()

defineEmits<{
  retry: []
}>()
</script>

<template>
  <div
    role="alert"
    class="flex items-center justify-between gap-4 border-b border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-100"
  >
    <p>{{ message }}</p>
    <button
      type="button"
      class="shrink-0 font-medium underline disabled:cursor-wait disabled:opacity-60"
      :disabled="retrying"
      @click="$emit('retry')"
    >
      {{ retrying ? 'Retrying…' : 'Retry saving' }}
    </button>
  </div>
</template>
