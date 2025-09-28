<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth0 } from '@auth0/auth0-vue'
import { createBookService, createChapterService, createWikiService } from '@/services/api'
import { PlusIcon, DocumentTextIcon, EyeIcon, SparklesIcon, PencilIcon, BookOpenIcon, UserIcon, MapPinIcon, LightBulbIcon } from '@heroicons/vue/24/outline'
import { CheckCircleIcon } from '@heroicons/vue/24/solid'
import MarkdownRenderer from '@/components/MarkdownRenderer.vue'

interface Chapter {
  id: string
  title: string | null
  word_count: number
  has_summary: boolean
  summary: string | null
}

interface WikiPage {
  id: string
  page_name: string
  page_type: 'character' | 'location' | 'concept' | 'other'
  summary: string | null
  aliases: string[]
  tags: string[]
  is_major: boolean
  created_by_ai: boolean
  created_at: string
  updated_at: string
  content_length: number
}

const route = useRoute()
const router = useRouter()
const { getAccessTokenSilently } = useAuth0()
const bookId = route.params.id as string

const book = ref<{ id: string; title: string } | null>(null)
const chapters = ref<Chapter[]>([])
const wikiPages = ref<WikiPage[]>([])
const loading = ref(false)
const loadingWiki = ref(false)
const expandedSummaries = ref<Set<string>>(new Set())

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

const bookService = createBookService(getToken)
const chapterService = createChapterService(getToken)
const wikiService = createWikiService(getToken)

const currentTab = computed(() => {
  return route.query.tab === 'wiki' ? 'wiki' : 'chapters'
})

const sortedChapters = computed(() => {
  return chapters.value.slice().sort((a, b) => {
    // Extract numbers from chapter IDs for natural sorting
    const aNum = parseInt(a.id.replace(/\D/g, '')) || 0
    const bNum = parseInt(b.id.replace(/\D/g, '')) || 0
    return aNum - bNum
  })
})

const loadBook = async () => {
  try {
    // Load book info from localStorage
    const savedBooks = localStorage.getItem('books')
    if (savedBooks) {
      const books = JSON.parse(savedBooks)
      book.value = books.find((b: any) => b.id === bookId)
    }

    if (!book.value) {
      router.push('/books')
      return
    }

    // Load chapters
    const chaptersData = await bookService.getBookChapters(bookId)
    chapters.value = chaptersData
  } catch (error) {
    console.error('Failed to load book:', error)
  }
}

const createNewChapter = () => {
  router.push(`/books/${bookId}/chapter-editor`)
}

const editChapter = (chapterId: string) => {
  router.push(`/books/${bookId}/chapter-editor/${chapterId}`)
}

const viewChapter = (chapterId: string) => {
  router.push(`/books/${bookId}/chapters/${chapterId}`)
}

const loadWiki = async () => {
  if (!book.value) return

  loadingWiki.value = true
  try {
    const wikiData = await wikiService.getBookWiki(book.value.id)
    wikiPages.value = wikiData
  } catch (error) {
    console.error('Failed to load wiki:', error)
  } finally {
    loadingWiki.value = false
  }
}

const wikiPagesByType = computed(() => {
  const grouped = wikiPages.value.reduce((acc, page) => {
    if (!acc[page.page_type]) {
      acc[page.page_type] = []
    }
    acc[page.page_type].push(page)
    return acc
  }, {} as Record<string, WikiPage[]>)

  // Sort each group: major pages first, then alphabetical
  Object.keys(grouped).forEach(type => {
    grouped[type].sort((a, b) => {
      if (a.is_major !== b.is_major) {
        return b.is_major ? 1 : -1
      }
      return a.page_name.localeCompare(b.page_name)
    })
  })

  return grouped
})

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

const toggleSummary = (chapterId: string) => {
  if (expandedSummaries.value.has(chapterId)) {
    expandedSummaries.value.delete(chapterId)
  } else {
    expandedSummaries.value.add(chapterId)
  }
}

const getSummaryPreview = (summary: string, maxLength: number = 100) => {
  if (!summary) return ''
  if (summary.length <= maxLength) return summary

  // Find the last complete sentence within the limit
  const truncated = summary.substring(0, maxLength)
  const lastSentence = truncated.lastIndexOf('.')

  if (lastSentence > 0 && lastSentence > maxLength * 0.6) {
    return truncated.substring(0, lastSentence + 1)
  }

  // If no good sentence break, just truncate at word boundary
  const lastSpace = truncated.lastIndexOf(' ')
  return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...'
}


onMounted(async () => {
  await loadBook()
  await loadWiki()
})
</script>

