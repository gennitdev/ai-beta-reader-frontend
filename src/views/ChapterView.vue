<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth0 } from '@auth0/auth0-vue'
import { createChapterService, createReviewService } from '@/services/api'
import TextEditor from '@/components/TextEditor.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import {
  PencilIcon,
  EyeIcon,
  SparklesIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ChevronDownIcon
} from '@heroicons/vue/24/outline'

interface Chapter {
  id: string
  book_id: string
  title: string | null
  text: string
  word_count: number
  summary: string | null
  pov: string | null
  characters: string[] | null
  beats: string[] | null
  spoilers_ok: boolean | null
}

const route = useRoute()
const router = useRouter()
const { getAccessTokenSilently } = useAuth0()
const bookId = route.params.bookId as string
const chapterId = route.params.chapterId as string

// Create authenticated services
const getToken = async () => {
  try {
    // Request token with client ID as audience (for UI-based authentication)
    return await getAccessTokenSilently()
  } catch (error) {
    console.warn('Failed to get access token:', error)
    return undefined
  }
}

const chapterService = createChapterService(getToken)
const reviewService = createReviewService(getToken)

const chapter = ref<Chapter | null>(null)
const loading = ref(false)
const isEditing = ref(false)
const editedText = ref('')
const editedTitle = ref('')
const generatingReview = ref(false)
const generatingSummary = ref(false)
const reviewTone = ref<'fanficnet' | 'editorial' | 'line-notes'>('fanficnet')
const reviewText = ref('')

const hasUnsavedChanges = computed(() => {
  if (!chapter.value) return false
  return editedText.value !== chapter.value.text || editedTitle.value !== (chapter.value.title || '')
})

const loadChapter = async () => {
  loading.value = true
  try {
    const chapterData = await chapterService.getChapter(chapterId)
    chapter.value = chapterData
    editedText.value = chapterData.text
    editedTitle.value = chapterData.title || ''
  } catch (error) {
    console.error('Failed to load chapter:', error)
    router.push(`/books/${bookId}`)
  } finally {
    loading.value = false
  }
}

const saveChapter = async () => {
  if (!chapter.value || !hasUnsavedChanges.value) return

  loading.value = true
  try {
    await chapterService.updateChapter({
      id: chapter.value.id,
      bookId: chapter.value.book_id,
      title: editedTitle.value || undefined,
      text: editedText.value
    })

    chapter.value.text = editedText.value
    chapter.value.title = editedTitle.value || null
    isEditing.value = false
  } catch (error) {
    console.error('Failed to save chapter:', error)
  } finally {
    loading.value = false
  }
}

const generateSummary = async () => {
  if (!chapter.value) return

  generatingSummary.value = true
  try {
    const result = await chapterService.generateSummary(chapter.value.id)

    // Update chapter with new summary data
    chapter.value.summary = result.summary.summary
    chapter.value.pov = result.summary.pov
    chapter.value.characters = result.summary.characters
    chapter.value.beats = result.summary.beats
    chapter.value.spoilers_ok = result.summary.spoilers_ok
  } catch (error) {
    console.error('Failed to generate summary:', error)
  } finally {
    generatingSummary.value = false
  }
}

const generateReview = async () => {
  if (!chapter.value) return

  generatingReview.value = true
  reviewText.value = ''

  try {
    const result = await reviewService.generateReview({
      bookId: chapter.value.book_id,
      newChapterId: chapter.value.id,
      tone: reviewTone.value
    })

    reviewText.value = result.review
  } catch (error) {
    console.error('Failed to generate review:', error)
  } finally {
    generatingReview.value = false
  }
}

const cancelEdit = () => {
  if (!chapter.value) return
  editedText.value = chapter.value.text
  editedTitle.value = chapter.value.title || ''
  isEditing.value = false
}

const startEdit = () => {
  isEditing.value = true
}

onMounted(() => {
  loadChapter()
})
</script>

