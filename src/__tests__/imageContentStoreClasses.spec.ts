// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '@/lib/database'
import {
  ElectronImageContentStore,
  IndexedDbImageContentStore,
  blobToDataUrl,
} from '@/lib/imageContentStore'

const { read, write, del, listKeys } = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
  listKeys: vi.fn(async () => [] as unknown[]),
}))

vi.mock('@/lib/indexedDbStorage', () => ({
  IMAGE_BLOBS_STORE: 'imageBlobs',
  readIndexedDbValue: read,
  writeIndexedDbValue: write,
  deleteIndexedDbValue: del,
  listIndexedDbKeys: listKeys,
}))

function asset(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: 'img-1',
    book_id: 'b1',
    chapter_id: null,
    asset_type: 'illustration' as ImageAsset['asset_type'],
    file_name: 'img.png',
    file_path: 'images/img.png',
    mime_type: 'image/png',
    image_data: null,
    notes: '',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('IndexedDbImageContentStore', () => {
  const store = new IndexedDbImageContentStore()

  it('returns null when nothing is stored', async () => {
    read.mockResolvedValue(null)
    expect(await store.read(asset())).toBeNull()
  })

  it('returns a raw legacy Blob record directly', async () => {
    const blob = new Blob(['hello'], { type: 'image/png' })
    read.mockResolvedValue(blob)
    expect(await store.read(asset())).toBe(blob)
  })

  it('validates and returns the blob from a structured record', async () => {
    const blob = new Blob(['hello'], { type: 'image/png' })
    read.mockResolvedValue({ blob, byteSize: blob.size, updatedAt: 'now' })
    expect(await store.read(asset())).toBe(blob)
  })

  it('throws when the stored record is not a Blob', async () => {
    read.mockResolvedValue({ blob: 'not-a-blob', byteSize: 5, updatedAt: 'now' })
    await expect(store.read(asset())).rejects.toThrow(/not a valid Blob/)
  })

  it('throws when the stored blob fails its size check', async () => {
    const blob = new Blob(['hello'], { type: 'image/png' })
    read.mockResolvedValue({ blob, byteSize: blob.size + 1, updatedAt: 'now' })
    await expect(store.read(asset())).rejects.toThrow(/failed its size check/)
  })

  it('writes a structured record with byteSize and timestamp', async () => {
    const blob = new Blob(['hello'], { type: 'image/png' })
    await store.write(asset({ id: 'img-9' }), blob)
    expect(write).toHaveBeenCalledWith(
      'imageBlobs',
      'img-9',
      expect.objectContaining({ blob, byteSize: blob.size }),
      undefined,
    )
  })

  it('delegates delete to indexedDb', async () => {
    await store.delete(asset({ id: 'img-3' }))
    expect(del).toHaveBeenCalledWith('imageBlobs', 'img-3', undefined)
  })

  it('exists reflects whether a record is present', async () => {
    read.mockResolvedValue(new Blob(['x']))
    expect(await store.exists(asset())).toBe(true)
    read.mockResolvedValue(null)
    expect(await store.exists(asset())).toBe(false)
  })

  it('listStoredIds returns only string keys', async () => {
    listKeys.mockResolvedValue(['a', 5, 'b'])
    expect(await store.listStoredIds()).toEqual(['a', 'b'])
  })
})

describe('ElectronImageContentStore', () => {
  function bridge() {
    return {
      readImageData: vi.fn(async () => ({ dataUrl: 'data:image/png;base64,aGVsbG8=' })),
      writeImageData: vi.fn(async () => {}),
      deleteImageFile: vi.fn(async () => {}),
    }
  }

  it('reads via the bridge and converts the data URL to a Blob', async () => {
    const b = bridge()
    const store = new ElectronImageContentStore(b as never)
    const blob = await store.read(asset())
    expect(b.readImageData).toHaveBeenCalledWith({
      relativePath: 'images/img.png',
      mimeType: 'image/png',
    })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('returns null when the asset has no file path', async () => {
    const store = new ElectronImageContentStore(bridge() as never)
    expect(await store.read(asset({ file_path: '' }))).toBeNull()
  })

  it('writes the blob as a data URL', async () => {
    const b = bridge()
    const store = new ElectronImageContentStore(b as never)
    const blob = new Blob(['hi'], { type: 'image/png' })
    await store.write(asset(), blob)
    expect(b.writeImageData).toHaveBeenCalledWith({
      relativePath: 'images/img.png',
      dataUrl: await blobToDataUrl(blob),
    })
  })

  it('throws on write when the asset has no file path', async () => {
    const store = new ElectronImageContentStore(bridge() as never)
    await expect(store.write(asset({ file_path: '' }), new Blob(['x']))).rejects.toThrow(
      /path is required/,
    )
  })

  it('deletes via the bridge, and is a no-op without a file path', async () => {
    const b = bridge()
    const store = new ElectronImageContentStore(b as never)
    await store.delete(asset())
    expect(b.deleteImageFile).toHaveBeenCalledWith({ relativePath: 'images/img.png' })

    b.deleteImageFile.mockClear()
    await store.delete(asset({ file_path: '' }))
    expect(b.deleteImageFile).not.toHaveBeenCalled()
  })

  it('exists returns false when the bridge read throws', async () => {
    const b = bridge()
    b.readImageData.mockRejectedValue(new Error('missing file'))
    const store = new ElectronImageContentStore(b as never)
    expect(await store.exists(asset())).toBe(false)
  })
})
