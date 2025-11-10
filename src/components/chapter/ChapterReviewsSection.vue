<script setup lang="ts">
import { ref, onUnmounted, type PropType } from 'vue'
import {
  SparklesIcon,
  ChevronDownIcon,
  ChatBubbleLeftRightIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  CheckIcon,
} from '@heroicons/vue/24/outline'
import AvatarComponent from '@/components/AvatarComponent.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

type Review = {
  id: string
  review_text: string
  prompt_used?: string | null
  created_at: string
  updated_at: string
  profile_id: number | null
  profile_name: string | null
  tone_key: string | null
}

type CustomProfile = {
  id: number
  name: string
  description: string
  created_at: string
  updated_at: string
}

defineProps({
  reviewTone: {
    type: String,
    default: 'fanficnet',
  },
  customProfiles: {
    type: Array as PropType<CustomProfile[]>,
    default: () => [],
  },
  savedReviews: {
    type: Array as PropType<Review[]>,
    default: () => [],
  },
  loadingReviews: {
    type: Boolean,
    default: false,
  },
  generatingReview: {
    type: Boolean,
    default: false,
  },
  deletingReviewId: {
    type: String as PropType<string | null>,
    default: null,
  },
  expandedReviews: {
    type: Object as PropType<Set<string>>,
    required: true,
  },
  expandedPrompts: {
    type: Object as PropType<Set<string>>,
    required: true,
  },
  formatDate: {
    type: Function as PropType<(dateString: string) => string>,
    required: true,
  },
  getTruncatedText: {
    type: Function as PropType<
      (text: string, wordLimit?: number) => { truncated: string; needsTruncation: boolean }
    >,
    required: true,
  },
})

const emit = defineEmits<{
  (e: 'update:reviewTone', value: string): void
  (e: 'generate-review'): void
  (e: 'delete-review', id: string): void
  (e: 'toggle-review', id: string): void
  (e: 'toggle-prompt', id: string): void
}>()

const copiedReviewId = ref<string | null>(null)
let reviewCopyTimeout: ReturnType<typeof setTimeout> | null = null

const resetCopiedReview = () => {
  if (reviewCopyTimeout) {
    clearTimeout(reviewCopyTimeout)
    reviewCopyTimeout = null
  }
  copiedReviewId.value = null
}

const fallbackCopy = (text: string) => {
  if (typeof document === 'undefined') return
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

const copyReviewText = async (review: Review) => {
  if (!review.review_text) return
  try {
    resetCopiedReview()
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(review.review_text)
    } else {
      fallbackCopy(review.review_text)
    }
    copiedReviewId.value = review.id
    reviewCopyTimeout = setTimeout(() => {
      resetCopiedReview()
    }, 2000)
  } catch (error) {
    console.error('Failed to copy review text:', error)
  }
}

onUnmounted(() => {
  resetCopiedReview()
})
</script>

