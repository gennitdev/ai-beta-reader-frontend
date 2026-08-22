import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A db mock where any accessed method is an async vi.fn returning a sentinel,
// so every thin wrapper in useDatabase can be exercised without enumerating
// the whole AppDatabase surface.
const { dbProxy, dbFns } = vi.hoisted(() => {
  const dbFns: Record<string, ReturnType<typeof vi.fn>> = {}
  const sentinel = { sentinel: true }
  const dbProxy = new Proxy(dbFns, {
    get(target, prop: string) {
      if (!target[prop]) target[prop] = vi.fn(async () => sentinel)
      return target[prop]
    },
  })
  return { dbProxy, dbFns }
})

const cloudInstance = vi.hoisted(() => ({
  isWebSdkReady: vi.fn(() => true),
  ensureWebSdkReady: vi.fn(async () => {}),
  backup: vi.fn(async () => {}),
  restore: vi.fn(async () => {}),
  listBackupGenerations: vi.fn(async () => []),
}))

vi.mock('@/lib/database', () => ({ db: dbProxy }))
vi.mock('@/lib/cloudSync', () => ({
  // vitest ignores a plain vi.fn's return value under `new`, so assign the
  // stubbed methods onto the instance instead.
  CloudSync: vi.fn(function (this: Record<string, unknown>) {
    Object.assign(this, cloudInstance)
  }),
  GoogleDriveProvider: vi.fn(),
}))

import { useDatabase } from '@/composables/useDatabase'
import {
  isRetryingPersistence,
  persistenceError,
  reportPersistenceFailure,
  reportPersistenceSuccess,
} from '@/lib/persistenceStatus'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID_WEB', '')
  for (const fn of Object.values(dbFns)) fn.mockClear()
  reportPersistenceSuccess()
  isRetryingPersistence.value = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('useDatabase — book/chapter state', () => {
  it('loadBooks populates books and clears loading', async () => {
    const api = useDatabase()
    dbProxy.getBooks.mockResolvedValueOnce([{ id: 'b1' }])
    await api.loadBooks()
    expect(api.books.value).toEqual([{ id: 'b1' }])
    expect(api.loading.value).toBe(false)
    expect(api.error.value).toBeNull()
  })

  it('loadBooks records an error without throwing', async () => {
    const api = useDatabase()
    dbProxy.getBooks.mockRejectedValueOnce(new Error('load failed'))
    await api.loadBooks()
    expect(api.error.value).toBe('load failed')
    expect(api.loading.value).toBe(false)
  })

  it('saveBook saves then refreshes the list', async () => {
    const api = useDatabase()
    dbProxy.getBooks.mockResolvedValue([{ id: 'b1' }])
    await api.saveBook({ id: 'b1' } as never)
    expect(dbProxy.saveBook).toHaveBeenCalled()
    expect(dbProxy.getBooks).toHaveBeenCalled()
  })

  it('saveBook rethrows and records the error on failure', async () => {
    const api = useDatabase()
    dbProxy.saveBook.mockRejectedValueOnce(new Error('save failed'))
    await expect(api.saveBook({ id: 'b1' } as never)).rejects.toThrow('save failed')
    expect(api.error.value).toBe('save failed')
  })

  it('loadChapters and saveChapter manage the chapters list', async () => {
    const api = useDatabase()
    dbProxy.getChapters.mockResolvedValue([{ id: 'ch-1' }])
    await api.loadChapters('b1')
    expect(api.chapters.value).toEqual([{ id: 'ch-1' }])

    await api.saveChapter({ id: 'ch-2', book_id: 'b1' } as never)
    expect(dbProxy.saveChapter).toHaveBeenCalled()
    expect(dbProxy.getChapters).toHaveBeenCalledTimes(2) // load + refresh
  })

  it('saveChapter skips the refresh when the chapter has no book id', async () => {
    const api = useDatabase()
    await api.saveChapter({ id: 'ch-3', book_id: '' } as never)
    expect(dbProxy.saveChapter).toHaveBeenCalled()
    expect(dbProxy.getChapters).not.toHaveBeenCalled()
  })

  it('deleteChapter deletes then refreshes', async () => {
    const api = useDatabase()
    await api.deleteChapter('ch-1', 'b1')
    expect(dbProxy.deleteChapter).toHaveBeenCalledWith('ch-1', 'b1')
    expect(dbProxy.getChapters).toHaveBeenCalled()
  })

  it('exports a flushed database snapshot through the public composable', async () => {
    const api = useDatabase()
    const backup = new Uint8Array([1, 2, 3])
    dbProxy.exportDatabase.mockResolvedValueOnce(backup)
    await expect(api.exportDatabase()).resolves.toBe(backup)
    expect(dbProxy.exportDatabase).toHaveBeenCalledOnce()
  })
})

