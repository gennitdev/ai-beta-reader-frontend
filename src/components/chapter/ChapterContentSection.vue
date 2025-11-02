<script setup lang="ts">
import { ref, watch, onUnmounted, type PropType } from 'vue'
import TextEditor from '@/components/TextEditor.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/vue/24/outline'

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

const isFullscreen = ref(false)
let previousBodyOverflow: string | null = null

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    isFullscreen.value = false
  }
}

const enableFullscreenEffects = () => {
  if (typeof document === 'undefined') return
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown)
  }
}

const disableFullscreenEffects = () => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = previousBodyOverflow ?? ''
  previousBodyOverflow = null
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown)
  }
}

watch(isFullscreen, (value) => {
  if (value) {
    enableFullscreenEffects()
  } else {
    disableFullscreenEffects()
  }
})

onUnmounted(() => {
  if (isFullscreen.value) {
    disableFullscreenEffects()
  }
})
</script>

<template>
  <div class="relative py-4 ">
    <div class="flex justify-between">


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
      <button
        v-if="!isEditing"
        type="button"
        class="h-10 float-right z-10 inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
        @click.stop="isFullscreen = true"
      >
        <ArrowsPointingOutIcon class="h-4 w-4" />
        <span class="hidden sm:inline">Fullscreen</span>
        <span class="sr-only">Enter fullscreen reading mode</span>
      </button>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="isFullscreen"
      class="fixed inset-0 z-50"
    >
      <div
        class="absolute inset-0 bg-gray-900/80 backdrop-blur-sm"
        @click="isFullscreen = false"
      ></div>
      <div class="relative z-10 flex h-full flex-col">
        <div
          class="flex-1 overflow-y-auto px-4 py-8 sm:px-8"
          @click="isFullscreen = false"
        >
          <div
            class="mx-auto max-w-4xl"
            @click.stop
          >
            <div class="relative rounded-lg bg-white p-6 shadow-2xl dark:bg-gray-900">
              <button
                type="button"
                class="absolute right-4 top-4 inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
                @click.stop="isFullscreen = false"
              >
                <ArrowsPointingInIcon class="h-4 w-4" />
                <span class="hidden sm:inline">Exit fullscreen</span>
                <span class="sr-only">Exit fullscreen reading mode</span>
              </button>
              <div class="prose prose-lg max-w-none dark:prose-invert">
                <MarkdownRenderer :text="chapterText" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