<template>
  <div class="py-4">
    <div>
      <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">AI Reviews</h2>

        <div class="flex items-center space-x-3">
          <div class="relative">
            <select
              :value="reviewTone"
              class="rounded-md border border-gray-300 bg-white px-3 py-1 pr-8 text-sm text-gray-900 transition focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              style="appearance: none"
              @change="emit('update:reviewTone', ($event.target as HTMLSelectElement).value)"
            >
              <optgroup label="Built-in Styles">
                <option value="fanficnet">Fan style</option>
                <option value="editorial">Editorial Notes</option>
                <option value="line-notes">Line Editor</option>
              </optgroup>
              <optgroup v-if="customProfiles.length > 0" label="Custom Profiles">
                <option
                  v-for="profile in customProfiles"
                  :key="profile.id"
                  :value="`custom-${profile.id}`"
                >
                  {{ profile.name }}
                </option>
              </optgroup>
            </select>
            <ChevronDownIcon
              class="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            />
          </div>

          <button
            @click="emit('generate-review')"
            :disabled="generatingReview"
            class="inline-flex items-center whitespace-nowrap rounded-md bg-purple-600 px-3 py-2 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SparklesIcon class="mr-1 h-4 w-4" />
            {{ generatingReview ? 'Generating...' : 'Get Review' }}
          </button>
        </div>
      </div>

      <div v-if="generatingReview" class="flex items-center justify-center gap-3 rounded-md bg-purple-50 py-3 text-sm text-purple-700 dark:bg-purple-900/40 dark:text-purple-200">
        <div class="h-5 w-5 animate-spin rounded-full border-b-2 border-purple-600"></div>
        <span>AI is reviewing your chapter...</span>
      </div>

      <template v-if="savedReviews.length === 0">
        <div v-if="loadingReviews" class="flex justify-center py-4">
          <div class="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600"></div>
        </div>
        <div
          v-else-if="!generatingReview"
          class="py-8 text-center text-gray-500 dark:text-gray-400"
        >
          <ChatBubbleLeftRightIcon class="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p>Click "Get Review" to receive AI feedback on this chapter.</p>
        </div>
      </template>

      <template v-else>
        <div
          v-if="loadingReviews"
          class="mb-4 flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400"
        >
          <div class="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <span>Refreshing reviews...</span>
        </div>

        <div class="space-y-6">
          <div
            v-for="review in savedReviews"
            :key="review.id"
            class="transition-colors hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
          >
            <div class="mb-3 flex items-start justify-between">
              <div class="flex items-center space-x-3">
                <component
                  :is="review.profile_id ? 'router-link' : 'div'"
                  :to="review.profile_id ? `/ai-profiles/${review.profile_id}` : undefined"
                  class="block transition-opacity hover:opacity-80"
                  :class="{ 'cursor-default hover:opacity-100': !review.profile_id }"
                  :title="
                    review.profile_id && review.profile_name
                      ? `View ${review.profile_name} profile`
                      : undefined
                  "
                >
                  <AvatarComponent :text="review.profile_name || 'AI Profile'" size="medium" />
                </component>

                <div>
                  <component
                    :is="review.profile_id ? 'router-link' : 'span'"
                    :to="review.profile_id ? `/ai-profiles/${review.profile_id}` : undefined"
                    class="font-medium text-gray-900 transition-colors hover:text-blue-600 dark:text-white dark:hover:text-blue-400"
                    :class="{ 'hover:text-blue-600 dark:hover:text-blue-400': !!review.profile_id }"
                    :title="
                      review.profile_id && review.profile_name
                        ? `View ${review.profile_name} profile`
                        : undefined
                    "
                  >
                    {{ review.profile_name || 'Unknown profile' }}
                  </component>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ formatDate(review.created_at) }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-1">
                <button
                  @click="copyReviewText(review)"
                  class="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-blue-600 dark:hover:bg-gray-700 dark:hover:text-blue-400"
                  title="Copy review text"
                >
                  <component
                    :is="copiedReviewId === review.id ? CheckIcon : DocumentDuplicateIcon"
                    class="h-4 w-4"
                  />
                  <span class="sr-only">Copy review to clipboard</span>
                </button>
                <button
                  @click="emit('delete-review', review.id)"
                  :disabled="deletingReviewId === review.id"
                  class="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-700 dark:hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Delete review"
                >
                  <div
                    v-if="deletingReviewId === review.id"
                    class="h-4 w-4 animate-spin rounded-full border-b-2 border-red-500"
                  ></div>
                  <TrashIcon v-else class="h-4 w-4" />
                  <span class="sr-only">Delete review</span>
                </button>
              </div>
            </div>

            <div class="prose prose-sm max-w-none dark:prose-invert">
              <template
                v-if="!expandedReviews.has(review.id) && getTruncatedText(review.review_text).needsTruncation"
              >
                <MarkdownRenderer :text="getTruncatedText(review.review_text).truncated" />
                <div class="not-prose">
                  <span class="text-gray-500">...</span>
                  <button
                    @click="emit('toggle-review', review.id)"
                    class="ml-2 inline-flex items-center px-3 py-1 text-sm font-medium text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Show more
                  </button>
                </div>
              </template>
              <template v-else>
                <MarkdownRenderer :text="review.review_text" />
                <div v-if="getTruncatedText(review.review_text).needsTruncation" class="not-prose">
                  <button
                    @click="emit('toggle-review', review.id)"
                    class="mt-3 inline-flex items-center px-3 py-1 text-sm font-medium text-blue-600 transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Show less
                  </button>
                </div>
              </template>
            </div>

            <div v-if="review.prompt_used" class="mt-4 border-t border-gray-200 pt-4 dark:border-gray-600">
              <div v-if="!expandedPrompts.has(review.id)">
                <button
                  @click="emit('toggle-prompt', review.id)"
                  class="text-sm text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                >
                  Click here to see the prompt that was used to generate this review
                </button>
              </div>
              <div v-else class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Full Prompt Used:</span>
                  <button
                    @click="emit('toggle-prompt', review.id)"
                    class="text-sm text-gray-600 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300"
                  >
                    Hide prompt
                  </button>
                </div>
                <div class="rounded-lg bg-gray-50 p-4 text-sm dark:bg-gray-700">
                  <pre class="whitespace-pre-wrap text-xs font-mono leading-relaxed text-gray-800 dark:text-gray-200">
{{ review.prompt_used }}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
