import { ref, onMounted } from 'vue'
import { db, type Book, type Chapter } from '@/lib/database'
import { CloudSync, GoogleDriveProvider } from '@/lib/cloudSync'

const isInitialized = ref(false)
const cloudSync = ref<CloudSync | null>(null)

// Initialize database once on app load
export async function initializeDatabase() {
  if (isInitialized.value) return

  await db.init()

  // Initialize Google Drive sync if credentials are available
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (clientId) {
    const provider = new GoogleDriveProvider(clientId)
    cloudSync.value = new CloudSync(provider)
  }

  isInitialized.value = true
}

export function useDatabase() {
  const books = ref<Book[]>([])
  const chapters = ref<Chapter[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  onMounted(async () => {
    await initializeDatabase()
  })

  // Book operations
  async function loadBooks() {
    try {
      loading.value = true
      error.value = null
      await initializeDatabase() // Ensure DB is initialized
      books.value = await db.getBooks()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load books'
      console.error('Load books error:', e)
    } finally {
      loading.value = false
    }
  }

  async function saveBook(book: Book) {
    try {
      loading.value = true
      error.value = null
      await initializeDatabase() // Ensure DB is initialized
      await db.saveBook(book)
      await loadBooks() // Refresh list
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to save book'
      console.error('Save book error:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // Chapter operations
  async function loadChapters(bookId: string) {
    try {
      loading.value = true
      error.value = null
      await initializeDatabase() // Ensure DB is initialized
      chapters.value = await db.getChapters(bookId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load chapters'
      console.error('Load chapters error:', e)
    } finally {
      loading.value = false
    }
  }

  async function saveChapter(chapter: Chapter) {
    try {
      loading.value = true
      error.value = null
      await initializeDatabase() // Ensure DB is initialized
      await db.saveChapter(chapter)
      if (chapter.book_id) {
        await loadChapters(chapter.book_id) // Refresh list
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to save chapter'
      console.error('Save chapter error:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // Cloud sync operations
  async function backupToCloud(password: string) {
    if (!cloudSync.value) {
      throw new Error('Cloud sync not initialized')
    }

    try {
      loading.value = true
      error.value = null
      await cloudSync.value.backup(password)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Backup failed'
      console.error('Backup error:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function restoreFromCloud(password: string) {
    if (!cloudSync.value) {
      throw new Error('Cloud sync not initialized')
    }

    try {
      loading.value = true
      error.value = null
      const success = await cloudSync.value.restore(password)
      if (success) {
        await loadBooks() // Refresh after restore
      }
      return success
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Restore failed'
      console.error('Restore error:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // Import from JSON file
  async function importFromJSON(jsonData: any) {
    try {
      loading.value = true
      error.value = null
      await initializeDatabase()
      await db.importFromNeonExport(jsonData)
      await loadBooks() // Refresh after import
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Import failed'
      console.error('Import error:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    // State
    books,
    chapters,
    loading,
    error,
    isInitialized,

    // Book operations
    loadBooks,
    saveBook,

    // Chapter operations
    loadChapters,
    saveChapter,

    // Cloud sync
    backupToCloud,
    restoreFromCloud,
    hasCloudSync: () => cloudSync.value !== null,

    // Import/Export
    importFromJSON
  }
}
