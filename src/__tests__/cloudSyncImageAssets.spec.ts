import { describe, expect, it } from 'vitest'
import {
  enrichImageRowsForBackup,
  restoreImageRows,
  stripImageDataFromRows,
} from '@/lib/cloudSyncImageAssets'
import type { ImageContentStore } from '@/lib/imageContentStore'

function imageRow(id: string, imageData: string | null = null) {
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

function memoryStore(initial: Record<string, Blob> = {}) {
  const blobs = new Map(Object.entries(initial))
  const store: ImageContentStore = {
    read: async (asset) => blobs.get(asset.id) ?? null,
    write: async (asset, blob) => { blobs.set(asset.id, blob) },
    delete: async (asset) => { blobs.delete(asset.id) },
    exists: async (asset) => blobs.has(asset.id),
    listStoredIds: async () => [...blobs.keys()],
  }
  return { blobs, store }
}

describe('cloud sync image processing', () => {
  it('enriches web blob rows while preserving legacy embedded image data', async () => {
    const { store } = memoryStore({
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    })

    const result = await enrichImageRowsForBackup([
      imageRow('blob'),
      imageRow('legacy', 'data:image/png;base64,BAUG'),
      imageRow('missing'),
    ], store)

    expect(result.rows.map((row) => row.image_data)).toEqual([
      'data:image/png;base64,AQID',
      'data:image/png;base64,BAUG',
      null,
    ])
    expect(result.missingImageIds).toEqual(['missing'])
  })

  it('restores embedded image data to the content store and clears live rows', async () => {
    const { blobs, store } = memoryStore()

    const result = await restoreImageRows([
      imageRow('restored', 'data:image/png;base64,AQID'),
      imageRow('metadata-only'),
    ], store)

    expect(new Uint8Array(await blobs.get('restored')!.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    )
    expect(result.rows.map((row) => row.image_data)).toEqual([null, null])
    expect(result.missingImageIds).toEqual(['metadata-only'])
  })

  it('fails restore when an image cannot be written', async () => {
    const { store } = memoryStore()
    store.write = async () => {
      throw new Error('quota exceeded')
    }

    await expect(restoreImageRows([
      imageRow('failed', 'data:image/png;base64,AQID'),
    ], store)).rejects.toThrow('Failed to restore image failed.png (failed): quota exceeded')
  })

  it('normalizes legacy positional rows before stripping mobile image data', () => {
    const result = stripImageDataFromRows([[
      'legacy',
      'book-1',
      'chapter-1',
      'chapter',
      'legacy.png',
      'images/legacy.png',
      'image/png',
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      'data:image/png;base64,AQID',
    ]])

    expect(result.rows[0]).toMatchObject({
      id: 'legacy',
      image_data: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    })
  })
})
