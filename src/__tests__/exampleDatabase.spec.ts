// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { DatabaseApi } from '@/composables/useDatabase'
import { createExampleDatabase, READ_ONLY_MESSAGE } from '@/demo/exampleDatabase'

describe('example database facade', () => {
  it.each([
    'saveBook',
    'saveChapter',
    'deleteChapter',
    'saveSummary',
    'savePartSummary',
    'saveReview',
    'saveNotes',
    'createWikiPage',
    'updateWikiPage',
    'deleteWikiPage',
    'updateChapterOrders',
    'updatePartOrder',
    'setBookCoverImageId',
    'updateImageAssetNotes',
  ] as const)('rejects the %s mutation before it can reach the local database', async (method) => {
    const localMutation = vi.fn()
    const base = { [method]: localMutation } as unknown as DatabaseApi
    const { api } = createExampleDatabase(base)

    await expect((api[method] as (...args: unknown[]) => Promise<unknown>)()).rejects.toThrow(READ_ONLY_MESSAGE)
    expect(localMutation).not.toHaveBeenCalled()
  })
})
