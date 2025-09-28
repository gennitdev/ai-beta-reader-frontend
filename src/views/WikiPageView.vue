<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth0 } from '@auth0/auth0-vue'
import { createWikiService, createBookService } from '@/services/api'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'
import {
  ArrowLeftIcon,
  PencilIcon,
  ClockIcon,
  UserIcon,
  MapPinIcon,
  LightBulbIcon,
  BookOpenIcon,
  TrashIcon,
  SparklesIcon
} from '@heroicons/vue/24/outline'

interface WikiPage {
  id: string
  book_id: string
  page_name: string
  page_type: 'character' | 'location' | 'concept' | 'other'
  content: string
  summary: string | null
  aliases: string[]
  tags: string[]
  is_major: boolean
  created_by_ai: boolean
  created_at: string
  updated_at: string
}

interface WikiUpdate {
  id: string
  update_type: string
  change_summary: string | null
  contradiction_notes: string | null
  created_at: string
  chapter_title: string | null
}

interface Character {
  id: string
  character_name: string
  wiki_page_id: string | null
  has_wiki_page: boolean
}

const route = useRoute()
const router = useRouter()
const { getAccessTokenSilently } = useAuth0()
const bookId = route.params.bookId as string
const wikiPageId = route.params.wikiPageId as string

// Create authenticated service
const getToken = async () => {
  try {
    return await getAccessTokenSilently()
  } catch (error) {
    console.warn('Failed to get access token:', error)
    return undefined
  }
}

const wikiService = createWikiService(getToken)
const bookService = createBookService(getToken)

const wikiPage = ref<WikiPage | null>(null)
const wikiHistory = ref<WikiUpdate[]>([])
const characters = ref<Character[]>([])
const bookTitle = ref<string>('')
const loading = ref(false)
const loadingHistory = ref(false)
const showHistory = ref(false)
const isEditing = ref(false)
const editedContent = ref('')

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'character': return UserIcon
    case 'location': return MapPinIcon
    case 'concept': return LightBulbIcon
    default: return BookOpenIcon
  }
}

const getTypeColor = (type: string) => {
  switch (type) {
    case 'character': return 'text-blue-600'
    case 'location': return 'text-green-600'
    case 'concept': return 'text-purple-600'
    default: return 'text-gray-600'
  }
}

const loadBookTitle = async () => {
  try {
    // Load book info from localStorage first (faster)
    const savedBooks = localStorage.getItem('books')
    if (savedBooks) {
      const books = JSON.parse(savedBooks)
      const book = books.find((b: any) => b.id === bookId)
      if (book) {
        bookTitle.value = book.title
        return
      }
    }

    // Fallback to bookId if not found in localStorage
    bookTitle.value = bookId
  } catch (error) {
    console.error('Failed to load book title:', error)
    bookTitle.value = bookId
  }
}

const loadWikiPage = async () => {
  loading.value = true
  try {
    const pageData = await wikiService.getWikiPage(wikiPageId)
    wikiPage.value = pageData
    editedContent.value = pageData.content
  } catch (error) {
    console.error('Failed to load wiki page:', error)
    router.push(`/books/${bookId}`)
  } finally {
    loading.value = false
  }
}

const loadCharacters = async () => {
  try {
    const charactersData = await bookService.getBookCharacters(bookId)
    characters.value = charactersData
  } catch (error) {
    console.error('Failed to load characters:', error)
  }
}

const loadWikiHistory = async () => {
  if (!wikiPage.value || loadingHistory.value) return

  loadingHistory.value = true
  try {
    const historyData = await wikiService.getWikiPageHistory(wikiPageId)
    wikiHistory.value = historyData
  } catch (error) {
    console.error('Failed to load wiki history:', error)
  } finally {
    loadingHistory.value = false
  }
}

const saveChanges = async () => {
  if (!wikiPage.value || editedContent.value === wikiPage.value.content) return

  try {
    await wikiService.updateWikiPage(wikiPageId, {
      content: editedContent.value
    })

    wikiPage.value.content = editedContent.value
    wikiPage.value.updated_at = new Date().toISOString()
    isEditing.value = false

    // Reload history to show the update
    if (showHistory.value) {
      await loadWikiHistory()
    }
  } catch (error) {
    console.error('Failed to save wiki page:', error)
    alert('Failed to save changes')
  }
}

const cancelEdit = () => {
  if (!wikiPage.value) return
  editedContent.value = wikiPage.value.content
  isEditing.value = false
}

