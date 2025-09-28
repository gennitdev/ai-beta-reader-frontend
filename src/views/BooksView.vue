<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth0 } from '@auth0/auth0-vue'
import { createBookService } from '@/services/api'
import { useBooks } from '@/composables/useBooks'
import { PlusIcon, BookOpenIcon, ExclamationTriangleIcon } from '@heroicons/vue/24/outline'

interface Book {
  id: string
  title: string
  chapter_count?: number
  total_word_count?: number
  created_at?: string
  updated_at?: string
}

const router = useRouter()
const { getAccessTokenSilently } = useAuth0()
const books = ref<Book[]>([])
const loading = ref(false)
const showCreateModal = ref(false)
const newBook = ref({ id: '', title: '' })

// Create authenticated service
const getToken = async () => {
  try {
    return await getAccessTokenSilently()
  } catch (error) {
    console.warn('Failed to get access token:', error)
    return undefined
  }
}

const bookService = createBookService(getToken)

// Use TanStack Query for book operations
const { createBook } = useBooks()

const loadBooks = async () => {
  loading.value = true
  try {
    // Fetch books from backend
    const booksData = await bookService.getBooks()
    books.value = booksData

    // Also sync with localStorage for backward compatibility
    const booksSummary = booksData.map((book: Book) => ({
      id: book.id,
      title: book.title
    }))
    localStorage.setItem('books', JSON.stringify(booksSummary))
  } catch (error) {
    console.error('Failed to load books:', error)
    // Fall back to localStorage if API fails
    const savedBooks = localStorage.getItem('books')
    if (savedBooks) {
      books.value = JSON.parse(savedBooks)
    }
  } finally {
    loading.value = false
  }
}

const createBookHandler = async () => {
  if (!newBook.value.id || !newBook.value.title) return

  try {
    await createBook.mutateAsync(newBook.value)

    // Reload books from backend to get updated list with chapter counts
    await loadBooks()

    newBook.value = { id: '', title: '' }
    showCreateModal.value = false
  } catch (error) {
    // Error handling is done in the mutation, but we can add UI feedback here
    console.error('Failed to create book:', error)
  }
}

const viewBook = (bookId: string) => {
  router.push(`/books/${bookId}`)
}

const generateBookId = () => {
  const title = newBook.value.title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 20)

  newBook.value.id = title + '-' + Date.now().toString(36)
}

const formatWordCount = (count?: number) => {
  if (!count) return '0'
  if (count < 1000) return count.toString()
  return (count / 1000).toFixed(1) + 'k'
}

onMounted(() => {
  loadBooks()
})
</script>

<template>
  <div class="max-w-6xl mx-auto p-6">
    <div class="flex justify-between items-center mb-8">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">My Books</h1>
      <button
        @click="showCreateModal = true"
        class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <PlusIcon class="w-5 h-5 mr-2" />
        New Book
      </button>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="flex justify-center items-center h-64">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>

    <!-- Books grid -->
    <div v-else-if="books.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="book in books"
        :key="book.id"
        class="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow cursor-pointer border border-gray-200 dark:border-gray-700"
        @click="viewBook(book.id)"
      >
        <div class="p-6">
          <div class="flex items-center mb-4">
            <BookOpenIcon class="w-8 h-8 text-blue-600 mr-3" />
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white truncate">
              {{ book.title }}
            </h3>
          </div>
          <p class="text-gray-600 dark:text-gray-400 text-sm">
            ID: {{ book.id }}
          </p>
          <div class="mt-4 flex justify-between items-center">
            <span class="text-sm text-gray-500 dark:text-gray-400">
              {{ book.chapter_count || 0 }} chapters · {{ formatWordCount(book.total_word_count) }} words
            </span>
            <span class="text-blue-600 hover:text-blue-700 text-sm font-medium">
              Open →
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="text-center py-16">
      <BookOpenIcon class="w-16 h-16 text-gray-400 mx-auto mb-4" />
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No books yet</h3>
      <p class="text-gray-600 dark:text-gray-400 mb-6">
        Create your first book to start getting AI feedback on your chapters.
      </p>
      <button
        @click="showCreateModal = true"
        class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <PlusIcon class="w-5 h-5 mr-2" />
        Create Your First Book
      </button>
    </div>

    <!-- Create book modal -->
    <div v-if="showCreateModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Create New Book</h2>

        <form @submit.prevent="createBookHandler" class="space-y-4">
          <div>
            <label for="title" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              id="title"
              v-model="newBook.title"
              @input="generateBookId"
              type="text"
              required
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter book title"
            />
          </div>

          <div>
            <label for="id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Book ID
            </label>
            <input
              id="id"
              v-model="newBook.id"
              type="text"
              required
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="unique-book-id"
            />
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Auto-generated from title. Must be unique.
            </p>
          </div>

          <!-- Error display -->
          <div v-if="createBook.error.value" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
            <div class="flex">
              <div class="flex-shrink-0">
                <ExclamationTriangleIcon class="h-5 w-5 text-red-400" />
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-red-800 dark:text-red-200">
                  Failed to create book
                </h3>
                <div class="mt-2 text-sm text-red-700 dark:text-red-300">
                  <p>{{ createBook.error.value?.message || 'An unexpected error occurred' }}</p>
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              @click="showCreateModal = false"
              class="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="!newBook.title || !newBook.id || createBook.isPending.value"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
            >
              <div v-if="createBook.isPending.value" class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              {{ createBook.isPending.value ? 'Creating...' : 'Create Book' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>