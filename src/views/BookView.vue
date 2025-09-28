<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth0 } from '@auth0/auth0-vue'
import { createBookService, createChapterService } from '@/services/api'
import { PlusIcon, DocumentTextIcon, EyeIcon, SparklesIcon, PencilIcon } from '@heroicons/vue/24/outline'
import { CheckCircleIcon } from '@heroicons/vue/24/solid'

interface Chapter {
  id: string
  title: string | null
  word_count: number
  has_summary: boolean
}

const route = useRoute()
const router = useRouter()
const { getAccessTokenSilently } = useAuth0()
const bookId = route.params.id as string

const book = ref<{ id: string; title: string } | null>(null)
const chapters = ref<Chapter[]>([])
const loading = ref(false)

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
  router.push(`/books/${bookId}/chapter-editor?chapterId=${chapterId}`)
}

const viewChapter = (chapterId: string) => {
  router.push(`/books/${bookId}/chapters/${chapterId}`)
}

const generateChapterId = () => {
  const chapterNum = chapters.value.length + 1
  newChapter.value.id = `ch-${chapterNum.toString().padStart(2, '0')}`
}

onMounted(() => {
  loadBook()
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
          <div class="flex items-center justify-between">
            <div class="flex items-center flex-1">
              <DocumentTextIcon class="w-6 h-6 text-gray-400 mr-3" />
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ chapter.title || chapter.id }}
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
</template>