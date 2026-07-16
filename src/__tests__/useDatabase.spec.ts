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

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID_WEB', '')
  for (const fn of Object.values(dbFns)) fn.mockClear()
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
})

describe('useDatabase — cloud sync guards', () => {
  it('backup and restore throw when cloud sync is not initialized', async () => {
    const api = useDatabase()
    expect(api.hasCloudSync()).toBe(false)
    await expect(api.backupToCloud('pw')).rejects.toThrow(/not initialized/)
    await expect(api.restoreFromCloud('pw')).rejects.toThrow(/not initialized/)
  })

  it('prepareCloudSync is a no-op when there is no provider', async () => {
    const api = useDatabase()
    await expect(api.prepareCloudSync()).resolves.toBeUndefined()
  })
})

describe('useDatabase — delegation to the database layer', () => {
  it('every remaining wrapper delegates to db and surfaces its result', async () => {
    const api = useDatabase()

    const calls: Array<[keyof typeof api, unknown[]]> = [
      ['saveSummary', [{ chapter_id: 'c' }]],
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
      ['getImageWikiTags', ['i']],
      ['setImageWikiTags', ['i', ['w']]],
      ['getWikiPageImageAssets', ['w']],
      ['importFromJSON', [{}]],
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
  })
})
