import { describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '@/lib/database'
import {
  blobToDataUrl,
  dataUrlToBlob,
  cleanupOrphanedImageContent,
  deleteImageMetadataThenContent,
  inspectImageContent,
  type ImageContentStore,
} from '@/lib/imageContentStore'

function createAsset(id: string, imageData: string | null = null): ImageAsset {
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

describe('image data conversion', () => {
  it('round-trips a Blob through the backup-compatible data URL format', async () => {
    const source = new Blob([new Uint8Array([0, 1, 2, 254, 255])], { type: 'image/png' })

    const dataUrl = await blobToDataUrl(source)
    const restored = dataUrlToBlob(dataUrl)

    expect(dataUrl).toBe('data:image/png;base64,AAEC/v8=')
    expect(restored.type).toBe('image/png')
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(
      new Uint8Array([0, 1, 2, 254, 255]),
    )
  })

  it('rejects malformed data URLs', () => {
    expect(() => dataUrlToBlob('not-an-image')).toThrow('Invalid image data URL.')
  })
})

describe('inspectImageContent', () => {
  it('reports missing content and unreferenced stored blobs without deleting either', async () => {
    const storedIds = new Set(['present', 'orphan'])
    const store: ImageContentStore = {
      read: async (asset) => storedIds.has(asset.id) ? new Blob(['image']) : null,
      write: async () => undefined,
      delete: async () => undefined,
      exists: async (asset) => storedIds.has(asset.id),
      listStoredIds: async () => [...storedIds],
    }

    const result = await inspectImageContent(store, [
      createAsset('present'),
      createAsset('missing'),
      createAsset('legacy', 'data:image/png;base64,AA=='),
    ])

    expect(result).toEqual({
      missingImageIds: ['missing'],
      orphanedImageIds: ['orphan'],
    })
    expect(storedIds).toEqual(new Set(['present', 'orphan']))
  })
})

describe('cross-store image deletion', () => {
  it('does not touch content or cache when metadata deletion fails', async () => {
    const asset = createAsset('image')
    const metadataError = new Error('database failed')
    const store = {
      delete: vi.fn(async () => undefined),
    } as unknown as ImageContentStore
    const clearCache = vi.fn()

    await expect(deleteImageMetadataThenContent(
      asset,
      async () => { throw metadataError },
      store,
      clearCache,
    )).rejects.toBe(metadataError)

    expect(store.delete).not.toHaveBeenCalled()
    expect(clearCache).not.toHaveBeenCalled()
  })

  it('reports an orphan after metadata succeeds but content deletion fails', async () => {
    const asset = createAsset('image')
    const contentError = new Error('content store unavailable')
    const deleteMetadata = vi.fn(async () => undefined)
    const store = {
      delete: vi.fn(async () => { throw contentError }),
    } as unknown as ImageContentStore
    const clearCache = vi.fn()

    await expect(deleteImageMetadataThenContent(asset, deleteMetadata, store, clearCache)).resolves.toEqual({
      metadataDeleted: true,
      contentDeleted: false,
      orphanedContent: true,
      contentError,
    })
    expect(deleteMetadata).toHaveBeenCalledWith('image')
    expect(clearCache).toHaveBeenCalledWith('image')
  })

  it('deletes orphaned content while retaining referenced and failed records', async () => {
    const storedIds = new Set(['referenced', 'orphan-ok', 'orphan-failed'])
    const store: ImageContentStore = {
      read: async () => null,
      write: async () => undefined,
      delete: async () => undefined,
      exists: async (asset) => storedIds.has(asset.id),
      listStoredIds: async () => [...storedIds],
      deleteStoredId: async (imageId) => {
        if (imageId === 'orphan-failed') throw new Error('busy')
        storedIds.delete(imageId)
      },
    }

    const result = await cleanupOrphanedImageContent(store, [createAsset('referenced')])

    expect(result).toEqual({
      missingImageIds: [],
      orphanedImageIds: ['orphan-ok', 'orphan-failed'],
      deletedOrphanIds: ['orphan-ok'],
      failedOrphanIds: ['orphan-failed'],
    })
    expect(storedIds).toEqual(new Set(['referenced', 'orphan-failed']))
  })
})