describe('useDatabase — cloud sync guards', () => {
  it('backup, list, and restore throw when cloud sync is not initialized', async () => {
    const api = useDatabase()
    expect(api.hasCloudSync()).toBe(false)
    await expect(api.backupToCloud('pw')).rejects.toThrow(/not initialized/)
    await expect(api.listCloudBackups()).rejects.toThrow(/not initialized/)
    await expect(api.restoreFromCloud('pw')).rejects.toThrow(/not initialized/)
  })

  it('prepareCloudSync is a no-op when there is no provider', async () => {
    const api = useDatabase()
    await expect(api.prepareCloudSync()).resolves.toBeUndefined()
  })
})

describe('useDatabase — persistence recovery', () => {
  it('clears the visible failure after pending changes persist successfully', async () => {
    const api = useDatabase()
    reportPersistenceFailure()
    dbProxy.flushPersistence.mockResolvedValueOnce(undefined)

    await api.retryPersistence()

    expect(dbProxy.flushPersistence).toHaveBeenCalledOnce()
    expect(persistenceError.value).toBeNull()
    expect(isRetryingPersistence.value).toBe(false)
  })

  it('keeps the failure visible when a retry also fails', async () => {
    const api = useDatabase()
    dbProxy.flushPersistence.mockRejectedValueOnce(new Error('quota still exceeded'))

    await api.retryPersistence()

    expect(persistenceError.value).toContain('could not be saved')
    expect(isRetryingPersistence.value).toBe(false)
    expect(console.error).toHaveBeenCalledWith(
      'Retry persistence error:',
      expect.objectContaining({ message: 'quota still exceeded' }),
    )
  })

  it('ignores repeated retry requests while a persistence flush is active', async () => {
    const api = useDatabase()
    const flush = deferred<void>()
    dbProxy.flushPersistence.mockImplementationOnce(() => flush.promise)

    const firstRetry = api.retryPersistence()
    expect(isRetryingPersistence.value).toBe(true)

    await api.retryPersistence()
    expect(dbProxy.flushPersistence).toHaveBeenCalledOnce()

    flush.resolve()
    await firstRetry
    expect(isRetryingPersistence.value).toBe(false)
  })
})

