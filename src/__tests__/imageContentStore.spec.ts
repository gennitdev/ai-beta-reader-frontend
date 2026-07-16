import { describe, expect, it } from 'vitest'
import type { ImageAsset } from '@/lib/database'
import {
  blobToDataUrl,
  dataUrlToBlob,
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
