<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { logger } from '@/lib/logger'
import { useRouter } from 'vue-router'
import { useBooks, type Book } from '@/composables/useBooks'
import { useImageLibrary } from '@/composables/useImageLibrary'
import { useDatabase } from '@/composables/useDatabase'
import { useLibraryBundleImport } from '@/composables/useLibraryBundleImport'
import LibraryBundleImport from '@/components/LibraryBundleImport.vue'
import { PlusIcon, BookOpenIcon, DocumentArrowUpIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import ExampleDisabledControl from '@/components/ExampleDisabledControl.vue'
import { useLibraryContext } from '@/composables/useLibraryContext'

const router = useRouter()
const { booksPath, readOnly, readOnlyReason } = useLibraryContext()
const showCreateModal = ref(false)
const showImportModal = ref(false)
const newBook = ref({ id: '', title: '' })
const importedBookIds = ref<string[]>([])

// Use local database instead of API
const { books, loading, error, loadBooks, createBook } = useBooks()
const { exportDatabase, importDatabaseBackup } = useDatabase()
const { canStoreImages, fetchBookCover, getImageSource, getImageBlob } = useImageLibrary()
const bookCoverSources = ref<Record<string, string>>({})
const coverRefreshError = ref<string | null>(null)

const {
  plan: importPlan,
  bundleExportedAt,
  importFileName,
  importError,
  importMessage,
  isPreviewing,
  isApplying,
  isPreparingReplace,
  isReplacing,
  recoveries,
  preparedRecovery,
  replaceRemovalCounts,
  previewFile,
  previewDirectory,
  resolveConflict,
  applyChanges,
  resetImport,
} = useLibraryBundleImport({
  exportDatabase,
  importDatabaseBackup,
  getImageBlob,
  intent: 'add-or-update-books',
})

const importApplyLabel = computed(() => {
  const newBooks = importPlan.value?.operations.filter(
    (operation) => operation.entityType === 'book' && operation.kind === 'create',
  ).length ?? 0
  if (newBooks === 1) return 'Import book'
  if (newBooks > 1) return `Import ${newBooks} books`
  return 'Apply book updates'
})

const importBusy = computed(() => isPreviewing.value || isApplying.value)

const openImportModal = () => {
  resetImport()
  importedBookIds.value = []
  showImportModal.value = true
}

const closeImportModal = () => {
  if (importBusy.value) return
  showImportModal.value = false
  resetImport()
  importedBookIds.value = []
}

const applyBookImport = async () => {
  const importedIds = await applyChanges()
  if (!importedIds.length) return
  importedBookIds.value = importedIds
  await loadBooks()
  await refreshCoverSources()
}

const openImportedBook = () => {
  const bookId = importedBookIds.value[0]
  if (!bookId) return
  showImportModal.value = false
  router.push(`/books/${bookId}`)
}

const createBookHandler = async () => {
  if (!newBook.value.id || !newBook.value.title) return

  try {
    await createBook(newBook.value)
    await loadBooks() // Refresh the list
    await refreshCoverSources()

    newBook.value = { id: '', title: '' }
    showCreateModal.value = false
  } catch (error) {
    console.error('Failed to create book:', error)
  }
}

const refreshCoverSources = async () => {
  logger.log('[BooksView] refreshCoverSources called for', books.value.length, 'books')
  coverRefreshError.value = null
  const nextSources: Record<string, string> = {}
  for (const book of books.value) {
    try {
      const asset = await fetchBookCover(book.id)
      logger.log('[BooksView] Book', book.id, 'cover asset:', asset ? { id: asset.id, hasImageData: !!asset.image_data } : null)
      if (asset) {
        nextSources[book.id] = await getImageSource(asset)
      }
    } catch (err) {
      console.warn('Failed to load cover for', book.id, err)
      coverRefreshError.value = 'Some covers could not be loaded.'
    }
  }
  logger.log('[BooksView] Loaded', Object.keys(nextSources).length, 'cover sources')
  bookCoverSources.value = nextSources
}

const viewBook = (bookId: string) => {
  router.push(`${booksPath}/${bookId}`)
}

const generateBookId = () => {
  const title = newBook.value.title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 20)

  newBook.value.id = title + '-' + Date.now().toString(36)
}