describe('useDatabase — delegation to the database layer', () => {
  it('every remaining wrapper delegates to db and surfaces its result', async () => {
    const api = useDatabase()

    const calls: Array<[keyof typeof api, unknown[]]> = [
      ['saveSummary', [{ chapter_id: 'c' }]],
      ['getChapterRevisions', ['c']],
      ['restoreChapterRevision', ['r']],
      ['discardChapterRevision', ['r']],
      ['getBookRevisionActivity', ['b']],
      ['getSummary', ['c']],
      ['savePartSummary', [{ part_id: 'p' }]],
      ['getPartSummary', ['p']],
      ['saveReview', [{ chapter_id: 'c' }]],
      ['getReviews', ['c']],
      ['deleteReview', ['r']],
      ['saveNotes', ['c', 'notes']],
      ['getNotes', ['c']],
      ['deleteNotes', ['c']],
      ['getCustomProfiles', []],
      ['createCustomProfile', [{ name: 'n', description: 'd' }]],
      ['updateCustomProfile', [1, { name: 'n' }]],
      ['deleteCustomProfile', [1]],
      ['createWikiPage', [{ book_id: 'b', page_name: 'n', content: '', summary: '' }]],
      ['updateWikiPage', ['w', { summary: 's' }]],
      ['getWikiPageById', ['w']],
      ['getWikiPage', ['b', 'n']],
      ['getWikiPages', ['b']],
      ['deleteWikiPage', ['w']],
      ['trackWikiUpdate', [{ wiki_page_id: 'w', chapter_id: 'c', update_type: 'update' }]],
      ['addChapterWikiMention', ['c', 'w']],
      ['getChapterWikiLinks', ['c']],
      ['getWikiPageChapterLinks', ['w']],
      ['setChapterWikiLinks', ['c', ['w']]],
      ['ensureChapterWikiLinks', ['c', ['w']]],
      ['setWikiPageChapterLinks', ['w', ['c']]],
      ['createPart', ['b', 'Part']],
      ['getParts', ['b']],
      ['updatePart', ['p', 'Renamed']],
      ['deletePart', ['p']],
      ['updateChapterOrders', ['b', ['c'], {}]],
      ['updatePartOrder', ['b', ['p']]],
      ['searchBook', ['b', 'term']],
      ['findReplaceMatches', [{ bookId: 'b' }]],
      ['replaceFindReplaceMatches', [{ bookId: 'b' }]],
      ['restoreFindReplaceFields', [{ bookId: 'b' }]],
      ['replaceInChapter', ['c', 'a', 'b']],
      ['replaceInWikiPage', ['w', 'a', 'b']],
      ['saveImageAssetRecord', [{ id: 'i' }]],
      ['deleteImageAssetRecord', ['i']],
      ['getChapterImageAssets', ['c']],
      ['getPartImageAssets', ['p']],
      ['getBookCoverImageAsset', ['b']],
      ['setBookCoverImageId', ['b', 'i']],
      ['getPartCoverImageAsset', ['p']],
      ['setPartCoverImageId', ['p', 'i']],
      ['getChapterCoverImageAsset', ['c']],
      ['setChapterCoverImageId', ['c', 'i']],
      ['getWikiPageCoverImageAsset', ['w']],
      ['setWikiPageCoverImageId', ['w', 'i']],
      ['getBookImageAssets', ['b']],
      ['updateImageAssetNotes', ['i', 'notes']],
      ['updateImageAssetIntegrity', ['i', {
        content_hash: 'hash',
        content_hash_algorithm: 'sha256-v1',
        content_byte_length: 3,
      }]],
      ['getImageWikiTags', ['i']],
      ['setImageWikiTags', ['i', ['w']]],
      ['getWikiPageImageAssets', ['w']],
      ['importFromJSON', [{}]],
      ['importDatabaseBackup', [new Uint8Array([1, 2, 3])]],
    ]

    for (const [name, args] of calls) {
      const fn = api[name] as (...a: unknown[]) => Promise<unknown>
      await expect(fn(...args), `${String(name)} should not throw`).resolves.not.toThrow()
    }
  })

  it('propagates errors from a rethrowing delegated call', async () => {
    const api = useDatabase()
    dbProxy.getImageWikiTags.mockRejectedValueOnce(new Error('tags boom'))
    await expect(api.getImageWikiTags('i')).rejects.toThrow('tags boom')
    expect(api.error.value).toBe('tags boom')
  })

  it('getWikiPages swallows errors and returns an empty list', async () => {
    const api = useDatabase()
    dbProxy.getWikiPages.mockRejectedValueOnce(new Error('wiki boom'))
    await expect(api.getWikiPages('b')).resolves.toEqual([])
    expect(api.error.value).toBe('wiki boom')
  })
})

