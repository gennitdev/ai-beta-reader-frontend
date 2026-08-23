import { inject, onMounted, provide, ref, type InjectionKey } from 'vue'
import { Capacitor } from '@capacitor/core'
import { logger } from '@/lib/logger'
import {
  db,
  type Book,
  type BookDeletionPreview,
  type BookDeletionResult,
  type Chapter,
  type ChapterNote,
  type ChapterRevision,
  type ChapterRevisionActivity,
  type ChapterReview,
  type ChapterSummary,
  type ChapterWikiLink,
  type ChapterWikiLinkSource,
  type ImageAsset,
  type ImageWikiTag,
  type PendingImageDeletion,
  type WikiPageChapterLink,
} from '@/lib/database'
import { CloudSync, GoogleDriveProvider } from '@/lib/cloudSync'
import type { DriveBackupGeneration } from '@/lib/libraryBundle/adapters/drive'
import type { ImageContentIntegrity } from '@/lib/imageContentHash'
import type {
  FindReplaceSearchRequest,
  ReplaceFindReplaceMatchesRequest,
  RestoreFindReplaceFieldsRequest,
} from '@/lib/findReplace'
import {
  isRetryingPersistence,
  persistenceError,
  reportPersistenceFailure,
  reportPersistenceSuccess,
} from '@/lib/persistenceStatus'