<template>
  <div class="max-w-6xl mx-auto p-6">
    <!-- Header -->
    <div class="mb-8">
      <nav class="text-sm breadcrumbs mb-4">
        <router-link to="/books" class="text-blue-600 hover:text-blue-700">Books</router-link>
        <span class="mx-2 text-gray-500">></span>
        <span class="text-gray-700 dark:text-gray-300">{{ book?.title || 'Loading...' }}</span>
      </nav>

      <div class="flex justify-between items-center">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">{{ book?.title }}</h1>
          <p class="text-gray-600 dark:text-gray-400 mt-1">{{ chapters.length }} chapters</p>
        </div>
        <button
          @click="createNewChapter"
          class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusIcon class="w-5 h-5 mr-2" />
          New Chapter
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex space-x-1 rounded-xl bg-blue-900/20 p-1 mb-6">
      <router-link
        :to="`/books/${bookId}`"
        :class="[
          'w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-700 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 flex items-center justify-center',
          currentTab === 'chapters'
            ? 'bg-white text-blue-700 shadow'
            : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
        ]"
      >
        <DocumentTextIcon class="w-5 h-5 inline mr-2" />
        Chapters
      </router-link>
      <router-link
        :to="`/books/${bookId}?tab=wiki`"
        :class="[
          'w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-700 ring-white/60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 flex items-center justify-center',
          currentTab === 'wiki'
            ? 'bg-white text-blue-700 shadow'
            : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
        ]"
      >
        <BookOpenIcon class="w-5 h-5 inline mr-2" />
        Wiki
      </router-link>
    </div>

    <!-- Tab Content -->
    <div v-if="currentTab === 'chapters'">
          <!-- Loading state -->
          <div v-if="loading" class="flex justify-center items-center h-64">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>

          <!-- Chapters list -->
          <div v-else-if="chapters.length > 0" class="space-y-4">
      <div
        v-for="chapter in sortedChapters"
        :key="chapter.id"
        class="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700"
      >
        <div class="p-6">
          <div class="flex items-start justify-between">
            <div class="flex items-start flex-1">
              <DocumentTextIcon class="w-6 h-6 text-gray-400 mr-3 mt-0.5" />
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                  <button
                    @click="viewChapter(chapter.id)"
                    class="text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                  >
                    {{ chapter.title || chapter.id }}
                  </button>
                </h3>
                <div class="flex items-center space-x-4 mt-1">
                  <span class="text-sm text-gray-500 dark:text-gray-400">
                    {{ chapter.word_count?.toLocaleString() || 0 }} words
                  </span>
                  <div class="flex items-center">
                    <CheckCircleIcon
                      :class="chapter.has_summary ? 'text-green-500' : 'text-gray-300'"
                      class="w-4 h-4 mr-1"
                    />
                    <span
                      :class="chapter.has_summary ? 'text-green-600' : 'text-gray-500'"
                      class="text-sm"
                    >
                      {{ chapter.has_summary ? 'Summarized' : 'Not summarized' }}
                    </span>
                  </div>
                </div>

                <!-- Summary Preview -->
                <div v-if="chapter.has_summary && chapter.summary" class="mt-3">
                  <div class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    <span v-if="!expandedSummaries.has(chapter.id)">
                      {{ getSummaryPreview(chapter.summary) }}
                      <button
                        @click="toggleSummary(chapter.id)"
                        class="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                      >
                        See more
                      </button>
                    </span>
                    <span v-else>
                      {{ chapter.summary }}
                      <button
                        @click="toggleSummary(chapter.id)"
                        class="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                      >
                        Show less
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex items-center space-x-2">
              <button
                @click="editChapter(chapter.id)"
                class="inline-flex items-center px-3 py-1 text-sm bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
              >
                <PencilIcon class="w-4 h-4 mr-1" />
                Edit
              </button>
              <button
                @click="viewChapter(chapter.id)"
                class="inline-flex items-center px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                <EyeIcon class="w-4 h-4 mr-1" />
                View
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="text-center py-16">
      <DocumentTextIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No chapters yet</h3>
      <p class="text-gray-600 dark:text-gray-400 mb-6">
        Add your first chapter to start getting AI feedback.
      </p>
      <button
        @click="createNewChapter"
        class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <PlusIcon class="w-5 h-5 mr-2" />
        Add First Chapter
      </button>
          </div>
    </div>

    <div v-else-if="currentTab === 'wiki'">
          <!-- Wiki Content -->
          <div v-if="loadingWiki" class="flex justify-center items-center h-64">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>

          <div v-else-if="wikiPages.length > 0" class="space-y-8">
            <div v-for="(pages, type) in wikiPagesByType" :key="type" class="space-y-4">
              <div class="flex items-center space-x-2">
                <component :is="getTypeIcon(type)" :class="['w-6 h-6', getTypeColor(type)]" />
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white capitalize">{{ type }}s</h2>
                <span class="text-sm text-gray-500 dark:text-gray-400">({{ pages.length }})</span>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <router-link
                  v-for="page in pages"
                  :key="page.id"
                  :to="`/books/${bookId}/wiki/${page.id}`"
                  class="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 p-4 block hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer"
                >
                  <div class="flex items-start justify-between mb-2">
                    <div class="flex items-center space-x-2">
                      <h3 class="font-semibold text-gray-900 dark:text-white">{{ page.page_name }}</h3>
                      <span v-if="page.is_major" class="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                        Major
                      </span>
                    </div>
                  </div>

                  <p v-if="page.summary" class="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                    {{ page.summary }}
                  </p>

                  <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>{{ page.content_length ? `${page.content_length} chars` : 'No content' }}</span>
                    <span>Updated {{ new Date(page.updated_at).toLocaleDateString() }}</span>
                  </div>

                  <div v-if="page.tags && page.tags.length > 0" class="flex flex-wrap gap-1 mt-2">
                    <span
                      v-for="tag in page.tags.slice(0, 3)"
                      :key="tag"
                      class="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                    >
                      {{ tag }}
                    </span>
                    <span v-if="page.tags.length > 3" class="text-xs text-gray-500">
                      +{{ page.tags.length - 3 }} more
                    </span>
                  </div>
                </router-link>
              </div>
            </div>
          </div>

          <!-- Empty wiki state -->
          <div v-else class="text-center py-16">
            <BookOpenIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No wiki pages yet</h3>
            <p class="text-gray-600 dark:text-gray-400 mb-6">
              Wiki pages will be automatically created when you generate chapter summaries with character mentions.
            </p>
            <div class="text-sm text-gray-500 dark:text-gray-400">
              💡 Try generating a summary for a chapter to see the wiki in action!
            </div>
          </div>
    </div>
  </div>
</template>
