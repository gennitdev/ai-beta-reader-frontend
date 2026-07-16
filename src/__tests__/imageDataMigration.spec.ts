import { describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '@/lib/database'
import {
  migrateLegacyImageData,
  type ImageDataMigrationRepository,
  type ImageDataMigrationStatus,
} from '@/lib/imageDataMigration'
import type { ImageContentStore } from '@/lib/imageContentStore'

function createAsset(id: string, imageData = 'data:image/png;base64,AQID'): ImageAsset {
  return {
    id,
    book_id: 'book-1',
    chapter_id: 'chapter-1',
    asset_type: 'chapter',
    file_name: `${id}.png`,
    file_path: `web/${id}/${id}.png`,
    mime_type: 'image/png',
    image_data: imageData,
    notes: '',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function migrationHarness(assets: ImageAsset[]) {
  const rows = new Map(assets.map((asset) => [asset.id, { ...asset }]))
  const blobs = new Map<string, Blob>()
  const statuses: ImageDataMigrationStatus[] = []
  const clearedBatches: string[][] = []
  const flush = vi.fn(async () => undefined)
  const repository: ImageDataMigrationRepository = {
    listPendingImageIds: async () => [...rows.values()]
      .filter((asset) => Boolean(asset.image_data))
      .map((asset) => asset.id),
    loadImages: async (ids) => ids
      .map((id) => rows.get(id))
      .filter((asset): asset is ImageAsset => Boolean(asset)),
    clearImageData: async (ids) => {
      clearedBatches.push([...ids])
      ids.forEach((id) => {
        const asset = rows.get(id)
        if (asset) asset.image_data = null
      })
    },
    flush,
    saveStatus: async (status) => { statuses.push(status) },
  }
  const store: ImageContentStore = {
    read: async (asset) => blobs.get(asset.id) ?? null,
    write: async (asset, blob) => { blobs.set(asset.id, blob) },
    delete: async (asset) => { blobs.delete(asset.id) },
    exists: async (asset) => blobs.has(asset.id),
  }

  return { blobs, clearedBatches, flush, repository, rows, statuses, store }
}

describe('migrateLegacyImageData', () => {
  it('rejects an invalid batch size instead of entering a stalled migration', async () => {
    const harness = migrationHarness([createAsset('one')])

    await expect(migrateLegacyImageData({
      repository: harness.repository,
      store: harness.store,
      batchSize: 0,
    })).rejects.toThrow('batch size must be a positive integer')
  })

  it('migrates and verifies images in restartable batches before clearing SQLite data', async () => {
    const harness = migrationHarness([
      createAsset('one'),
      createAsset('two'),
      createAsset('three'),
    ])

    const status = await migrateLegacyImageData({
      repository: harness.repository,
      store: harness.store,
      batchSize: 2,
      now: () => '2026-07-15T00:00:00.000Z',
    })

    expect(harness.clearedBatches).toEqual([['one', 'two'], ['three']])
    expect(harness.flush).toHaveBeenCalledTimes(2)
    expect([...harness.rows.values()].every((asset) => asset.image_data === null)).toBe(true)
    expect(harness.blobs.size).toBe(3)
    expect(status).toEqual({
      version: 1,
      status: 'complete',
      migratedCount: 3,
      failedImageIds: [],
      updatedAt: '2026-07-15T00:00:00.000Z',
    })
  })

  it('retains invalid image data and records a partial migration', async () => {
    const harness = migrationHarness([
      createAsset('valid'),
      createAsset('invalid', 'not-a-data-url'),
    ])

    const status = await migrateLegacyImageData({
      repository: harness.repository,
      store: harness.store,
      batchSize: 5,
      now: () => '2026-07-15T00:00:00.000Z',
    })

    expect(harness.rows.get('valid')?.image_data).toBeNull()
    expect(harness.rows.get('invalid')?.image_data).toBe('not-a-data-url')
    expect(harness.clearedBatches).toEqual([['valid']])
    expect(status.status).toBe('partial')
    expect(status.failedImageIds).toEqual(['invalid'])
  })

  it('is safe to rerun after a partial migration', async () => {
    const harness = migrationHarness([createAsset('one'), createAsset('two')])
    const originalWrite = harness.store.write.bind(harness.store)
    let failSecondImage = true
    harness.store.write = async (asset, blob) => {
      if (asset.id === 'two' && failSecondImage) throw new Error('interrupted')
      await originalWrite(asset, blob)
    }

    const firstStatus = await migrateLegacyImageData({
      repository: harness.repository,
      store: harness.store,
    })
    failSecondImage = false
    const secondStatus = await migrateLegacyImageData({
      repository: harness.repository,
      store: harness.store,
    })

    expect(firstStatus).toMatchObject({ status: 'partial', migratedCount: 1 })
    expect(secondStatus).toMatchObject({ status: 'complete', migratedCount: 1 })
    expect([...harness.rows.values()].every((asset) => asset.image_data === null)).toBe(true)
  })
})