describe('useDatabase — database failure contracts', () => {
  const rethrowingCases: Array<{
    apiMethod: string
    dbMethod: string
    args: unknown[]
    fallbackMessage: string
  }> = [
    { apiMethod: 'saveBook', dbMethod: 'saveBook', args: [{ id: 'b' }], fallbackMessage: 'Failed to save book' },
    { apiMethod: 'saveChapter', dbMethod: 'saveChapter', args: [{ id: 'c', book_id: '' }], fallbackMessage: 'Failed to save chapter' },
    { apiMethod: 'deleteChapter', dbMethod: 'deleteChapter', args: ['c', 'b'], fallbackMessage: 'Failed to delete chapter' },
    { apiMethod: 'getChapterRevisions', dbMethod: 'getChapterRevisions', args: ['c'], fallbackMessage: 'Failed to load chapter versions' },
    { apiMethod: 'restoreChapterRevision', dbMethod: 'restoreChapterRevision', args: ['r'], fallbackMessage: 'Failed to restore chapter version' },
    { apiMethod: 'discardChapterRevision', dbMethod: 'discardChapterRevision', args: ['r'], fallbackMessage: 'Failed to discard chapter version' },
    { apiMethod: 'getBookRevisionActivity', dbMethod: 'getBookRevisionActivity', args: ['b'], fallbackMessage: 'Failed to load writing activity' },
    { apiMethod: 'importFromJSON', dbMethod: 'importFromNeonExport', args: [{}], fallbackMessage: 'Import failed' },
    { apiMethod: 'importDatabaseBackup', dbMethod: 'importDatabase', args: [new Uint8Array()], fallbackMessage: 'Import failed' },
    { apiMethod: 'saveSummary', dbMethod: 'saveSummary', args: [{ chapter_id: 'c' }], fallbackMessage: 'Failed to save summary' },
    { apiMethod: 'savePartSummary', dbMethod: 'savePartSummary', args: [{ part_id: 'p' }], fallbackMessage: 'Failed to save part summary' },
    { apiMethod: 'saveReview', dbMethod: 'saveReview', args: [{ chapter_id: 'c' }], fallbackMessage: 'Failed to save review' },
    { apiMethod: 'deleteReview', dbMethod: 'deleteReview', args: ['r'], fallbackMessage: 'Failed to delete review' },
    { apiMethod: 'saveNotes', dbMethod: 'saveNotes', args: ['c', 'notes'], fallbackMessage: 'Failed to save notes' },
    { apiMethod: 'deleteNotes', dbMethod: 'deleteNotes', args: ['c'], fallbackMessage: 'Failed to delete notes' },
    { apiMethod: 'createCustomProfile', dbMethod: 'createCustomProfile', args: [{ name: 'n', description: 'd' }], fallbackMessage: 'Failed to create custom profile' },
    { apiMethod: 'updateCustomProfile', dbMethod: 'updateCustomProfile', args: [1, { name: 'n' }], fallbackMessage: 'Failed to update custom profile' },
    { apiMethod: 'deleteCustomProfile', dbMethod: 'deleteCustomProfile', args: [1], fallbackMessage: 'Failed to delete custom profile' },
    { apiMethod: 'createWikiPage', dbMethod: 'createWikiPage', args: [{ book_id: 'b', page_name: 'n' }], fallbackMessage: 'Failed to create wiki page' },
    { apiMethod: 'updateWikiPage', dbMethod: 'updateWikiPage', args: ['w', {}], fallbackMessage: 'Failed to update wiki page' },
    { apiMethod: 'deleteWikiPage', dbMethod: 'deleteWikiPage', args: ['w'], fallbackMessage: 'Failed to delete wiki page' },
    { apiMethod: 'trackWikiUpdate', dbMethod: 'trackWikiUpdate', args: [{ wiki_page_id: 'w' }], fallbackMessage: 'Failed to track wiki update' },
    { apiMethod: 'addChapterWikiMention', dbMethod: 'addChapterWikiMention', args: ['c', 'w'], fallbackMessage: 'Failed to add wiki mention' },
    { apiMethod: 'setChapterWikiLinks', dbMethod: 'setChapterWikiLinks', args: ['c', ['w']], fallbackMessage: 'Failed to update chapter wiki links' },
    { apiMethod: 'ensureChapterWikiLinks', dbMethod: 'ensureChapterWikiLinks', args: ['c', ['w']], fallbackMessage: 'Failed to ensure chapter wiki links' },
    { apiMethod: 'setWikiPageChapterLinks', dbMethod: 'setWikiPageChapterLinks', args: ['w', ['c']], fallbackMessage: 'Failed to update wiki page chapter links' },
    { apiMethod: 'createPart', dbMethod: 'createPart', args: ['b', 'Part'], fallbackMessage: 'Failed to create part' },
    { apiMethod: 'getParts', dbMethod: 'getParts', args: ['b'], fallbackMessage: 'Failed to get parts' },
    { apiMethod: 'updatePart', dbMethod: 'updatePart', args: ['p', 'Part'], fallbackMessage: 'Failed to update part' },
    { apiMethod: 'deletePart', dbMethod: 'deletePart', args: ['p'], fallbackMessage: 'Failed to delete part' },
    { apiMethod: 'updateChapterOrders', dbMethod: 'updateChapterOrders', args: ['b', [], {}], fallbackMessage: 'Failed to update chapter orders' },
    { apiMethod: 'updatePartOrder', dbMethod: 'updatePartOrder', args: ['b', []], fallbackMessage: 'Failed to update part order' },
    { apiMethod: 'searchBook', dbMethod: 'searchBook', args: ['b', 'term'], fallbackMessage: 'Failed to search' },
    { apiMethod: 'findReplaceMatches', dbMethod: 'findReplaceMatches', args: [{ bookId: 'b' }], fallbackMessage: 'Failed to find matches' },
    { apiMethod: 'replaceFindReplaceMatches', dbMethod: 'replaceFindReplaceMatches', args: [{ bookId: 'b' }], fallbackMessage: 'Failed to replace matches' },
    { apiMethod: 'restoreFindReplaceFields', dbMethod: 'restoreFindReplaceFields', args: [{ bookId: 'b' }], fallbackMessage: 'Failed to undo replacement' },
    { apiMethod: 'replaceInChapter', dbMethod: 'replaceInChapter', args: ['c', 'a', 'b'], fallbackMessage: 'Failed to replace in chapter' },
    { apiMethod: 'replaceInWikiPage', dbMethod: 'replaceInWikiPage', args: ['w', 'a', 'b'], fallbackMessage: 'Failed to replace in wiki page' },
    { apiMethod: 'saveImageAssetRecord', dbMethod: 'saveImageAsset', args: [{ id: 'i' }], fallbackMessage: 'Failed to save image' },
    { apiMethod: 'deleteImageAssetRecord', dbMethod: 'deleteImageAsset', args: ['i'], fallbackMessage: 'Failed to delete image' },
    { apiMethod: 'getChapterImageAssets', dbMethod: 'getChapterImages', args: ['c'], fallbackMessage: 'Failed to load images' },
    { apiMethod: 'getPartImageAssets', dbMethod: 'getPartImages', args: ['p'], fallbackMessage: 'Failed to load part images' },
    { apiMethod: 'getBookCoverImageAsset', dbMethod: 'getBookCoverImage', args: ['b'], fallbackMessage: 'Failed to load book cover' },
    { apiMethod: 'setBookCoverImageId', dbMethod: 'setBookCoverImage', args: ['b', 'i'], fallbackMessage: 'Failed to update book cover' },
    { apiMethod: 'setPartCoverImageId', dbMethod: 'setPartCoverImageId', args: ['p', 'i'], fallbackMessage: 'Failed to update part cover' },
    { apiMethod: 'getPartCoverImageAsset', dbMethod: 'getPartCoverImage', args: ['p'], fallbackMessage: 'Failed to get part cover' },
    { apiMethod: 'setChapterCoverImageId', dbMethod: 'setChapterCoverImageId', args: ['c', 'i'], fallbackMessage: 'Failed to update chapter cover' },
    { apiMethod: 'getChapterCoverImageAsset', dbMethod: 'getChapterCoverImage', args: ['c'], fallbackMessage: 'Failed to get chapter cover' },
    { apiMethod: 'setWikiPageCoverImageId', dbMethod: 'setWikiPageCoverImageId', args: ['w', 'i'], fallbackMessage: 'Failed to update wiki page cover' },
    { apiMethod: 'getWikiPageCoverImageAsset', dbMethod: 'getWikiPageCoverImage', args: ['w'], fallbackMessage: 'Failed to get wiki page cover' },
    { apiMethod: 'getBookImageAssets', dbMethod: 'getBookImages', args: ['b'], fallbackMessage: 'Failed to load book images' },
    { apiMethod: 'updateImageAssetNotes', dbMethod: 'updateImageAssetNotes', args: ['i', 'notes'], fallbackMessage: 'Failed to save image notes' },
    { apiMethod: 'getImageWikiTags', dbMethod: 'getImageWikiTags', args: ['i'], fallbackMessage: 'Failed to load image tags' },
    { apiMethod: 'setImageWikiTags', dbMethod: 'setImageWikiTags', args: ['i', ['w']], fallbackMessage: 'Failed to save image tags' },
    { apiMethod: 'getWikiPageImageAssets', dbMethod: 'getWikiPageImages', args: ['w'], fallbackMessage: 'Failed to load wiki page images' },
  ]

  it.each(rethrowingCases)('$apiMethod records Error and non-Error failures before rethrowing', async ({
    apiMethod, dbMethod, args, fallbackMessage,
  }) => {
    const api = useDatabase() as unknown as Record<string, (...values: unknown[]) => Promise<unknown>> & {
      error: { value: string | null }
    }
    const failure = new Error(`${apiMethod} failed`)
    dbProxy[dbMethod].mockRejectedValueOnce(failure)

    await expect(api[apiMethod](...args)).rejects.toBe(failure)
    expect(api.error.value).toBe(failure.message)

    dbProxy[dbMethod].mockRejectedValueOnce('non-error failure')
    await expect(api[apiMethod](...args)).rejects.toBe('non-error failure')
    expect(api.error.value).toBe(fallbackMessage)
  })

  const fallbackCases: Array<{
    apiMethod: string
    dbMethod: string
    args: unknown[]
    result: unknown
    fallbackMessage: string
  }> = [
    { apiMethod: 'loadBooks', dbMethod: 'getBooks', args: [], result: undefined, fallbackMessage: 'Failed to load books' },
    { apiMethod: 'loadChapters', dbMethod: 'getChapters', args: ['b'], result: undefined, fallbackMessage: 'Failed to load chapters' },
    { apiMethod: 'getSummary', dbMethod: 'getSummary', args: ['c'], result: null, fallbackMessage: 'Failed to get summary' },
    { apiMethod: 'getPartSummary', dbMethod: 'getPartSummary', args: ['p'], result: null, fallbackMessage: 'Failed to get part summary' },
    { apiMethod: 'getReviews', dbMethod: 'getReviews', args: ['c'], result: [], fallbackMessage: 'Failed to get reviews' },
    { apiMethod: 'getNotes', dbMethod: 'getNotes', args: ['c'], result: null, fallbackMessage: 'Failed to get notes' },
    { apiMethod: 'getCustomProfiles', dbMethod: 'getCustomProfiles', args: [], result: [], fallbackMessage: 'Failed to get custom profiles' },
    { apiMethod: 'getWikiPageById', dbMethod: 'getWikiPageById', args: ['w'], result: null, fallbackMessage: 'Failed to get wiki page by ID' },
    { apiMethod: 'getWikiPage', dbMethod: 'getWikiPage', args: ['b', 'name'], result: null, fallbackMessage: 'Failed to get wiki page' },
    { apiMethod: 'getWikiPages', dbMethod: 'getWikiPages', args: ['b'], result: [], fallbackMessage: 'Failed to get wiki pages' },
    { apiMethod: 'getChapterWikiLinks', dbMethod: 'getChapterWikiLinks', args: ['c'], result: [], fallbackMessage: 'Failed to get chapter wiki links' },
    { apiMethod: 'getWikiPageChapterLinks', dbMethod: 'getWikiPageChapterLinks', args: ['w'], result: [], fallbackMessage: 'Failed to get wiki page chapter links' },
  ]

  it.each(fallbackCases)('$apiMethod returns its safe fallback after Error and non-Error failures', async ({
    apiMethod, dbMethod, args, result, fallbackMessage,
  }) => {
    const api = useDatabase() as unknown as Record<string, (...values: unknown[]) => Promise<unknown>> & {
      error: { value: string | null }
    }
    const failure = new Error(`${apiMethod} failed`)
    dbProxy[dbMethod].mockRejectedValueOnce(failure)

    await expect(api[apiMethod](...args)).resolves.toEqual(result)
    expect(api.error.value).toBe(failure.message)

    dbProxy[dbMethod].mockRejectedValueOnce('non-error failure')
    await expect(api[apiMethod](...args)).resolves.toEqual(result)
    expect(api.error.value).toBe(fallbackMessage)
  })
})