<template>
  <div class="max-w-6xl mx-auto p-6">
    <!-- Header -->
    <div class="mb-8">
      <nav class="text-sm breadcrumbs mb-4">
        <router-link to="/books" class="text-blue-600 hover:text-blue-700">Books</router-link>
        <span class="mx-2 text-gray-500">></span>
        <router-link :to="`/books/${bookId}`" class="text-blue-600 hover:text-blue-700">
          {{ bookId }}
        </router-link>
        <span class="mx-2 text-gray-500">></span>
        <span class="text-gray-700 dark:text-gray-300">{{ chapter?.title || chapterId }}</span>
      </nav>

      <div class="flex justify-between items-start">
        <div class="flex-1">
          <div v-if="isEditing" class="space-y-2">
            <input
              v-model="editedTitle"
              type="text"
              placeholder="Chapter title (optional)"
              class="text-3xl font-bold bg-transparent border-b-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none w-full"
            />
          </div>
          <div v-else>
            <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
              {{ chapter?.title || chapterId }}
            </h1>
          </div>

          <div class="flex items-center space-x-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
            <span>{{ chapter?.word_count?.toLocaleString() || 0 }} words</span>
            <div class="flex items-center">
              <CheckCircleIcon
                :class="chapter?.summary ? 'text-green-500' : 'text-gray-300'"
                class="w-4 h-4 mr-1"
              />
              <span :class="chapter?.summary ? 'text-green-600' : 'text-gray-500'">
                {{ chapter?.summary ? 'Summarized' : 'Not summarized' }}
              </span>
            </div>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <template v-if="isEditing">
            <button
              @click="cancelEdit"
              class="px-3 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              @click="saveChapter"
              :disabled="!hasUnsavedChanges || loading"
              class="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {{ loading ? 'Saving...' : 'Save' }}
            </button>
          </template>
          <template v-else>
            <button
              @click="startEdit"
              class="inline-flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <PencilIcon class="w-4 h-4 mr-1" />
              Edit
            </button>
          </template>
        </div>
      </div>
    </div>

    <div v-if="loading && !chapter" class="flex justify-center items-center h-64">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>

    <div v-else-if="chapter" class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Main content -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Chapter text -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div class="p-6">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Chapter Text</h2>

            <div v-if="isEditing">
              <TextEditor
                v-model="editedText"
                placeholder="Write your chapter content here..."
                :max-length="50000"
                height="500px"
              />
            </div>
            <div v-else class="prose prose-gray dark:prose-invert max-w-none">
              <MarkdownRenderer :text="chapter.text" />
            </div>
          </div>
        </div>

        <!-- AI Review -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div class="p-6">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">AI Review</h2>

              <div class="flex items-center space-x-3">
                <div class="relative">
                  <select
                    v-model="reviewTone"
                    class="px-3 py-1 pr-8 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    style="-webkit-appearance: none; -moz-appearance: none; appearance: none; background-image: none;"
                  >
                    <option value="fanficnet">Fanfic review style</option>
                    <option value="editorial">Editorial Notes</option>
                    <option value="line-notes">Line Editor</option>
                  </select>
                  <ChevronDownIcon class="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                <button
                  @click="generateReview"
                  :disabled="generatingReview"
                  class="inline-flex items-center px-3 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <SparklesIcon class="w-4 h-4 mr-1" />
                  {{ generatingReview ? 'Generating...' : 'Get Review' }}
                </button>
              </div>
            </div>

            <div v-if="generatingReview" class="flex items-center justify-center py-8">
              <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mr-3"></div>
              <span class="text-gray-600 dark:text-gray-400">AI is reviewing your chapter...</span>
            </div>

            <div v-else-if="reviewText" class="prose prose-gray dark:prose-invert max-w-none">
              <MarkdownRenderer :text="reviewText" />
            </div>

            <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
              <ChatBubbleLeftRightIcon class="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Click "Get Review" to receive AI feedback on this chapter.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Summary -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div class="p-6">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Chapter Summary</h3>
              <button
                @click="generateSummary"
                :disabled="generatingSummary"
                class="inline-flex items-center px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <SparklesIcon class="w-4 h-4 mr-1" />
                {{ generatingSummary ? 'Generating...' : chapter.summary ? 'Regenerate' : 'Generate' }}
              </button>
            </div>

            <div v-if="generatingSummary" class="flex items-center py-4">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600 mr-2"></div>
              <span class="text-sm text-gray-600 dark:text-gray-400">Generating summary...</span>
            </div>

            <div v-else-if="chapter.summary" class="space-y-4 text-sm">
              <div>
                <h4 class="font-medium text-gray-900 dark:text-white mb-2">Summary</h4>
                <p class="text-gray-700 dark:text-gray-300">{{ chapter.summary }}</p>
              </div>

              <div v-if="chapter.pov">
                <h4 class="font-medium text-gray-900 dark:text-white mb-1">POV</h4>
                <p class="text-gray-700 dark:text-gray-300">{{ chapter.pov }}</p>
              </div>

              <div v-if="chapter.characters && chapter.characters.length">
                <h4 class="font-medium text-gray-900 dark:text-white mb-1">Characters</h4>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="character in chapter.characters"
                    :key="character"
                    class="inline-block px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded"
                  >
                    {{ character }}
                  </span>
                </div>
              </div>

              <div v-if="chapter.beats && chapter.beats.length">
                <h4 class="font-medium text-gray-900 dark:text-white mb-1">Key Beats</h4>
                <ul class="text-gray-700 dark:text-gray-300 space-y-1">
                  <li v-for="beat in chapter.beats" :key="beat" class="text-xs">
                    • {{ beat }}
                  </li>
                </ul>
              </div>
            </div>

            <div v-else class="text-center py-4 text-gray-500 dark:text-gray-400">
              <ClockIcon class="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p class="text-sm">Generate a summary to track key plot points and characters.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>