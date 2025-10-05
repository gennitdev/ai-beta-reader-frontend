import { ref, onMounted } from 'vue'
import { db, type Book, type Chapter, type ChapterSummary, type ChapterReview } from '@/lib/database'
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

  // Summary operations
  async function saveSummary(summary: {
    chapter_id: string;
    summary: string;
    pov: string | null;
    characters: string[];
    beats: string[];
    spoilers_ok: boolean;
  }) {
    try {
      await initializeDatabase()
      await db.saveSummary(summary)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to save summary'
      console.error('Save summary error:', e)
      throw e
    }
  }

  async function getSummary(chapterId: string): Promise<ChapterSummary | null> {
    try {
      await initializeDatabase()
      return await db.getSummary(chapterId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to get summary'
      console.error('Get summary error:', e)
      return null
    }
  }

  // Review operations
  async function saveReview(review: {
    chapter_id: string;
    review_text: string;
    prompt_used: string | null;
    profile_id: number | null;
    profile_name: string | null;
    tone_key: string | null;
  }) {
    try {
      await initializeDatabase()
      await db.saveReview(review)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to save review'
      console.error('Save review error:', e)
      throw e
    }
  }

  async function getReviews(chapterId: string): Promise<ChapterReview[]> {
    try {
      await initializeDatabase()
      return await db.getReviews(chapterId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to get reviews'
      console.error('Get reviews error:', e)
      return []
    }
  }

  async function deleteReview(reviewId: string) {
    try {
      await initializeDatabase()
      await db.deleteReview(reviewId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete review'
      console.error('Delete review error:', e)
      throw e
    }
  }

  // Custom reviewer profile operations
  async function getCustomProfiles() {
    try {
      await initializeDatabase()
      return await db.getCustomProfiles()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to get custom profiles'
      console.error('Get custom profiles error:', e)
      return []
    }
  }

  async function createCustomProfile(profile: { name: string; description: string }) {
    try {
      await initializeDatabase()
      return await db.createCustomProfile(profile)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create custom profile'
      console.error('Create custom profile error:', e)
      throw e
    }
  }

  async function updateCustomProfile(profileId: number, updates: { name?: string; description?: string }) {
    try {
      await initializeDatabase()
      await db.updateCustomProfile(profileId, updates)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to update custom profile'
      console.error('Update custom profile error:', e)
      throw e
    }
  }

  async function deleteCustomProfile(profileId: number) {
    try {
      await initializeDatabase()
      await db.deleteCustomProfile(profileId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete custom profile'
      console.error('Delete custom profile error:', e)
      throw e
    }
  }

  // Wiki page operations
  async function createWikiPage(page: {
    book_id: string;
    page_name: string;
    content: string;
    summary: string;
    page_type?: string;
    created_by_ai?: boolean;
  }) {
    try {
      await initializeDatabase()
      return await db.createWikiPage(page)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create wiki page'
      console.error('Create wiki page error:', e)
      throw e
    }
  }

  async function updateWikiPage(pageId: string, updates: {
    content?: string;
    summary?: string;
    page_name?: string;
  }) {
    try {
      await initializeDatabase()
      await db.updateWikiPage(pageId, updates)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to update wiki page'
      console.error('Update wiki page error:', e)
      throw e
    }
  }

  async function getWikiPageById(id: string) {
    try {
      await initializeDatabase()
      return await db.getWikiPageById(id)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to get wiki page by ID'
      console.error('Get wiki page by ID error:', e)
      return null
    }
  }

  async function getWikiPage(bookId: string, pageName: string) {
    try {
      await initializeDatabase()
      return await db.getWikiPage(bookId, pageName)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to get wiki page'
      console.error('Get wiki page error:', e)
      return null
    }
  }

  async function getWikiPages(bookId: string) {
    try {
      await initializeDatabase()
      return await db.getWikiPages(bookId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to get wiki pages'
      console.error('Get wiki pages error:', e)
      return []
    }
  }

  async function trackWikiUpdate(update: {
    wiki_page_id: string;
    chapter_id: string;
    update_type: string;
    change_summary?: string;
    contradiction_notes?: string;
  }) {
    try {
      await initializeDatabase()
      await db.trackWikiUpdate(update)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to track wiki update'
      console.error('Track wiki update error:', e)
      throw e
    }
  }

  async function addChapterWikiMention(chapterId: string, wikiPageId: string) {
    try {
      await initializeDatabase()
      await db.addChapterWikiMention(chapterId, wikiPageId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to add wiki mention'
      console.error('Add wiki mention error:', e)
      throw e
    }
  }

  async function createPart(bookId: string, name: string) {
    try {
      await initializeDatabase()
      return await db.createPart({ book_id: bookId, name })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create part'
      console.error('Create part error:', e)
      throw e
    }
  }

  async function getParts(bookId: string) {
    try {
      await initializeDatabase()
      return await db.getParts(bookId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to get parts'
      console.error('Get parts error:', e)
      throw e
    }
  }

  async function updatePart(partId: string, name: string) {
    try {
      await initializeDatabase()
      await db.updatePart(partId, name)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to update part'
      console.error('Update part error:', e)
      throw e
    }
  }

  async function deletePart(partId: string) {
    try {
      await initializeDatabase()
      await db.deletePart(partId)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete part'
      console.error('Delete part error:', e)
      throw e
    }
  }

  async function updateChapterOrders(bookId: string, chapterOrder: string[], partUpdates: { [partId: string]: string[] }) {
    try {
      await initializeDatabase()
      await db.updateChapterOrders(bookId, chapterOrder, partUpdates)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to update chapter orders'
      console.error('Update chapter orders error:', e)
      throw e
    }
  }

  async function searchBook(bookId: string, searchTerm: string) {
    try {
      await initializeDatabase()
      return await db.searchBook(bookId, searchTerm)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to search'
      console.error('Search error:', e)
      throw e
    }
  }

  async function replaceInChapter(chapterId: string, searchTerm: string, replaceTerm: string) {
    try {
      await initializeDatabase()
      await db.replaceInChapter(chapterId, searchTerm, replaceTerm)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to replace in chapter'
      console.error('Replace in chapter error:', e)
      throw e
    }
  }

  async function replaceInWikiPage(wikiPageId: string, searchTerm: string, replaceTerm: string) {
    try {
      await initializeDatabase()
      await db.replaceInWikiPage(wikiPageId, searchTerm, replaceTerm)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to replace in wiki page'
      console.error('Replace in wiki page error:', e)
      throw e
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

    // Summary operations
    saveSummary,
    getSummary,

    // Review operations
    saveReview,
    getReviews,
    deleteReview,

    // Custom reviewer profile operations
    getCustomProfiles,
    createCustomProfile,
    updateCustomProfile,
    deleteCustomProfile,

    // Wiki page operations
    createWikiPage,
    updateWikiPage,
    getWikiPageById,
    getWikiPage,
    getWikiPages,
    trackWikiUpdate,
    addChapterWikiMention,

    // Parts operations
    createPart,
    getParts,
    updatePart,
    deletePart,
    updateChapterOrders,

    // Search and Replace operations
    searchBook,
    replaceInChapter,
    replaceInWikiPage,

    // Cloud sync
    backupToCloud,
    restoreFromCloud,
    hasCloudSync: () => cloudSync.value !== null,

    // Import/Export
    importFromJSON
  }
}