const getChapterCount = (book: Book): number => {
  if (!book.chapter_order) return 0
  try {
    const chapters = JSON.parse(book.chapter_order)
    return Array.isArray(chapters) ? chapters.length : 0
  } catch {
    return 0
  }
}

onMounted(async () => {
  await loadBooks()
  await refreshCoverSources()
})

watch(
  () => canStoreImages.value,
  async () => {
    await refreshCoverSources()
  }
)

watch(
  () => books.value.map((book) => `${book.id}:${book.cover_image_id ?? ''}`).join('|'),
  async () => {
    await refreshCoverSources()
  }
)
</script>

<template>
  <div class="mx-auto max-w-7xl p-4 sm:p-6">
    <div class="mb-6 flex items-center justify-between gap-3 sm:mb-8">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">My Books</h1>
      <div class="flex flex-wrap justify-end gap-2">
        <template v-if="readOnly">
          <ExampleDisabledControl :explanation="readOnlyReason">
            <button disabled class="inline-flex cursor-not-allowed items-center rounded-lg border border-gold-600 px-4 py-2 text-gold-700 opacity-60 dark:text-gold-300">
              <DocumentArrowUpIcon class="mr-2 h-5 w-5" /> Import Bundle
            </button>
          </ExampleDisabledControl>
          <ExampleDisabledControl :explanation="readOnlyReason">
            <button disabled class="inline-flex cursor-not-allowed items-center rounded-lg bg-gold-600 px-4 py-2 text-white opacity-60">
              <PlusIcon class="mr-2 h-5 w-5" /> New Book
            </button>
          </ExampleDisabledControl>
        </template>
        <template v-else>
          <button
            @click="openImportModal"
            class="inline-flex items-center rounded-lg border border-gold-600 px-4 py-2 text-gold-700 transition-colors hover:bg-gold-50 dark:text-gold-300 dark:hover:bg-gold-900/20"
          >
            <DocumentArrowUpIcon class="mr-2 h-5 w-5" /> Import Bundle
          </button>
          <button
            @click="showCreateModal = true"
            class="inline-flex items-center rounded-lg bg-gold-600 px-4 py-2 text-white transition-colors hover:bg-gold-700"
          >
            <PlusIcon class="mr-2 h-5 w-5" /> New Book
          </button>
        </template>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="flex justify-center items-center h-64">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gold-600"></div>
    </div>

    <p
      v-if="coverRefreshError"
      class="mb-4 text-sm text-amber-600 dark:text-amber-400"
    >
      {{ coverRefreshError }}
    </p>

    <!-- Books grid -->
    <div
      v-else-if="books.length > 0"
      data-testid="books-grid"
      class="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5"
    >
      <div
        v-for="book in books"
        :key="book.id"
        data-testid="book-card"
        class="relative cursor-pointer overflow-hidden rounded-lg shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
        @click="viewBook(book.id)"
      >
        <!-- Cover image or gradient fallback -->
        <div
          v-if="bookCoverSources[book.id]"
          class="aspect-[2/3] w-full overflow-hidden bg-gray-100 dark:bg-gray-700"
        >
          <img
            :src="bookCoverSources[book.id]"
            class="h-full w-full object-cover"
            :alt="`${book.title} cover`"
          />
        </div>
        <div
          v-else
          class="flex aspect-[2/3] w-full items-center justify-center bg-gradient-to-br from-gold-100 via-indigo-50 to-purple-100 dark:from-gold-900/40 dark:via-indigo-900/30 dark:to-purple-900/40"
        >
          <BookOpenIcon class="h-10 w-10 text-gold-300 opacity-60 dark:text-gold-600 sm:h-12 sm:w-12" />
        </div>

        <!-- Overlaid metadata with gradient background -->
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 py-3 pt-10">
          <h3 class="truncate text-sm font-semibold text-white drop-shadow-md sm:text-base">
            {{ book.title }}
          </h3>
          <p class="mt-0.5 text-xs text-gray-200 sm:text-sm">
            {{ getChapterCount(book) }} chapter{{ getChapterCount(book) !== 1 ? 's' : '' }}
          </p>
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
        v-if="!readOnly"
        @click="showCreateModal = true"
        class="inline-flex items-center px-4 py-2 bg-gold-600 text-white rounded-lg hover:bg-gold-700 transition-colors"
      >
        <PlusIcon class="w-5 h-5 mr-2" />
        Create Your First Book
      </button>
      <div v-if="!readOnly" class="mt-3">
        <button
          class="inline-flex items-center text-sm font-semibold text-gold-700 hover:underline dark:text-gold-300"
          @click="openImportModal"
        >
          <DocumentArrowUpIcon class="mr-1.5 h-4 w-4" /> Import a book bundle
        </button>
      </div>
      <div class="mt-4">
        <router-link
          to="/example-books"
          class="inline-flex items-center text-sm font-semibold text-gold-700 hover:underline dark:text-gold-300"
        >
          Explore the read-only example story →
        </router-link>
      </div>
    </div>

    <!-- Import bundle modal -->
    <div
      v-if="showImportModal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-bundle-import-title"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="closeImportModal"
    >
      <div class="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-white shadow-2xl dark:bg-navy-900">
        <div class="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-navy-900">
          <div>
            <h2 id="book-bundle-import-title" class="text-xl font-semibold text-gray-900 dark:text-white">Import books from a bundle</h2>
            <p class="text-sm text-gray-600 dark:text-gray-400">Add a new book or apply Git-compatible updates to one you already imported.</p>
          </div>
          <button
            type="button"
            aria-label="Close import dialog"
            :disabled="importBusy"
            class="rounded p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-navy-800"
            @click="closeImportModal"
          >
            <XMarkIcon class="h-6 w-6" />
          </button>
        </div>

        <div v-if="importedBookIds.length" class="p-8 text-center">
          <BookOpenIcon class="mx-auto h-14 w-14 text-green-600" />
          <h3 class="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Bundle imported successfully</h3>
          <p class="mt-2 text-gray-600 dark:text-gray-300">
            {{ importedBookIds.length === 1 ? 'Your book is ready to edit.' : `${importedBookIds.length} books are ready to edit.` }}
          </p>
          <div class="mt-6 flex justify-center gap-3">
            <button class="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 dark:border-gray-600 dark:text-gray-200" @click="closeImportModal">Done</button>
            <button v-if="importedBookIds.length === 1" class="rounded-lg bg-gold-600 px-4 py-2 font-medium text-white hover:bg-gold-700" @click="openImportedBook">Open book</button>
          </div>
        </div>

        <LibraryBundleImport
          v-else
          embedded
          heading="Choose a Beta Bot bundle"
          description="Preview a ZIP or bundle folder before adding or updating its books. Nothing changes until you confirm."
          :apply-label="importApplyLabel"
          :show-replace="false"
          :show-recoveries="false"
          :plan="importPlan"
          :exported-at="bundleExportedAt"
          :file-name="importFileName"
          :error="importError"
          :message="importMessage"
          :is-previewing="isPreviewing"
          :is-applying="isApplying"
          :is-preparing-replace="isPreparingReplace"
          :is-replacing="isReplacing"
          :recoveries="recoveries"
          :prepared-recovery="preparedRecovery"
          :replace-removal-counts="replaceRemovalCounts"
          @select="previewFile"
          @select-directory="previewDirectory"
          @resolve="resolveConflict"
          @apply="applyBookImport"
        />
      </div>
    </div>

    <!-- Create book modal -->
    <div v-if="showCreateModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white dark:bg-navy-800 rounded-lg p-6 w-full max-w-md mx-4">
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
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gold-500 focus:border-transparent"
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
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-gold-500 focus:border-transparent"
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
              class="px-4 py-2 bg-gold-600 text-white rounded-md hover:bg-gold-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
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
