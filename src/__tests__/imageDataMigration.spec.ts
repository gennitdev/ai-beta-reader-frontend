import { describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '@/lib/database'
import {
  migrateLegacyImageData,
  type ImageDataMigrationRepository,
  type ImageDataMigrationStatus,
} from '@/lib/imageDataMigration'
import type { ImageContentStore } from '@/lib/imageContentStore'
import type { ImageContentIntegrity } from '@/lib/imageContentHash'

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
  const finalizedBatches: Array<Array<{ id: string; integrity: ImageContentIntegrity }>> = []
  const flush = vi.fn(async () => undefined)
  const repository: ImageDataMigrationRepository = {
    listPendingImageIds: async () => [...rows.values()]
      .filter((asset) => Boolean(asset.image_data))
      .map((asset) => asset.id),
    loadImages: async (ids) => ids
      .map((id) => rows.get(id))
      .filter((asset): asset is ImageAsset => Boolean(asset)),
    finalizeImages: async (images) => {
      finalizedBatches.push(images.map((image) => ({
        id: image.id,
        integrity: { ...image.integrity },
      })))
      images.forEach(({ id, integrity }) => {
        const asset = rows.get(id)
        if (asset) Object.assign(asset, integrity, { image_data: null })
      })
      await flush()
    },
    saveStatus: async (status) => { statuses.push(status) },
  }
  const store: ImageContentStore = {
    read: async (asset) => blobs.get(asset.id) ?? null,
    write: async (asset, blob) => { blobs.set(asset.id, blob) },
    delete: async (asset) => { blobs.delete(asset.id) },
    exists: async (asset) => blobs.has(asset.id),
  }

  return { blobs, finalizedBatches, flush, repository, rows, statuses, store }
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

    expect(harness.finalizedBatches.map((batch) => batch.map((image) => image.id)))
      .toEqual([['one', 'two'], ['three']])
    expect(harness.flush).toHaveBeenCalledTimes(2)
    expect([...harness.rows.values()].every((asset) => asset.image_data === null)).toBe(true)
    expect(harness.rows.get('one')).toEqual(expect.objectContaining({
      content_hash: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      content_hash_algorithm: 'sha256-v1',
      content_byte_length: 3,
    }))
    expect(harness.blobs.size).toBe(3)
    expect(status).toEqual({
      version: 2,
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
    expect(harness.finalizedBatches.map((batch) => batch.map((image) => image.id)))
      .toEqual([['valid']])
    expect(status.status).toBe('partial')
    expect(status.failedImageIds).toEqual(['invalid'])
  })

  it('detects same-size Blob corruption before clearing legacy bytes', async () => {
    const harness = migrationHarness([createAsset('corrupted')])
    harness.store.write = async (asset) => {
      harness.blobs.set(asset.id, new Blob([new Uint8Array([1, 2, 4])], { type: 'image/png' }))
    }

    const status = await migrateLegacyImageData({
      repository: harness.repository,
      store: harness.store,
    })

    expect(status).toMatchObject({ status: 'partial', migratedCount: 0 })
    expect(status.failedImageIds).toEqual(['corrupted'])
    expect(harness.rows.get('corrupted')).toEqual(expect.objectContaining({
      image_data: 'data:image/png;base64,AQID',
    }))
    expect(harness.finalizedBatches).toEqual([])
  })

  it('does not replace legacy bytes that disagree with existing integrity metadata', async () => {
    const mismatched = createAsset('mismatched')
    Object.assign(mismatched, {
      content_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      content_hash_algorithm: 'sha256-v1',
      content_byte_length: 3,
    })
    const harness = migrationHarness([mismatched])

    const status = await migrateLegacyImageData({
      repository: harness.repository,
      store: harness.store,
    })

    expect(status).toMatchObject({ status: 'partial', migratedCount: 0 })
    expect(status.failedImageIds).toEqual(['mismatched'])
    expect(harness.rows.get('mismatched')?.image_data).toBe('data:image/png;base64,AQID')
    expect(harness.blobs.has('mismatched')).toBe(false)
  })

  it('retains legacy bytes when existing integrity metadata is incomplete', async () => {
    const incomplete = createAsset('incomplete')
    incomplete.content_hash = '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81'
    const harness = migrationHarness([incomplete])

    const status = await migrateLegacyImageData({
      repository: harness.repository,
      store: harness.store,
    })

    expect(status).toMatchObject({ status: 'partial', migratedCount: 0 })
    expect(status.failedImageIds).toEqual(['incomplete'])
    expect(harness.rows.get('incomplete')?.image_data).toBe('data:image/png;base64,AQID')
    expect(harness.blobs.has('incomplete')).toBe(false)
  })

  it('retains legacy bytes when atomic metadata finalization fails', async () => {
    const harness = migrationHarness([createAsset('retryable')])
    harness.repository.finalizeImages = vi.fn(async () => {
      throw new Error('database unavailable')
    })

    await expect(migrateLegacyImageData({
      repository: harness.repository,
      store: harness.store,
    })).rejects.toThrow('database unavailable')

    expect(harness.rows.get('retryable')?.image_data).toBe('data:image/png;base64,AQID')
    expect(harness.rows.get('retryable')?.content_hash).toBeUndefined()
    expect(harness.statuses).toEqual([])
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