const goBack = () => {
  router.push(`/books/${bookId}?tab=wiki`)
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

const toggleHistory = () => {
  showHistory.value = !showHistory.value
  if (showHistory.value && wikiHistory.value.length === 0) {
    loadWikiHistory()
  }
}

onMounted(() => {
  loadBookTitle()
  loadWikiPage()
  loadCharacters()
})
</script>

<template>
  <div class="max-w-6xl mx-auto p-6">
    <!-- Header -->
    <div class="mb-8">
      <nav class="text-sm breadcrumbs mb-4">
        <router-link to="/books" class="text-blue-600 hover:text-blue-700">Books</router-link>
        <span class="mx-2 text-gray-500">></span>
        <router-link :to="`/books/${bookId}?tab=wiki`" class="text-blue-600 hover:text-blue-700">
          {{ bookTitle || 'Loading...' }}
        </router-link>
        <span class="mx-2 text-gray-500">></span>
        <span class="text-gray-700 dark:text-gray-300">{{ wikiPage?.page_name || 'Loading...' }}</span>
      </nav>

      <div class="flex justify-between items-start">
        <div class="flex items-center space-x-4">
          <button
            @click="goBack"
            class="lg:hidden p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowLeftIcon class="w-5 h-5" />
          </button>

          <div v-if="wikiPage" class="flex items-center space-x-3">
            <component :is="getTypeIcon(wikiPage.page_type)" :class="['w-8 h-8', getTypeColor(wikiPage.page_type)]" />
            <div>
              <h1 class="text-3xl font-bold text-gray-900 dark:text-white">{{ wikiPage.page_name }}</h1>
              <div class="flex items-center space-x-3 mt-1">
                <span class="text-sm text-gray-500 dark:text-gray-400 capitalize">{{ wikiPage.page_type }}</span>
                <span v-if="wikiPage.is_major" class="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                  Major
                </span>
                <span v-if="wikiPage.created_by_ai" class="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full flex items-center">
                  <SparklesIcon class="w-2.5 h-2.5 mr-1" />
                  AI Created
                </span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="wikiPage" class="flex items-center space-x-3">
          <button
            @click="toggleHistory"
            class="inline-flex items-center px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <ClockIcon class="w-4 h-4 mr-1" />
            {{ showHistory ? 'Hide' : 'Show' }} History
          </button>

          <template v-if="isEditing">
            <button
              @click="cancelEdit"
              class="px-3 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              @click="saveChanges"
              class="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Save Changes
            </button>
          </template>
          <template v-else>
            <button
              @click="isEditing = true"
              class="inline-flex items-center px-3 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
            >
              <PencilIcon class="w-4 h-4 mr-1" />
              Edit
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="flex justify-center items-center h-64">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>

    <div v-else-if="wikiPage" class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Main content -->
      <div class="lg:col-span-2">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div class="p-6">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Content</h2>

            <div v-if="isEditing" class="space-y-4">
              <textarea
                v-model="editedContent"
                rows="20"
                class="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                placeholder="Enter wiki content in Markdown format..."
              />
              <p class="text-sm text-gray-500 dark:text-gray-400">
                💡 Use Markdown formatting for headers, lists, bold text, etc.
              </p>
            </div>

            <div v-else-if="wikiPage.content" class="prose prose-gray dark:prose-invert max-w-none">
              <MarkdownRenderer
                :text="wikiPage.content"
                :characters="characters"
                :book-id="bookId"
                :enable-wiki-links="true"
              />
            </div>

            <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
              <BookOpenIcon class="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No content yet. Click "Edit" to add information about {{ wikiPage.page_name }}.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Page Info -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div class="p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Page Info</h3>

            <div class="space-y-3 text-sm">
              <div>
                <span class="font-medium text-gray-300 ">Type:</span>
                <span class="ml-2 capitalize text-gray-400 dark:text-gray-100">{{ wikiPage.page_type }}</span>
              </div>

              <div v-if="wikiPage.summary">
                <span class="font-medium text-gray-700 dark:text-gray-300">Summary:</span>
                <p class="mt-1 text-gray-600 dark:text-gray-400">{{ wikiPage.summary }}</p>
              </div>

              <div v-if="wikiPage.aliases && wikiPage.aliases.length">
                <span class="font-medium text-gray-700 dark:text-gray-300">Aliases:</span>
                <div class="flex flex-wrap gap-1 mt-1">
                  <span
                    v-for="alias in wikiPage.aliases"
                    :key="alias"
                    class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded"
                  >
                    {{ alias }}
                  </span>
                </div>
              </div>

              <div v-if="wikiPage.tags && wikiPage.tags.length">
                <span class="font-medium text-gray-700 dark:text-gray-300">Tags:</span>
                <div class="flex flex-wrap gap-1 mt-1">
                  <span
                    v-for="tag in wikiPage.tags"
                    :key="tag"
                    class="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>

              <div>
                <span class="font-medium text-gray-300 dark:text-gray-300">Created:</span>
                <span class="ml-2 text-gray-400 dark:text-gray-100">{{ formatDate(wikiPage.created_at) }}</span>
              </div>

              <div>
                <span class="font-medium text-gray-300 dark:text-gray-300">Updated:</span>
                <span class="ml-2 text-gray-400 dark:text-gray-100">{{ formatDate(wikiPage.updated_at) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- History -->
        <div v-if="showHistory" class="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
          <div class="p-6">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Change History</h3>

            <div v-if="loadingHistory" class="flex justify-center py-4">
              <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>

            <div v-else-if="wikiHistory.length > 0" class="space-y-3">
              <div
                v-for="update in wikiHistory"
                :key="update.id"
                class="border-l-4 border-blue-200 pl-4 py-2"
              >
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium capitalize text-gray-900 dark:text-white">
                    {{ update.update_type.replace('_', ' ') }}
                  </span>
                  <span class="text-xs text-gray-500">{{ formatDate(update.created_at) }}</span>
                </div>

                <p v-if="update.change_summary" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {{ update.change_summary }}
                </p>

                <p v-if="update.chapter_title" class="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  From chapter: {{ update.chapter_title }}
                </p>

                <div v-if="update.contradiction_notes" class="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm">
                  <strong class="text-yellow-800 dark:text-yellow-200">Contradiction noted:</strong>
                  <p class="text-yellow-700 dark:text-yellow-300">{{ update.contradiction_notes }}</p>
                </div>
              </div>
            </div>

            <div v-else class="text-center py-4 text-gray-500 dark:text-gray-400">
              No changes recorded yet.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
