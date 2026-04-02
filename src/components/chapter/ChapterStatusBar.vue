<script setup lang="ts">
import { CheckCircleIcon, DocumentTextIcon, PhotoIcon } from "@heroicons/vue/24/outline";

defineProps<{
  wordCount: number;
  hasSummary: boolean;
  hasNotes: boolean;
  showSummaryPanel: boolean;
  showNotesPanel: boolean;
  hasIllustrations?: boolean;
  showIllustrationsPanel?: boolean;
  desktopImagesAvailable?: boolean;
}>();

const emit = defineEmits<{
  'toggle-summary-panel': [];
  'toggle-notes-panel': [];
  'toggle-illustrations-panel': [];
}>();
</script>

<template>
  <div class="my-3 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
    <span class="whitespace-nowrap">{{ wordCount.toLocaleString() }} words</span>
    <div class="flex items-center whitespace-nowrap">
      <CheckCircleIcon
        :class="hasSummary ? 'text-green-500' : 'text-gray-300'"
        class="mr-1 h-4 w-4"
      />
      <span :class="hasSummary ? 'text-green-600' : 'text-gray-500'">
        {{ hasSummary ? "Summarized" : "Not summarized" }}
      </span>
    </div>
    <div class="flex items-center whitespace-nowrap">
      <DocumentTextIcon
        :class="hasNotes ? 'text-purple-500' : 'text-gray-300'"
        class="mr-1 h-4 w-4"
      />
      <span :class="hasNotes ? 'text-purple-600' : 'text-gray-500'">
        {{ hasNotes ? "Has Notes" : "No Notes" }}
      </span>
    </div>
    <button
      @click="emit('toggle-summary-panel')"
      class="font-medium text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
    >
      {{ showSummaryPanel ? "Hide Summary Panel" : "Show Summary Panel" }}
    </button>
    <button
      @click="emit('toggle-notes-panel')"
      class="font-medium text-purple-600 transition-colors hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
    >
      {{ showNotesPanel ? "Hide Notes Panel" : "Show Notes Panel" }}
    </button>
    <button
      v-if="desktopImagesAvailable"
      @click="emit('toggle-illustrations-panel')"
      class="font-medium text-emerald-600 transition-colors hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
    >
      {{ showIllustrationsPanel ? "Hide Illustrations" : "Show Illustrations" }}
    </button>
  </div>
</template>
