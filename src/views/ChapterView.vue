<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth0 } from '@auth0/auth0-vue'
import { createChapterService, createReviewService, createBookService } from '@/services/api'
import TextEditor from '@/components/TextEditor.vue'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
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
const { getAccessTokenSilently } = useAuth0()

// Computed route parameters to handle both nested and standalone routes
const bookId = computed(() => (route.params.bookId || route.params.id) as string)
const chapterId = computed(() => route.params.chapterId as string)

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
const bookService = createBookService(getToken)

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

// Text truncation state
const showFullChapterText = ref(false)
const showFullCurrentReview = ref(false)
const expandedReviews = ref<Set<string>>(new Set())

// Mobile detection
const isMobileRoute = computed(() => route.meta?.mobile === true)

// Computed book title from localStorage
const bookTitle = computed(() => {
  try {
    const savedBooks = localStorage.getItem('books')
    if (savedBooks) {
      const books = JSON.parse(savedBooks)
      const book = books.find((b: any) => b.id === bookId.value)
      if (book) {
        return book.title
      }
    }
    return bookId.value // Fallback to bookId
  } catch (error) {
    console.error('Failed to load book title:', error)
    return bookId.value
  }
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
    const chapterData = await chapterService.getChapter(chapterId.value)
    chapter.value = chapterData
    editedText.value = chapterData.text
    editedTitle.value = chapterData.title || ''
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
    // Check if it's a custom profile
    const isCustomProfile = reviewTone.value.startsWith('custom-')

    let requestData: any = {
      bookId: chapter.value.book_id,
      newChapterId: chapter.value.id
    }

    if (isCustomProfile) {
      requestData.customProfileId = parseInt(reviewTone.value.replace('custom-', ''))
    } else {
      requestData.tone = reviewTone.value
    }

    const result = await reviewService.generateReview(requestData)

    reviewText.value = result.review
    // Reload saved reviews to include the new one
    await loadSavedReviews()
  } catch (error) {
    console.error('Failed to generate review:', error)
  } finally {
    generatingReview.value = false
  }
}

const loadSavedReviews = async () => {
  if (!chapter.value) return

  loadingReviews.value = true
  try {
    const reviews = await chapterService.getChapterReviews(chapter.value.id)
    savedReviews.value = reviews
  } catch (error) {
    console.error('Failed to load saved reviews:', error)
    savedReviews.value = []
  } finally {
    loadingReviews.value = false
  }
}

const deleteReview = async (reviewId: string) => {
  if (!confirm('Are you sure you want to delete this review?')) return

  deletingReviewId.value = reviewId
  try {
    await chapterService.deleteChapterReview(reviewId)
    savedReviews.value = savedReviews.value.filter(r => r.id !== reviewId)
  } catch (error) {
    console.error('Failed to delete review:', error)
    alert('Failed to delete review')
  } finally {
    deletingReviewId.value = null
  }
}

const loadCharacters = async () => {
  try {
    const charactersData = await bookService.getBookCharacters(bookId.value)
    characters.value = charactersData
  } catch (error) {
    console.error('Failed to load characters:', error)
  }
}

const loadCustomProfiles = async () => {
  try {
    loadingProfiles.value = true
    const token = await getToken()
    if (!token) return

    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'}/custom-reviewer-profiles`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })

    if (response.ok) {
      customProfiles.value = await response.json()
    }
  } catch (error) {
    console.error('Failed to load custom profiles:', error)
  } finally {
    loadingProfiles.value = false
  }
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

const getGravatarUrl = (profileName: string) => {
  // Use profile name as input for consistent avatars
  const hash = profileName.toLowerCase().replace(/\s+/g, '')
  // Use identicon style for placeholder avatars
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=40`
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
const getTruncatedText = (text: string, wordLimit: number = 150): { truncated: string; needsTruncation: boolean } => {
  if (!text) return { truncated: '', needsTruncation: false }

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
                      <img
                        :src="getGravatarUrl(review.profile_name)"
                        :alt="review.profile_name"
                        class="w-10 h-10 rounded-full"
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
