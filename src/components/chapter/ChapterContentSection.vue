<script setup lang="ts">
import type { PropType } from "vue";
import TextEditor from "@/components/TextEditor.vue";
import MarkdownRenderer from "@/components/MarkdownRenderer.vue";

defineProps({
  isEditing: {
    type: Boolean,
    default: false,
  },
  editedText: {
    type: String,
    default: "",
  },
  chapterText: {
    type: String,
    default: "",
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
  fontSize: {
    type: String,
    default: "medium",
  },
  fontFamily: {
    type: String,
    default: "system",
  },
});

const emit = defineEmits<{
  (e: "update:editedText", value: string): void;
  (e: "toggle-full-chapter", value: boolean): void;
}>();

const toggleFullChapter = (value: boolean) => {
  emit("toggle-full-chapter", value);
};
</script>

<template>
  <div class="relative w-full">
    <div class="flex w-full">
      <div v-if="isEditing" class="w-full">
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
          <MarkdownRenderer :text="truncatedChapterText.truncated" :font-size="fontSize" :font-family="fontFamily" reading-layout />
          <div class="not-prose">
            <span class="text-gray-500">...</span>
            <button
              @click="toggleFullChapter(true)"
              class="ml-2 inline-flex items-center px-3 py-1 text-sm font-medium text-gold-600 transition-colors hover:text-gold-800 dark:text-gold-400 dark:hover:text-gold-300"
            >
              Show more
            </button>
          </div>
        </template>
        <template v-else>
          <MarkdownRenderer :text="chapterText" :font-size="fontSize" :font-family="fontFamily" reading-layout />
          <div v-if="truncatedChapterText.needsTruncation" class="not-prose">
            <button
              @click="toggleFullChapter(false)"
              class="mt-3 inline-flex items-center px-3 py-1 text-sm font-medium text-gold-600 transition-colors hover:text-gold-800 dark:text-gold-400 dark:hover:text-gold-300"
            >
              Show less
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
