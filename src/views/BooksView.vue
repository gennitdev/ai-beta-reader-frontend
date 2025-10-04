<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useBooks, type Book } from '@/composables/useBooks'
import { PlusIcon, BookOpenIcon, ExclamationTriangleIcon } from '@heroicons/vue/24/outline'

const router = useRouter()
const showCreateModal = ref(false)
const newBook = ref({ id: '', title: '' })

// Use local database instead of API
const { books, loading, error, loadBooks, createBook } = useBooks()

const createBookHandler = async () => {
  if (!newBook.value.id || !newBook.value.title) return

  try {
    await createBook(newBook.value)
    await loadBooks() // Refresh the list

    newBook.value = { id: '', title: '' }
    showCreateModal.value = false
  } catch (error) {
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
          <div class="mt-4 flex justify-end items-center">
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
          <div v-if="error" class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
            <div class="flex">
              <div class="flex-shrink-0">
                <ExclamationTriangleIcon class="h-5 w-5 text-red-400" />
              </div>
              <div class="ml-3">
                <h3 class="text-sm font-medium text-red-800 dark:text-red-200">
                  Failed to create book
                </h3>
                <div class="mt-2 text-sm text-red-700 dark:text-red-300">
                  <p>{{ error || 'An unexpected error occurred' }}</p>
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
              :disabled="!newBook.title || !newBook.id || loading"
              class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
            >
              <div v-if="loading" class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              {{ loading ? 'Creating...' : 'Create Book' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>