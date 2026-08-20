<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import { copyToClipboardWithResult } from '@/utils/clipboard'
import { isNativeMobileRuntime } from '@/utils/platform'
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  CheckIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
} from '@heroicons/vue/24/outline'

const props = withDefaults(defineProps<{
  chapterText?: string
  fontSize?: string
  fontFamily?: string
}>(), {
  chapterText: '',
  fontSize: 'medium',
  fontFamily: 'system',
})

const isFullscreen = ref(false)
const chapterCopied = ref(false)
const chapterCopyWarning = ref(false)
let previousBodyOverflow: string | null = null
let chapterCopyTimeout: ReturnType<typeof setTimeout> | null = null

const MOBILE_WORD_LIMIT = 3500

const countWords = (text: string): number => {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') isFullscreen.value = false
}

const resetChapterCopyState = () => {
  if (chapterCopyTimeout) {
    clearTimeout(chapterCopyTimeout)
    chapterCopyTimeout = null
  }
  chapterCopied.value = false
  chapterCopyWarning.value = false
}

const copyChapterToClipboard = async () => {
  if (!props.chapterText) return

  try {
    resetChapterCopyState()
    const result = await copyToClipboardWithResult(props.chapterText)
    if (!result.success) {
      console.error('Failed to copy chapter text')
      return
    }

    chapterCopied.value = true
    const wordCount = countWords(props.chapterText)
    if (
      isNativeMobileRuntime()
      && (result.likelyTruncated || (!result.verified && wordCount > MOBILE_WORD_LIMIT))
    ) {
      chapterCopyWarning.value = true
    }

    chapterCopyTimeout = setTimeout(() => {
      resetChapterCopyState()
    }, chapterCopyWarning.value ? 5000 : 2000)
  } catch (error) {
    console.error('Failed to copy chapter text:', error)
  }
}

const enableFullscreenEffects = () => {
  if (typeof document === 'undefined') return
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', handleKeydown)
}

const disableFullscreenEffects = () => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = previousBodyOverflow ?? ''
  previousBodyOverflow = null
  window.removeEventListener('keydown', handleKeydown)
}

watch(isFullscreen, (value) => {
  if (value) enableFullscreenEffects()
  else disableFullscreenEffects()
})

onUnmounted(() => {
  if (isFullscreen.value) disableFullscreenEffects()
  resetChapterCopyState()
})
</script>

<template>
  <div>
    <div class="space-y-2">
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2"
          :class="chapterCopyWarning
            ? 'border-amber-400 text-amber-600 dark:border-amber-500 dark:text-amber-400'
            : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700/60 dark:hover:text-white'"
          :disabled="!chapterText"
          @click="copyChapterToClipboard"
        >
          <component
            :is="chapterCopyWarning ? ExclamationTriangleIcon : (chapterCopied ? CheckIcon : DocumentDuplicateIcon)"
            class="h-4 w-4 shrink-0"
          />
          <span v-if="chapterCopyWarning">Chapter text may be truncated</span>
          <span v-else-if="chapterCopied">Chapter text copied</span>
          <span v-else>Copy chapter text</span>
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md border border-gray-300 px-3 py-2.5 text-left text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-700/60 dark:hover:text-white"
          @click="isFullscreen = true"
        >
          <ArrowsPointingOutIcon class="h-4 w-4 shrink-0" />
          Fullscreen reading
        </button>
    </div>

    <Teleport to="body">
      <div v-if="isFullscreen" class="fixed inset-0 z-50">
        <div
          class="absolute inset-0 bg-navy-900/80 backdrop-blur-sm"
          @click="isFullscreen = false"
        ></div>
        <div class="relative z-10 flex h-full flex-col">
          <div class="flex-1 overflow-y-auto px-4 py-8 sm:px-8" @click="isFullscreen = false">
            <div class="mx-auto max-w-4xl" @click.stop>
              <div class="relative rounded-lg bg-white p-6 shadow-2xl dark:bg-navy-900">
                <button
                  type="button"
                  class="absolute right-4 top-4 inline-flex items-center gap-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
                  @click.stop="isFullscreen = false"
                >
                  <ArrowsPointingInIcon class="h-4 w-4" />
                  Exit fullscreen
                </button>
                <div class="prose prose-lg max-w-none dark:prose-invert">
                  <MarkdownRenderer :text="chapterText" :font-size="fontSize" :font-family="fontFamily" reading-layout />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
