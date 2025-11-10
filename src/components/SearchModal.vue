<template>
  <Modal :show="show" title="Search and Replace" max-width="4xl" @close="$emit('close')">
    <!-- Search input -->
    <div class="p-6">
      <div class="flex gap-4 mb-6">
        <div class="flex-1">
          <label for="search-input" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Search term
          </label>
          <input
            id="search-input"
            v-model="searchTerm"
            @input="performSearch"
            type="text"
            ref="searchInputRef"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="Enter text to search for..."
          />
        </div>
        <div class="flex-1">
          <label for="replace-input" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Replace with
          </label>
          <input
            id="replace-input"
            v-model="replaceTerm"
            type="text"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            placeholder="Enter replacement text..."
          />
        </div>
      </div>

      <!-- Loading state -->
      <div v-if="isSearching" class="text-center py-8">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">Searching...</p>
      </div>

      <!-- No results -->
      <div v-else-if="searchTerm && !isSearching && searchResults.chapters.length === 0 && searchResults.wikiPages.length === 0" class="text-center py-8">
        <p class="text-gray-500 dark:text-gray-400">No results found for "{{ searchTerm }}"</p>
      </div>

      <!-- Search results -->
      <div v-else-if="searchResults.chapters.length > 0 || searchResults.wikiPages.length > 0">
        <!-- Chapter results -->
        <div v-if="searchResults.chapters.length > 0" class="mb-8">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Chapters ({{ searchResults.chapters.length }})
          </h3>
          <div class="space-y-4">
            <div
              v-for="chapter in searchResults.chapters"
              :key="chapter.id"
              class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div class="flex justify-between items-start mb-2">
                <div>
                  <h4 class="font-medium text-gray-900 dark:text-white">
                    <button
                      @click="navigateToChapter(chapter.id)"
                      class="hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors text-left cursor-pointer"
                      title="Click to open chapter"
                    >
                      <HighlightedText
                        :text="chapter.title || `Chapter ${chapter.position || 'Untitled'}`"
                        :search-input="searchTerm"
                      />
                    </button>
                  </h4>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ chapter.word_count || 0 }} words
                  </p>
                  <p
                    v-if="includesSearchTerm(chapter.title) && !includesSearchTerm(chapter.text)"
                    class="text-xs text-amber-600 dark:text-amber-400 mt-1"
                  >
                    Match found in title
                  </p>
                </div>
                <button
                  v-if="replaceTerm"
                  @click="replaceInChapter(chapter.id)"
                  :disabled="replacingItemId !== null"
                  class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {{ replacingItemId === chapter.id ? 'Replacing...' : 'Replace' }}
                </button>
              </div>
              <div class="text-sm text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                <HighlightedText :text="getTextPreview(chapter.text)" :search-input="searchTerm" />
              </div>
            </div>
          </div>
        </div>

        <!-- Wiki page results -->
        <div v-if="searchResults.wikiPages.length > 0">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Wiki Pages ({{ searchResults.wikiPages.length }})
          </h3>
          <div class="space-y-4">
            <div
              v-for="wikiPage in searchResults.wikiPages"
              :key="wikiPage.id"
              class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div class="flex justify-between items-start mb-2">
                <div>
                  <h4 class="font-medium text-gray-900 dark:text-white">
                    <button
                      @click="navigateToWikiPage(wikiPage.id)"
                      class="hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors text-left cursor-pointer"
                      title="Click to open wiki page"
                    >
                      <HighlightedText :text="wikiPage.page_name" :search-input="searchTerm" />
                    </button>
                  </h4>
                  <p class="text-sm text-gray-500 dark:text-gray-400 capitalize">
                    {{ wikiPage.page_type || 'other' }}
                  </p>
                </div>
                <button
                  v-if="replaceTerm"
                  @click="replaceInWikiPage(wikiPage.id)"
                  :disabled="replacingItemId !== null"
                  class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {{ replacingItemId === wikiPage.id ? 'Replacing...' : 'Replace' }}
                </button>
              </div>
              <div class="text-sm text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                <div v-if="wikiPage.summary" class="mb-2">
                  <strong>Summary:</strong>
                  <HighlightedText :text="getTextPreview(wikiPage.summary)" :search-input="searchTerm" />
                </div>
                <div v-if="wikiPage.content">
                  <strong>Content:</strong>
                  <HighlightedText :text="getTextPreview(wikiPage.content)" :search-input="searchTerm" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <button
          @click="$emit('close')"
          class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          Close
        </button>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Modal from './Modal.vue'
