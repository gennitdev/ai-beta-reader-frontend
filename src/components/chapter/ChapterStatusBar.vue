<script setup lang="ts">
import { computed } from "vue";
import {
  Bars3BottomLeftIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/vue/24/outline";
import ChapterReadingActions from "@/components/chapter/ChapterReadingActions.vue";

withDefaults(
  defineProps<{
    wordCount: number;
    hasSummary: boolean;
    hasNotes: boolean;
    chapterText?: string;
    fontSize?: string;
    fontFamily?: string;
    isEditing?: boolean;
    savingChapter?: boolean;
    hasUnsavedChanges?: boolean;
  }>(),
  {
    chapterText: "",
    fontSize: "medium",
    fontFamily: "system",
    isEditing: false,
    savingChapter: false,
    hasUnsavedChanges: false,
  },
);

const emit = defineEmits<{
  "start-edit": [];
  "cancel-edit": [];
  "save-chapter": [];
  "delete-chapter": [];
}>();

const actionClass = computed(() =>
  "flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
);
</script>

<template>
  <section
    class="rounded-xl border border-gray-200 bg-white p-4 pt-5 text-sm dark:border-gray-700 dark:bg-navy-800"
    aria-label="Chapter tools"
  >
    <h3 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
      Chapter tools
    </h3>

    <div class="space-y-2 text-gray-600 dark:text-gray-400">
      <div class="flex items-center whitespace-nowrap">
        <Bars3BottomLeftIcon class="mr-2 h-4 w-4 text-gray-400" />
        <span>{{ wordCount.toLocaleString() }} words</span>
      </div>
      <div class="flex items-center whitespace-nowrap">
        <CheckCircleIcon
          class="h-4 w-4"
          :class="[hasSummary ? 'text-green-500' : 'text-gray-300', 'mr-2']"
        />
        <span :class="hasSummary ? 'text-green-600' : 'text-gray-500'">
          {{ hasSummary ? "Summarized" : "Not summarized" }}
        </span>
      </div>
      <div class="flex items-center whitespace-nowrap">
        <DocumentTextIcon
          class="h-4 w-4"
          :class="[hasNotes ? 'text-purple-500' : 'text-gray-300', 'mr-2']"
        />
        <span :class="hasNotes ? 'text-purple-600' : 'text-gray-500'">
          {{ hasNotes ? "Has Notes" : "No Notes" }}
        </span>
      </div>
    </div>

    <div class="my-4 border-t border-gray-200 dark:border-gray-700"></div>

    <div class="space-y-2">
      <ChapterReadingActions
        v-if="!isEditing"
        :chapter-text="chapterText"
        :font-size="fontSize"
        :font-family="fontFamily"
      />

      <button
        v-if="!isEditing"
        type="button"
        :class="[actionClass, 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700/60 dark:hover:text-white']"
        @click="emit('start-edit')"
      >
        <PencilSquareIcon class="h-4 w-4 shrink-0" />
        Edit Chapter
      </button>

      <button
        v-if="isEditing"
        type="button"
        :class="[actionClass, 'border-gold-600 bg-gold-600 text-white hover:bg-gold-700']"
        :disabled="savingChapter || !hasUnsavedChanges"
        @click="emit('save-chapter')"
      >
        <CheckIcon class="h-4 w-4 shrink-0" />
        {{ savingChapter ? "Saving..." : "Save Chapter" }}
      </button>

      <button
        v-if="isEditing"
        type="button"
        :class="[actionClass, 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700/60 dark:hover:text-white']"
        :disabled="savingChapter"
        @click="emit('cancel-edit')"
      >
        <XMarkIcon class="h-4 w-4 shrink-0" />
        Cancel Editing
      </button>

      <button
        type="button"
        :class="[actionClass, 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700/60 dark:hover:text-white']"
        :disabled="savingChapter"
        @click="emit('delete-chapter')"
      >
        <TrashIcon class="h-4 w-4 shrink-0" />
        Delete chapter
      </button>
    </div>
  </section>
</template>
