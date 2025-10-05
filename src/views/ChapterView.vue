<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDatabase } from '@/composables/useDatabase'
import { generateChapterSummary } from '@/lib/openai'
import TextEditor from '@/components/TextEditor.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import AvatarComponent from '@/components/AvatarComponent.vue'
import {
  PencilIcon,
  SparklesIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ChevronDownIcon,
  TrashIcon,
  ArrowLeftIcon
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

interface Review {
  id: string
  review_text: string
  prompt_used?: string | null
  created_at: string
  updated_at: string
  profile_id: number
  profile_name: string
  tone_key: string
}

interface Character {
  id: string
  character_name: string
  wiki_page_id: string | null
  has_wiki_page: boolean
}

interface CustomReviewerProfile {
  id: number
  name: string
  description: string
  created_at: string
  updated_at: string
}

const route = useRoute()
const router = useRouter()

// Computed route parameters to handle both nested and standalone routes
const bookId = computed(() => (route.params.bookId || route.params.id) as string)
const chapterId = computed(() => route.params.chapterId as string)

// Use local database
const { books, chapters, loadBooks, loadChapters, saveChapter: dbSaveChapter, saveSummary, getSummary } = useDatabase()

const chapter = ref<Chapter | null>(null)
const loading = ref(false)
const isEditing = ref(false)
const editedText = ref('')
const editedTitle = ref('')
const generatingReview = ref(false)
const generatingSummary = ref(false)
const reviewTone = ref<string>('fanficnet')
const reviewText = ref('')
const customProfiles = ref<CustomReviewerProfile[]>([])
const loadingProfiles = ref(false)
const savedReviews = ref<Review[]>([])
const loadingReviews = ref(false)
const deletingReviewId = ref<string | null>(null)
const characters = ref<Character[]>([])

// Summary editing state
const isEditingSummary = ref(false)
const editedSummary = ref('')
const savingSummary = ref(false)

// Text truncation state
const showFullChapterText = ref(false)
const showFullCurrentReview = ref(false)
const expandedReviews = ref<Set<string>>(new Set())
const expandedPrompts = ref<Set<string>>(new Set())

// Mobile detection
const isMobileRoute = computed(() => route.meta?.mobile === true)

// Computed book title from database
const bookTitle = computed(() => {
  const book = books.value.find((b: any) => b.id === bookId.value)
  return book?.title || bookId.value
})

const hasUnsavedChanges = computed(() => {
  if (!chapter.value) return false
  return editedText.value !== chapter.value.text || editedTitle.value !== (chapter.value.title || '')
})

// Computed navigation URLs
const bookUrl = computed(() => `/books/${bookId.value}`)
const backButtonUrl = computed(() => bookUrl.value)


const loadChapter = async () => {
  loading.value = true
  try {
    // Load books and chapters from database
    await loadBooks()
    await loadChapters(bookId.value)

    // Find the current chapter
    const chapterData = chapters.value.find((ch: any) => ch.id === chapterId.value)

    if (chapterData) {
      // Load summary from database if exists
      const summaryData = await getSummary(chapterData.id)

      chapter.value = {
        id: chapterData.id,
        book_id: chapterData.book_id,
        title: chapterData.title || null,
        text: String(chapterData.text || ''),
        word_count: chapterData.word_count,
        summary: summaryData?.summary || null,
        pov: summaryData?.pov || null,
        characters: summaryData?.characters ? JSON.parse(summaryData.characters) : null,
        beats: summaryData?.beats ? JSON.parse(summaryData.beats) : null,
        spoilers_ok: summaryData?.spoilers_ok || null
      }
      editedText.value = String(chapterData.text || '')
      editedTitle.value = chapterData.title || ''
      editedSummary.value = summaryData?.summary || ''
    } else {
      console.error('Chapter not found')
      router.push(`/books/${bookId.value}`)
    }
  } catch (error) {
    console.error('Failed to load chapter:', error)
    router.push(`/books/${bookId.value}`)
  } finally {
    loading.value = false
  }
}

const saveChapter = async () => {
  if (!chapter.value || !hasUnsavedChanges.value) return

  loading.value = true
  try {
    // Calculate word count
    const wordCount = editedText.value.trim().split(/\s+/).length

    // Save to local database
    await dbSaveChapter({
      id: chapter.value.id,
      book_id: chapter.value.book_id,
      title: editedTitle.value,
      text: editedText.value,
      word_count: wordCount,
      created_at: new Date().toISOString()
    })

    chapter.value.text = editedText.value
    chapter.value.title = editedTitle.value || null
    chapter.value.word_count = wordCount
    isEditing.value = false
  } catch (error) {
    console.error('Failed to save chapter:', error)
  } finally {
    loading.value = false
  }
}

const generateSummary = async () => {
  if (!chapter.value) return

  try {
    generatingSummary.value = true

    // Get OpenAI API key from localStorage
    const apiKey = localStorage.getItem('openai_api_key')
    if (!apiKey) {
      alert('Please add your OpenAI API key in Settings first')
      router.push('/settings')
      return
    }

    // Check if this is the first chapter (position 0 in book's chapter order)
    const book = books.value.find((b: any) => b.id === bookId.value)
    const chapterOrder = book?.chapter_order ? JSON.parse(book.chapter_order) : []
    const isFirstChapter = chapterOrder[0] === chapter.value.id

    // Generate summary using OpenAI
    const result = await generateChapterSummary(
      apiKey,
      chapter.value.text,
      chapter.value.title || chapter.value.id,
      chapter.value.id,
      bookId.value,
      book?.title || bookId.value,
      isFirstChapter
    )

    // Save summary to database
    await saveSummary({
      chapter_id: chapter.value.id,
      summary: result.summary,
      pov: result.pov,
      characters: result.characters,
      beats: result.beats,
      spoilers_ok: result.spoilers_ok
    })

    // Update UI
    chapter.value.summary = result.summary
    chapter.value.pov = result.pov
    chapter.value.characters = result.characters
    chapter.value.beats = result.beats
    chapter.value.spoilers_ok = result.spoilers_ok

    // Update summary editing state
    editedSummary.value = result.summary
  } catch (error: any) {
    console.error('Failed to generate summary:', error)
    alert(`Failed to generate summary: ${error.message || 'Unknown error'}`)
  } finally {
    generatingSummary.value = false
  }
}

const startEditingSummary = () => {
  if (!chapter.value?.summary) return
  editedSummary.value = chapter.value.summary
  isEditingSummary.value = true
}

const cancelEditingSummary = () => {
  isEditingSummary.value = false
  editedSummary.value = ''
}

const saveSummary = async () => {
  // TODO: Implement summary saving to local database
  console.log('Summary saving not implemented yet')
}

const generateReview = async () => {
  // TODO: Implement AI review generation with local OpenAI key
  console.log('Review generation not implemented yet')
  alert('Review generation will be implemented with OpenAI integration')
}

const loadSavedReviews = async () => {
  // TODO: Load reviews from local database
  savedReviews.value = []
}

const deleteReview = async (reviewId: string) => {
  // TODO: Delete review from local database
  console.log('Delete review not implemented yet')
}

const loadCharacters = async () => {
  // TODO: Load characters from local database
  characters.value = []
}

const loadCustomProfiles = async () => {
  // TODO: Load custom profiles from local database
  customProfiles.value = []
}

// Character lookup helper - now more functional
const getCharacterWikiInfo = (characterName: string) => {
  return characters.value.find(char => char.character_name === characterName)
}

// Computed character map for better performance with large character lists
const characterMap = computed(() => {
  return characters.value.reduce((map, char) => {
    map[char.character_name] = char
    return map
  }, {} as Record<string, Character>)
})

const navigateToWiki = (characterName: string) => {
  const character = getCharacterWikiInfo(characterName)
  if (character?.has_wiki_page && character.wiki_page_id) {
    router.push(`/books/${bookId.value}/wiki/${character.wiki_page_id}`)
  }
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
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

const goBack = () => {
  router.push(backButtonUrl.value)
}

// Text truncation helpers - more functional approach
const getTruncatedText = (text: string, wordLimit: number = 120): { truncated: string; needsTruncation: boolean } => {
  if (!text || typeof text !== 'string') return { truncated: '', needsTruncation: false }

  const words = text.split(/(\s+)/)
  let wordCount = 0

  const truncatedParts = words.filter(part => {
    if (/\S/.test(part)) { // If part contains non-whitespace characters
      wordCount++
      return wordCount <= wordLimit
    }
    return wordCount <= wordLimit // Include whitespace if we haven't exceeded limit
  })

  const needsTruncation = wordCount > wordLimit
  return {
    truncated: needsTruncation ? truncatedParts.join('') : text,
    needsTruncation
  }
}

const toggleReviewExpansion = (reviewId: string) => {
  if (expandedReviews.value.has(reviewId)) {
    expandedReviews.value.delete(reviewId)
  } else {
    expandedReviews.value.add(reviewId)
  }
}

const togglePromptExpansion = (reviewId: string) => {
  if (expandedPrompts.value.has(reviewId)) {
    expandedPrompts.value.delete(reviewId)
  } else {
    expandedPrompts.value.add(reviewId)
  }
}

onMounted(async () => {
  await loadChapter()
  await loadSavedReviews()
  await loadCharacters()
  await loadCustomProfiles()
})
</script>

<template>
  <div class="max-w-6xl mx-auto p-6">
    <!-- Header -->
    <div class="mb-8">
      <nav class="text-sm breadcrumbs mb-4">
        <router-link to="/books" class="text-blue-600 hover:text-blue-700">Books</router-link>
        <span class="mx-2 text-gray-500">></span>
        <router-link :to="bookUrl" class="text-blue-600 hover:text-blue-700">
          {{ bookTitle }}
        </router-link>
        <span class="mx-2 text-gray-500">></span>
        <span class="text-gray-700 dark:text-gray-300">{{ chapter?.title || chapterId }}</span>
      </nav>

      <div class="flex justify-between items-start">
        <div class="flex items-center flex-1">
          <!-- Back button for mobile routes -->
          <button
            v-if="isMobileRoute"
            @click="goBack"
            class="mr-4 p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowLeftIcon class="w-5 h-5" />
          </button>

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
              <template v-if="!showFullChapterText && getTruncatedText(chapter.text).needsTruncation">
                <MarkdownRenderer :text="getTruncatedText(chapter.text).truncated" />
                <div class="not-prose">
                  <span class="text-gray-500">...</span>
                  <button
                    @click="showFullChapterText = true"
                    class="inline-flex items-center ml-2 px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors"
                  >
                    Show more
                  </button>
                </div>
              </template>
              <template v-else>
                <MarkdownRenderer :text="chapter.text" />
                <div v-if="getTruncatedText(chapter.text).needsTruncation" class="not-prose">
                  <button
                    @click="showFullChapterText = false"
                    class="inline-flex items-center mt-3 px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors"
                  >
                    Show less
                  </button>
                </div>
              </template>
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
                    <!-- Built-in profiles -->
                    <optgroup label="Built-in Styles">
                      <option value="fanficnet">Fan style</option>
                      <option value="editorial">Editorial Notes</option>
                      <option value="line-notes">Line Editor</option>
                    </optgroup>

                    <!-- Custom profiles -->
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
              <template v-if="!showFullCurrentReview && getTruncatedText(reviewText).needsTruncation">
                <MarkdownRenderer :text="getTruncatedText(reviewText).truncated" />
                <div class="not-prose">
                  <span class="text-gray-500">...</span>
                  <button
                    @click="showFullCurrentReview = true"
                    class="inline-flex items-center ml-2 px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors"
                  >
                    Show more
                  </button>
                </div>
              </template>
              <template v-else>
                <MarkdownRenderer :text="reviewText" />
                <div v-if="getTruncatedText(reviewText).needsTruncation" class="not-prose">
                  <button
                    @click="showFullCurrentReview = false"
                    class="inline-flex items-center mt-3 px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors"
                  >
                    Show less
                  </button>
                </div>
              </template>
            </div>

            <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
              <ChatBubbleLeftRightIcon class="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Click "Get Review" to receive AI feedback on this chapter.</p>
            </div>
          </div>
        </div>

        <!-- Saved Reviews -->
        <div v-if="savedReviews.length > 0" class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div class="p-6">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-6">AI Reviews</h2>

            <div v-if="loadingReviews" class="flex justify-center py-4">
              <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>

            <div v-else class="space-y-6">
              <div
                v-for="review in savedReviews"
                :key="review.id"
                class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
              >
                <!-- Review Header -->
                <div class="flex items-start justify-between mb-3">
                  <div class="flex items-center space-x-3">
                    <!-- Clickable Avatar -->
                    <router-link
                      :to="`/ai-profiles/${review.profile_id}`"
                      class="block hover:opacity-80 transition-opacity"
                      :title="`View ${review.profile_name} profile`"
                    >
                      <AvatarComponent
                        :text="review.profile_name"
                        size="medium"
                      />
                    </router-link>

                    <!-- Profile Info -->
                    <div>
                      <router-link
                        :to="`/ai-profiles/${review.profile_id}`"
                        class="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        :title="`View ${review.profile_name} profile`"
                      >
                        {{ review.profile_name }}
                      </router-link>
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        {{ formatDate(review.created_at) }}
                      </p>
                    </div>
                  </div>

                  <!-- Delete Button -->
                  <button
                    @click="deleteReview(review.id)"
                    :disabled="deletingReviewId === review.id"
                    class="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Delete review"
                  >
                    <div v-if="deletingReviewId === review.id" class="animate-spin rounded-full h-4 w-4 border-b-2 border-red-500"></div>
                    <TrashIcon v-else class="w-4 h-4" />
                  </button>
                </div>

                <!-- Review Content -->
                <div class="prose prose-sm prose-gray dark:prose-invert max-w-none">
                  <template v-if="!expandedReviews.has(review.id) && getTruncatedText(review.review_text).needsTruncation">
                    <MarkdownRenderer :text="getTruncatedText(review.review_text).truncated" />
                    <div class="not-prose">
                      <span class="text-gray-500">...</span>
                      <button
                        @click="toggleReviewExpansion(review.id)"
                        class="inline-flex items-center ml-2 px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors"
                      >
                        Show more
                      </button>
                    </div>
                  </template>
                  <template v-else>
                    <MarkdownRenderer :text="review.review_text" />
                    <div v-if="getTruncatedText(review.review_text).needsTruncation" class="not-prose">
                      <button
                        @click="toggleReviewExpansion(review.id)"
                        class="inline-flex items-center mt-3 px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors"
                      >
                        Show less
                      </button>
                    </div>
                  </template>
                </div>

                <!-- Prompt Display Section -->
                <div v-if="review.prompt_used" class="mt-4 border-t border-gray-200 dark:border-gray-600 pt-4">
                  <div v-if="!expandedPrompts.has(review.id)">
                    <button
                      @click="togglePromptExpansion(review.id)"
                      class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 transition-colors"
                    >
                      Click here to see the prompt that was used to generate this review
                    </button>
                  </div>
                  <div v-else class="space-y-3">
                    <div class="flex items-center justify-between">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Full Prompt Used:</span>
                      <button
                        @click="togglePromptExpansion(review.id)"
                        class="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 transition-colors"
                      >
                        Hide prompt
                      </button>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-sm">
                      <pre class="whitespace-pre-wrap text-gray-800 dark:text-gray-200 font-mono text-xs leading-relaxed">{{ review.prompt_used }}</pre>
                    </div>
                  </div>
                </div>
              </div>
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
              <div class="flex items-center space-x-2">
                <button
                  v-if="chapter.summary && !isEditingSummary"
                  @click="startEditingSummary"
                  class="inline-flex items-center px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                  title="Edit summary"
                >
                  <PencilIcon class="w-3 h-3 mr-1" />
                  Edit
                </button>
                <button
                  @click="generateSummary"
                  :disabled="generatingSummary || isEditingSummary"
                  class="inline-flex items-center px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <SparklesIcon class="w-4 h-4 mr-1" />
                  {{ generatingSummary ? 'Generating...' : chapter.summary ? 'Regenerate' : 'Generate' }}
                </button>
              </div>
            </div>

            <div v-if="generatingSummary" class="flex items-center py-4">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600 mr-2"></div>
              <span class="text-sm text-gray-600 dark:text-gray-400">Generating summary...</span>
            </div>

            <div v-else-if="chapter.summary || isEditingSummary" class="space-y-4 text-sm">
              <div>
                <div class="flex justify-between items-center mb-2">
                  <h4 class="font-medium text-gray-900 dark:text-white">Summary</h4>
                  <div v-if="isEditingSummary" class="flex items-center space-x-2">
                    <button
                      @click="cancelEditingSummary"
                      class="text-xs px-2 py-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      @click="saveSummary"
                      :disabled="savingSummary || !editedSummary.trim()"
                      class="inline-flex items-center text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <span v-if="savingSummary" class="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent mr-1"></span>
                      {{ savingSummary ? 'Saving...' : 'Save' }}
                    </button>
                  </div>
                </div>

                <div v-if="isEditingSummary">
                  <textarea
                    v-model="editedSummary"
                    rows="6"
                    class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                    placeholder="Enter chapter summary..."
                  ></textarea>
                </div>
                <div v-else>
                  <MarkdownRenderer :text="chapter.summary || ''" class="text-gray-700 dark:text-gray-300" />
                </div>
              </div>

              <div v-if="chapter.pov">
                <h4 class="font-medium text-gray-900 dark:text-white mb-1">POV</h4>
                <p class="text-gray-700 dark:text-gray-300">{{ chapter.pov }}</p>
              </div>

              <div v-if="chapter.characters && chapter.characters.length">
                <h4 class="font-medium text-gray-900 dark:text-white mb-1">Characters</h4>
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="character in chapter.characters"
                    :key="character"
                    @click="navigateToWiki(character)"
                    :class="[
                      'inline-block px-2 py-1 text-xs rounded transition-colors',
                      getCharacterWikiInfo(character)?.has_wiki_page
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800 cursor-pointer'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-default'
                    ]"
                    :disabled="!getCharacterWikiInfo(character)?.has_wiki_page"
                    :title="getCharacterWikiInfo(character)?.has_wiki_page ? `View ${character}'s wiki page` : `${character} (no wiki page)`"
                  >
                    {{ character }}
                  </button>
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