import HighlightedText from './HighlightedText.vue'

interface SearchService {
  searchBook: (bookId: string, query: string) => Promise<{ chapters: any[]; wikiPages: any[] }>
  replaceInChapter: (chapterId: string, searchTerm: string, replaceTerm: string) => Promise<any>
  replaceInWikiPage: (wikiPageId: string, searchTerm: string, replaceTerm: string) => Promise<any>
}

interface Props {
  show: boolean
  bookId: string
  searchService: SearchService
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  refresh: []
}>()

const router = useRouter()

const searchTerm = ref('')
const replaceTerm = ref('')
const isSearching = ref(false)
const replacingItemId = ref<string | null>(null) // Track which specific item is being replaced
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchResults = ref<{
  chapters: Array<{
    id: string
    title: string
    text: string
    word_count: number
    position: number
  }>
  wikiPages: Array<{
    id: string
    page_name: string
    content: string
    summary: string
    page_type: string
  }>
}>({
  chapters: [],
  wikiPages: []
})

let searchTimeout: NodeJS.Timeout | null = null

const performSearch = () => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }

  searchTimeout = setTimeout(async () => {
    if (!searchTerm.value.trim()) {
      searchResults.value = { chapters: [], wikiPages: [] }
      return
    }

    isSearching.value = true
    try {
      const results = await props.searchService.searchBook(props.bookId, searchTerm.value)
      searchResults.value = results
    } catch (error) {
      console.error('Search error:', error)
      searchResults.value = { chapters: [], wikiPages: [] }
    } finally {
      isSearching.value = false
    }
  }, 300)
}

const replaceInChapter = async (chapterId: string) => {
  if (!replaceTerm.value || !searchTerm.value) return

  replacingItemId.value = chapterId
  try {
    await props.searchService.replaceInChapter(chapterId, searchTerm.value, replaceTerm.value)
    // Refresh search results
    await performSearch()
    emit('refresh')
  } catch (error) {
    console.error('Replace error:', error)
  } finally {
    replacingItemId.value = null
  }
}

const replaceInWikiPage = async (wikiPageId: string) => {
  if (!replaceTerm.value || !searchTerm.value) return

  replacingItemId.value = wikiPageId
  try {
    await props.searchService.replaceInWikiPage(wikiPageId, searchTerm.value, replaceTerm.value)
    // Refresh search results
    await performSearch()
    emit('refresh')
  } catch (error) {
    console.error('Replace error:', error)
  } finally {
    replacingItemId.value = null
  }
}

const navigateToChapter = (chapterId: string) => {
  emit('close')
  router.push(`/books/${props.bookId}/chapters/${chapterId}`)
}

const navigateToWikiPage = (wikiPageId: string) => {
  emit('close')
  router.push(`/books/${props.bookId}/wiki/${wikiPageId}`)
}

const getTextPreview = (text: string): string => {
  if (!text) return ''

  const searchIndex = text.toLowerCase().indexOf(searchTerm.value.toLowerCase())
  if (searchIndex === -1) return text.substring(0, 200) + (text.length > 200 ? '...' : '')

  const start = Math.max(0, searchIndex - 100)
  const end = Math.min(text.length, searchIndex + 200)
  const preview = text.substring(start, end)

  return (start > 0 ? '...' : '') + preview + (end < text.length ? '...' : '')
}

const includesSearchTerm = (value?: string | null): boolean => {
  if (!value || !searchTerm.value) return false
  return value.toLowerCase().includes(searchTerm.value.toLowerCase())
}

watch(() => props.show, async (newValue) => {
  if (newValue) {
    await nextTick()
    searchInputRef.value?.focus()
  } else {
    searchTerm.value = ''
    replaceTerm.value = ''
    searchResults.value = { chapters: [], wikiPages: [] }
  }
})
</script>