const isInitialized = ref(false)
const cloudSync = ref<CloudSync | null>(null)
const books = ref<Book[]>([])
const chapters = ref<Chapter[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const cloudSyncReady = ref(true)
let initializationPromise: Promise<void> | null = null

// Initialize database once on app load
export async function initializeDatabase() {
  if (isInitialized.value) return
  if (initializationPromise) return initializationPromise

  initializationPromise = (async () => {
    await db.init()

    // Initialize Google Drive sync if credentials are available
    const webClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID_WEB ?? import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (webClientId || Capacitor.getPlatform() === 'android') {
      const provider = new GoogleDriveProvider(webClientId ?? '')
      cloudSync.value = new CloudSync(provider)
      cloudSyncReady.value = cloudSync.value.isWebSdkReady()
      logger.log('[useDatabase] Initial cloudSyncReady:', cloudSyncReady.value)

      // On Electron/web, preload the GIS SDK so cloud sync is ready
      if (!cloudSyncReady.value && cloudSync.value.ensureWebSdkReady) {
        logger.log('[useDatabase] Starting GIS preload...')
        cloudSync.value.ensureWebSdkReady().then(() => {
          const ready = cloudSync.value?.isWebSdkReady() ?? false
          logger.log('[useDatabase] GIS preload complete, isWebSdkReady:', ready)
          cloudSyncReady.value = ready
          logger.log('[useDatabase] cloudSyncReady updated to:', cloudSyncReady.value)
        }).catch((err) => {
          logger.warn('[useDatabase] Failed to preload GIS SDK:', err)
        })
      }
    }

    isInitialized.value = true
  })().catch((initializationError) => {
    initializationPromise = null
    throw initializationError
  })

  return initializationPromise
}

export function useLocalDatabase() {
  onMounted(async () => {
    await initializeDatabase()
  })

  /**
   * Wraps a database operation with the composable's shared error/loading state.
   * Consolidates the try/catch/finally boilerplate that every data-access method
   * previously repeated: it initializes the database, runs `fn`, and on failure
   * records `error.value` (and logs via the level-gated logger) before either
   * rethrowing or returning a recovery value.
   *
   * @param label     prefix for the logged error message
   * @param fallback  message stored in `error.value` when the thrown value is not an Error
   * @param options.loading     manage the shared `loading` flag around the call
   * @param options.clearError  clear `error.value` before running (matches the legacy load/save methods)
   * @param options.recover     return this value on failure instead of rethrowing
   * @param options.log         set false to record the error without logging it
   */
  async function withDb<T>(
    label: string,
    fallback: string,
    fn: () => Promise<T>,
    options: {
      loading?: boolean
      clearError?: boolean
      recover?: () => T
      log?: boolean
    } = {},
  ): Promise<T> {
    const { loading: manageLoading = false, clearError = false, recover, log = true } = options
    try {
      if (manageLoading) loading.value = true
      if (clearError) error.value = null
      await initializeDatabase()
      return await fn()
    } catch (e) {
      error.value = e instanceof Error ? e.message : fallback
      if (log) logger.error(`${label}:`, e)
      if (recover) return recover()
      throw e
    } finally {
      if (manageLoading) loading.value = false
    }
  }

  async function retryPersistence(): Promise<void> {
    if (isRetryingPersistence.value) return

    isRetryingPersistence.value = true
    try {
      await db.flushPersistence()
      reportPersistenceSuccess()
    } catch (retryError) {
      logger.error('Retry persistence error:', retryError)
      reportPersistenceFailure()
    } finally {
      isRetryingPersistence.value = false
    }
  }

  async function exportDatabase(): Promise<Uint8Array> {
    await initializeDatabase()
    return db.exportDatabase()
  }

  // Book operations
  async function loadBooks() {
    return withDb('Load books error', 'Failed to load books', async () => {
      books.value = await db.getBooks()
    }, { loading: true, clearError: true, recover: () => undefined })
  }

  async function saveBook(book: Book) {
    return withDb('Save book error', 'Failed to save book', async () => {
      await db.saveBook(book)
      await loadBooks() // Refresh list
    }, { loading: true, clearError: true })
  }

  async function getBookDeletionPreview(bookId: string): Promise<BookDeletionPreview | null> {
    await initializeDatabase()
    return db.getBookDeletionPreview(bookId)
  }

  async function deleteBook(bookId: string): Promise<BookDeletionResult> {
    return withDb('Delete book error', 'Failed to delete book', async () => {
      const result = await db.deleteBook(bookId)
      await loadBooks()
      return result
    }, { loading: true, clearError: true })
  }

  async function getPendingImageDeletions(): Promise<PendingImageDeletion[]> {
    await initializeDatabase()
    return db.getPendingImageDeletions()
  }

  async function completePendingImageDeletion(imageId: string): Promise<void> {
    await initializeDatabase()
    await db.completePendingImageDeletion(imageId)
  }

  async function failPendingImageDeletion(imageId: string, cleanupError: unknown): Promise<void> {
    await initializeDatabase()
    const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
    await db.failPendingImageDeletion(imageId, message)
  }

  // Chapter operations
  async function loadChapters(bookId: string) {
    return withDb('Load chapters error', 'Failed to load chapters', async () => {
      chapters.value = await db.getChapters(bookId)
    }, { loading: true, clearError: true, recover: () => undefined })
  }

  async function saveChapter(chapter: Chapter) {
    return withDb('Save chapter error', 'Failed to save chapter', async () => {
      await db.saveChapter(chapter)
      if (chapter.book_id) {
        await loadChapters(chapter.book_id) // Refresh list
      }
    }, { loading: true, clearError: true })
  }

  async function deleteChapter(chapterId: string, bookId: string) {
    return withDb('Delete chapter error', 'Failed to delete chapter', async () => {
      await db.deleteChapter(chapterId, bookId)
      await loadChapters(bookId)
    }, { loading: true, clearError: true })
  }

  async function getChapterRevisions(chapterId: string): Promise<ChapterRevision[]> {
    return withDb('Load chapter versions error', 'Failed to load chapter versions', async () => {
      return await db.getChapterRevisions(chapterId)
    }, { clearError: true })
  }

  async function restoreChapterRevision(revisionId: string): Promise<ChapterRevision> {
    return withDb('Restore chapter version error', 'Failed to restore chapter version', async () => {
      const restored = await db.restoreChapterRevision(revisionId)
      await loadChapters(restored.book_id)
      return restored
    }, { clearError: true })
  }

  async function discardChapterRevision(revisionId: string): Promise<ChapterRevision> {
    return withDb('Discard chapter version error', 'Failed to discard chapter version', async () => {
      return await db.discardChapterRevision(revisionId)
    }, { clearError: true })
  }

  async function getBookRevisionActivity(bookId: string): Promise<ChapterRevisionActivity[]> {
    return withDb('Load writing activity error', 'Failed to load writing activity', async () => {
      return await db.getBookRevisionActivity(bookId)
    }, { clearError: true })
  }

  // Cloud sync operations
  async function prepareCloudSync() {
    try {
      await initializeDatabase()
      if (cloudSync.value) {
        await cloudSync.value.ensureWebSdkReady()
        cloudSyncReady.value = cloudSync.value.isWebSdkReady()
      }
    } catch (e) {
      logger.error('Cloud sync initialization error:', e)
      cloudSyncReady.value = false
    }
  }

  async function backupToCloud(password: string) {
    if (!cloudSync.value) {
      throw new Error('Cloud sync not initialized')
    }

    try {
      loading.value = true
      error.value = null
      logger.log('[CloudSync] backupToCloud invoked')
      await cloudSync.value.backup(password)
      logger.log('[CloudSync] backupToCloud completed')
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Backup failed'
      logger.error('Backup error:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function listCloudBackups(): Promise<DriveBackupGeneration[]> {
    if (!cloudSync.value) throw new Error('Cloud sync not initialized')
    return cloudSync.value.listBackupGenerations()
  }

  async function restoreFromCloud(password: string, generationId?: string) {
    if (!cloudSync.value) {
      throw new Error('Cloud sync not initialized')
    }

    try {
      loading.value = true
      error.value = null
      logger.log('[CloudSync] restoreFromCloud invoked')
      if (generationId) await cloudSync.value.restore(password, generationId)
      else await cloudSync.value.restore(password)
      logger.log('[CloudSync] restoreFromCloud finished successfully')
      await loadBooks() // Refresh after restore
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Restore failed'
      logger.error('Restore error:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // Import from JSON file
  async function importFromJSON(jsonData: unknown) {
    return withDb('Import error', 'Import failed', async () => {
      await db.importFromNeonExport(jsonData)
      await loadBooks() // Refresh after import
    }, { loading: true, clearError: true })
  }

  async function importDatabaseBackup(data: Uint8Array) {
    return withDb('importDatabaseBackup', 'Import failed', async () => {
      await db.importDatabase(data)
      await loadBooks()
    }, { loading: true, clearError: true, log: false })
  }

  // Summary operations
  async function saveSummary(summary: {
    chapter_id: string;
    summary: string;
    pov: string | null;
    characters: string[];
    beats: string[];
    spoilers_ok: boolean;
    generated_by?: 'ai' | 'user' | null;
    model?: string | null;
  }) {
    return withDb('Save summary error', 'Failed to save summary', async () => {
      await db.saveSummary(summary)
    })
  }

  async function getSummary(chapterId: string): Promise<ChapterSummary | null> {
    return withDb('Get summary error', 'Failed to get summary', async () => {
      return await db.getSummary(chapterId)
    }, { recover: () => null })
  }

  async function savePartSummary(summary: {
    part_id: string;
    summary: string;
    characters: string[];
    beats: string[];
    generated_by?: 'ai' | 'user' | null;
    model?: string | null;
  }) {
    return withDb('Save part summary error', 'Failed to save part summary', async () => {
      await db.savePartSummary(summary)
    })
  }

  async function getPartSummary(partId: string) {
    return withDb('Get part summary error', 'Failed to get part summary', async () => {
      return await db.getPartSummary(partId)
    }, { recover: () => null })
  }

  // Review operations
  async function saveReview(review: {
    chapter_id: string;
    review_text: string;
    prompt_used: string | null;
    profile_id: number | null;
    profile_name: string | null;
    tone_key: string | null;
    profile_stable_id?: string | null;
  }) {
    return withDb('Save review error', 'Failed to save review', async () => {
      await db.saveReview(review)
    })
  }

  async function getReviews(chapterId: string): Promise<ChapterReview[]> {
    return withDb('Get reviews error', 'Failed to get reviews', async () => {
      return await db.getReviews(chapterId)
    }, { recover: () => [] })
  }

  async function deleteReview(reviewId: string) {
    return withDb('Delete review error', 'Failed to delete review', async () => {
      await db.deleteReview(reviewId)
    })
  }

  // Chapter notes operations
  async function saveNotes(chapterId: string, notes: string) {
    return withDb('Save notes error', 'Failed to save notes', async () => {
      await db.saveNotes(chapterId, notes)
    })
  }

  async function getNotes(chapterId: string): Promise<ChapterNote | null> {
    return withDb('Get notes error', 'Failed to get notes', async () => {
      return await db.getNotes(chapterId)
    }, { recover: () => null })
  }

  async function deleteNotes(chapterId: string) {
    return withDb('Delete notes error', 'Failed to delete notes', async () => {
      await db.deleteNotes(chapterId)
    })
  }

  // Custom reviewer profile operations
  async function getCustomProfiles() {
    return withDb('Get custom profiles error', 'Failed to get custom profiles', async () => {
      return await db.getCustomProfiles()
    }, { recover: () => [] })
  }

  async function createCustomProfile(profile: { name: string; description: string }) {
    return withDb('Create custom profile error', 'Failed to create custom profile', async () => {
      return await db.createCustomProfile(profile)
    })
  }

  async function updateCustomProfile(profileId: number, updates: { name?: string; description?: string }) {
    return withDb('Update custom profile error', 'Failed to update custom profile', async () => {
      await db.updateCustomProfile(profileId, updates)
    })
  }

  async function deleteCustomProfile(profileId: number) {
    return withDb('Delete custom profile error', 'Failed to delete custom profile', async () => {
      await db.deleteCustomProfile(profileId)
    })
  }

  // Wiki page operations
  async function createWikiPage(page: {
    book_id: string;
    page_name: string;
    content: string;
    summary: string;
    page_type?: string;
    created_by_ai?: boolean;
    is_pinned?: boolean;
    aliases?: string[];
  }) {
    return withDb('Create wiki page error', 'Failed to create wiki page', async () => {
      return await db.createWikiPage(page)
    })
  }

  async function updateWikiPage(pageId: string, updates: {
    content?: string;
    summary?: string;
    page_name?: string;
    tags?: string;
    is_pinned?: boolean;
    aliases?: string[];
  }) {
    return withDb('Update wiki page error', 'Failed to update wiki page', async () => {
      await db.updateWikiPage(pageId, updates)
    })
  }

  async function getWikiPageById(id: string) {
    return withDb('Get wiki page by ID error', 'Failed to get wiki page by ID', async () => {
      return await db.getWikiPageById(id)
    }, { recover: () => null })
  }

  async function getWikiPage(bookId: string, pageName: string, pageType?: string) {
    return withDb('Get wiki page error', 'Failed to get wiki page', async () => {
      return await db.getWikiPage(bookId, pageName, pageType)
    }, { recover: () => null })
  }

  async function getWikiPages(bookId: string) {
    return withDb('Get wiki pages error', 'Failed to get wiki pages', async () => {
      return await db.getWikiPages(bookId)
    }, { recover: () => [] })
  }

  async function deleteWikiPage(pageId: string) {
    return withDb('Delete wiki page error', 'Failed to delete wiki page', async () => {
      await db.deleteWikiPage(pageId)
    })
  }

  async function trackWikiUpdate(update: {
    wiki_page_id: string;
    chapter_id: string;
    update_type: string;
    change_summary?: string;
    contradiction_notes?: string;
  }) {
    return withDb('Track wiki update error', 'Failed to track wiki update', async () => {
      await db.trackWikiUpdate(update)
    })
  }

  async function addChapterWikiMention(
    chapterId: string,
    wikiPageId: string,
    linkSource: ChapterWikiLinkSource = 'manual',
  ) {
    return withDb('Add wiki mention error', 'Failed to add wiki mention', async () => {
      await db.addChapterWikiMention(chapterId, wikiPageId, linkSource)
    })
  }

  async function getChapterWikiLinks(chapterId: string): Promise<ChapterWikiLink[]> {
    return withDb('Get chapter wiki links error', 'Failed to get chapter wiki links', async () => {
      return await db.getChapterWikiLinks(chapterId)
    }, { recover: () => [] })
  }

  async function getWikiPageChapterLinks(wikiPageId: string): Promise<WikiPageChapterLink[]> {
    return withDb('Get wiki page chapter links error', 'Failed to get wiki page chapter links', async () => {
      return await db.getWikiPageChapterLinks(wikiPageId)
    }, { recover: () => [] })
  }

  async function setChapterWikiLinks(
    chapterId: string,
    wikiPageIds: string[],
    linkSource: ChapterWikiLinkSource = 'manual',
  ) {
    return withDb('Set chapter wiki links error', 'Failed to update chapter wiki links', async () => {
      await db.setChapterWikiLinks(chapterId, wikiPageIds, linkSource)
    })
  }

  async function ensureChapterWikiLinks(
    chapterId: string,
    wikiPageIds: string[],
    linkSource: ChapterWikiLinkSource = 'manual',
  ) {
    return withDb('Ensure chapter wiki links error', 'Failed to ensure chapter wiki links', async () => {
      await db.ensureChapterWikiLinks(chapterId, wikiPageIds, linkSource)
    })
  }

  async function setWikiPageChapterLinks(
    wikiPageId: string,
    chapterIds: string[],
    linkSource: ChapterWikiLinkSource = 'manual',
  ) {
    return withDb('Set wiki page chapter links error', 'Failed to update wiki page chapter links', async () => {
      await db.setWikiPageChapterLinks(wikiPageId, chapterIds, linkSource)
    })
  }

  async function createPart(bookId: string, name: string) {
    return withDb('Create part error', 'Failed to create part', async () => {
      return await db.createPart({ book_id: bookId, name })
    })
  }

  async function getParts(bookId: string) {
    return withDb('Get parts error', 'Failed to get parts', async () => {
      return await db.getParts(bookId)
    })
  }

  async function updatePart(partId: string, name: string) {
    return withDb('Update part error', 'Failed to update part', async () => {
      await db.updatePart(partId, name)
    })
  }

  async function deletePart(partId: string) {
    return withDb('Delete part error', 'Failed to delete part', async () => {
      await db.deletePart(partId)
    })
  }

  async function updateChapterOrders(
    bookId: string,
    chapterOrder: string[],
    partUpdates: { [partId: string]: string[] },
    partOrder?: string[]
  ) {
    return withDb('Update chapter orders error', 'Failed to update chapter orders', async () => {
      await db.updateChapterOrders(bookId, chapterOrder, partUpdates, partOrder)
    })
  }

  async function updatePartOrder(bookId: string, partOrder: string[]) {
    return withDb('Update part order error', 'Failed to update part order', async () => {
      await db.updatePartOrder(bookId, partOrder)
    })
  }

  async function searchBook(bookId: string, searchTerm: string) {
    return withDb('Search error', 'Failed to search', async () => {
      return await db.searchBook(bookId, searchTerm)
    })
  }

  async function findReplaceMatches(request: FindReplaceSearchRequest) {
    return withDb('Find matches error', 'Failed to find matches', async () => {
      return await db.findReplaceMatches(request)
    })
  }

  async function replaceFindReplaceMatches(request: ReplaceFindReplaceMatchesRequest) {
    return withDb('Replace matches error', 'Failed to replace matches', async () => {
      return await db.replaceFindReplaceMatches(request)
    })
  }

  async function restoreFindReplaceFields(request: RestoreFindReplaceFieldsRequest) {
    return withDb('Undo replacement error', 'Failed to undo replacement', async () => {
      await db.restoreFindReplaceFields(request)
    })
  }

  async function replaceInChapter(chapterId: string, searchTerm: string, replaceTerm: string) {
    return withDb('Replace in chapter error', 'Failed to replace in chapter', async () => {
      await db.replaceInChapter(chapterId, searchTerm, replaceTerm)
    })
  }

  async function replaceInWikiPage(wikiPageId: string, searchTerm: string, replaceTerm: string) {
    return withDb('Replace in wiki page error', 'Failed to replace in wiki page', async () => {
      await db.replaceInWikiPage(wikiPageId, searchTerm, replaceTerm)
    })
  }

  // Image asset operations (Electron-only features)
  async function saveImageAssetRecord(asset: ImageAsset) {
    return withDb('Save image asset error', 'Failed to save image', async () => {
      await db.saveImageAsset(asset)
    })
  }

  async function deleteImageAssetRecord(imageId: string) {
    return withDb('Delete image asset error', 'Failed to delete image', async () => {
      await db.deleteImageAsset(imageId)
    })
  }

  async function getChapterImageAssets(chapterId: string) {
    return withDb('Get chapter images error', 'Failed to load images', async () => {
      return await db.getChapterImages(chapterId)
    })
  }

  async function getPartImageAssets(partId: string) {
    return withDb('Get part images error', 'Failed to load part images', async () => {
      return await db.getPartImages(partId)
    })
  }

  async function getBookCoverImageAsset(bookId: string) {
    return withDb('Get book cover image error', 'Failed to load book cover', async () => {
      return await db.getBookCoverImage(bookId)
    })
  }

  async function setBookCoverImageId(bookId: string, imageId: string | null) {
    return withDb('Set book cover image error', 'Failed to update book cover', async () => {
      await db.setBookCoverImage(bookId, imageId)
    })
  }

  async function setPartCoverImageId(partId: string, imageId: string | null) {
    return withDb('Set part cover image error', 'Failed to update part cover', async () => {
      await db.setPartCoverImageId(partId, imageId)
    })
  }

  async function getPartCoverImageAsset(partId: string): Promise<ImageAsset | null> {
    return withDb('Get part cover image error', 'Failed to get part cover', async () => {
      return await db.getPartCoverImage(partId)
    })
  }

  async function setChapterCoverImageId(chapterId: string, imageId: string | null) {
    return withDb('Set chapter cover image error', 'Failed to update chapter cover', async () => {
      await db.setChapterCoverImageId(chapterId, imageId)
    })
  }

  async function getChapterCoverImageAsset(chapterId: string): Promise<ImageAsset | null> {
    return withDb('Get chapter cover image error', 'Failed to get chapter cover', async () => {
      return await db.getChapterCoverImage(chapterId)
    })
  }

  async function setWikiPageCoverImageId(wikiPageId: string, imageId: string | null) {
    return withDb('Set wiki page cover image error', 'Failed to update wiki page cover', async () => {
      await db.setWikiPageCoverImageId(wikiPageId, imageId)
    })
  }

  async function getWikiPageCoverImageAsset(wikiPageId: string): Promise<ImageAsset | null> {
    return withDb('Get wiki page cover image error', 'Failed to get wiki page cover', async () => {
      return await db.getWikiPageCoverImage(wikiPageId)
    })
  }

  async function getBookImageAssets(bookId: string): Promise<ImageAsset[]> {
    return withDb('Get book images error', 'Failed to load book images', async () => {
      return await db.getBookImages(bookId)
    })
  }

  async function updateImageAssetNotes(imageId: string, notes: string) {
    return withDb('Update image notes error', 'Failed to save image notes', async () => {
      await db.updateImageAssetNotes(imageId, notes)
    })
  }

  async function updateImageAssetIntegrity(
    imageId: string,
    integrity: ImageContentIntegrity,
  ) {
    await initializeDatabase()
    await db.updateImageAssetIntegrity(imageId, integrity)
  }

  async function getImageWikiTags(imageId: string): Promise<ImageWikiTag[]> {
    return withDb('Get image tags error', 'Failed to load image tags', async () => {
      return await db.getImageWikiTags(imageId)
    })
  }

  async function setImageWikiTags(imageId: string, wikiPageIds: string[]) {
    return withDb('Set image tags error', 'Failed to save image tags', async () => {
      await db.setImageWikiTags(imageId, wikiPageIds)
    })
  }

  async function getWikiPageImageAssets(wikiPageId: string): Promise<ImageAsset[]> {
    return withDb('Get wiki page images error', 'Failed to load wiki page images', async () => {
      return await db.getWikiPageImages(wikiPageId)
    })
  }

  return {
    // State
    books,
    chapters,
    loading,
    error,
    isInitialized,
    persistenceError,
    isRetryingPersistence,

    // Book operations
    loadBooks,
    saveBook,
    getBookDeletionPreview,
    deleteBook,
    getPendingImageDeletions,
    completePendingImageDeletion,
    failPendingImageDeletion,
    retryPersistence,
    exportDatabase,

    // Chapter operations
    loadChapters,
    saveChapter,
    getChapterRevisions,
    restoreChapterRevision,
    discardChapterRevision,
    getBookRevisionActivity,
    deleteChapter,

    // Cloud sync operations
    cloudSyncReady,
    prepareCloudSync,
    backupToCloud,
    listCloudBackups,
    restoreFromCloud,

    // Summary operations
    saveSummary,
    getSummary,
    savePartSummary,
    getPartSummary,

    // Review operations
    saveReview,
    getReviews,
    deleteReview,

    // Chapter notes operations
    saveNotes,
    getNotes,
    deleteNotes,

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
    deleteWikiPage,
    trackWikiUpdate,
    addChapterWikiMention,
    getChapterWikiLinks,
    getWikiPageChapterLinks,
    setChapterWikiLinks,
    ensureChapterWikiLinks,
    setWikiPageChapterLinks,

    // Parts operations
    createPart,
    getParts,
    updatePart,
    deletePart,
    updateChapterOrders,
    updatePartOrder,

    // Search and Replace operations
    searchBook,
    findReplaceMatches,
    replaceFindReplaceMatches,
    restoreFindReplaceFields,
    replaceInChapter,
    replaceInWikiPage,

    // Image assets
    saveImageAssetRecord,
    deleteImageAssetRecord,
    getChapterImageAssets,
    getPartImageAssets,
    getBookCoverImageAsset,
    setBookCoverImageId,
    getPartCoverImageAsset,
    setPartCoverImageId,
    getChapterCoverImageAsset,
    setChapterCoverImageId,
    getWikiPageCoverImageAsset,
    setWikiPageCoverImageId,
    getBookImageAssets,
    updateImageAssetNotes,
    updateImageAssetIntegrity,
    getImageWikiTags,
    setImageWikiTags,
    getWikiPageImageAssets,

    hasCloudSync: () => cloudSync.value !== null,

    // Import/Export
    importFromJSON,
    importDatabaseBackup,
  }
}

export type DatabaseApi = ReturnType<typeof useLocalDatabase>
const databaseApiKey: InjectionKey<DatabaseApi> = Symbol('database-api')

export function provideDatabase(api: DatabaseApi): void {
  provide(databaseApiKey, api)
}

export function useDatabase(): DatabaseApi {
  return inject(databaseApiKey, null) ?? useLocalDatabase()
}