describe('useDatabase — cloud sync initialization', () => {
  it('wires up CloudSync when a client id is configured, enabling backup/restore', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID_WEB', 'web-client-id')
    const { useDatabase: freshUseDatabase } = await import('@/composables/useDatabase')

    const api = freshUseDatabase()
    await api.loadBooks() // triggers initializeDatabase with a configured client id

    expect(api.hasCloudSync()).toBe(true)

    await api.prepareCloudSync()
    expect(cloudInstance.ensureWebSdkReady).toHaveBeenCalled()

    await api.backupToCloud('pw')
    expect(cloudInstance.backup).toHaveBeenCalledWith('pw')

    await api.restoreFromCloud('pw')
    expect(cloudInstance.restore).toHaveBeenCalledWith('pw')

    await api.restoreFromCloud('pw', 'generation-1')
    expect(cloudInstance.restore).toHaveBeenCalledWith('pw', 'generation-1')

    const generations = [{ id: 'generation-1' }]
    cloudInstance.listBackupGenerations.mockResolvedValueOnce(generations)
    await expect(api.listCloudBackups()).resolves.toBe(generations)

    const backupFailure = new Error('backup failed')
    cloudInstance.backup.mockRejectedValueOnce(backupFailure)
    await expect(api.backupToCloud('pw')).rejects.toBe(backupFailure)
    expect(api.error.value).toBe('backup failed')
    cloudInstance.backup.mockRejectedValueOnce('non-error backup failure')
    await expect(api.backupToCloud('pw')).rejects.toBe('non-error backup failure')
    expect(api.error.value).toBe('Backup failed')

    const restoreFailure = new Error('restore failed')
    cloudInstance.restore.mockRejectedValueOnce(restoreFailure)
    await expect(api.restoreFromCloud('pw')).rejects.toBe(restoreFailure)
    expect(api.error.value).toBe('restore failed')
    cloudInstance.restore.mockRejectedValueOnce('non-error restore failure')
    await expect(api.restoreFromCloud('pw')).rejects.toBe('non-error restore failure')
    expect(api.error.value).toBe('Restore failed')

    cloudInstance.ensureWebSdkReady.mockRejectedValueOnce(new Error('SDK unavailable'))
    await api.prepareCloudSync()
    expect(api.cloudSyncReady.value).toBe(false)
  })
})
