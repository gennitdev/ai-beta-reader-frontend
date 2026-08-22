import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '@/lib/database'

const filesystem = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  readdir: vi.fn(),
  getUri: vi.fn(),
}))

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Filesystem: filesystem,
}))

import {
  CapacitorImageContentStore,
  getNativeImageUri,
  nativeImageStorageError,
} from '@/lib/imageContentStore'

function asset(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: 'image-1',
    book_id: 'book-1',
    chapter_id: 'chapter-1',
    asset_type: 'chapter',
    file_name: 'scene.png',
    file_path: 'android/image-1',
    mime_type: 'image/png',
    image_data: null,
    notes: '',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  filesystem.mkdir.mockResolvedValue(undefined)
  filesystem.writeFile.mockResolvedValue(undefined)
  filesystem.deleteFile.mockResolvedValue(undefined)
  filesystem.readdir.mockResolvedValue({
    files: [
      { name: 'image-1', type: 'file' },
      { name: 'image-2', type: 'file' },
      { name: 'nested', type: 'directory' },
    ],
  })
  filesystem.getUri.mockResolvedValue({ uri: 'content://beta-bot/images/image-1' })
})

describe('CapacitorImageContentStore', () => {
  it('round-trips image bytes through the Android app-private data directory', async () => {
    const store = new CapacitorImageContentStore()
    const source = new Blob([new Uint8Array([0, 1, 2, 254, 255])], { type: 'image/png' })
    filesystem.readFile.mockResolvedValue({ data: 'AAEC/v8=' })

    await store.write(asset(), source)
    const restored = await store.read(asset())

    expect(filesystem.mkdir).toHaveBeenCalledWith({
      path: 'images', directory: 'DATA', recursive: true,
    })
    expect(filesystem.writeFile).toHaveBeenCalledWith({
      path: 'images/image-1', directory: 'DATA', data: 'AAEC/v8=', recursive: true,
    })
    expect(restored?.type).toBe('image/png')
    expect(new Uint8Array(await restored!.arrayBuffer())).toEqual(
      new Uint8Array([0, 1, 2, 254, 255]),
    )
  })

  it('treats missing files as absent and keeps delete idempotent', async () => {
    const store = new CapacitorImageContentStore()
    filesystem.readFile.mockRejectedValue(new Error('File does not exist'))
    filesystem.deleteFile.mockRejectedValue(new Error('File not found'))

    await expect(store.read(asset())).resolves.toBeNull()
    await expect(store.exists(asset())).resolves.toBe(false)
    await expect(store.delete(asset())).resolves.toBeUndefined()
  })

  it('lists only stored image files and rejects unsafe IDs', async () => {
    const store = new CapacitorImageContentStore()

    await expect(store.listStoredIds()).resolves.toEqual(['image-1', 'image-2'])
    await expect(store.write(asset({ id: '../escape' }), new Blob(['x'])))
      .rejects.toThrow('not safe for native storage')
    expect(filesystem.writeFile).not.toHaveBeenCalled()
  })

  it('turns storage exhaustion and permission failures into actionable messages', () => {
    expect(nativeImageStorageError(new Error('ENOSPC: no space left'), 'saved').message)
      .toMatch(/storage is full.*Free device space/i)
    expect(nativeImageStorageError(new Error('Permission denied'), 'loaded').message)
      .toMatch(/could not access app image storage.*Restart the app/i)
  })

  it('tolerates an existing directory but propagates other directory failures', async () => {
    const store = new CapacitorImageContentStore()
    filesystem.mkdir.mockRejectedValueOnce(new Error('Directory already exists'))
    await expect(store.write(asset(), new Blob(['ok']))).resolves.toBeUndefined()

    filesystem.mkdir.mockRejectedValueOnce(new Error('Filesystem unavailable'))
    await expect(store.write(asset(), new Blob(['nope'])))
      .rejects.toThrow('Filesystem unavailable')
    expect(filesystem.writeFile).toHaveBeenCalledTimes(1)
  })

  it('propagates corrupt reads and non-missing delete failures', async () => {
    const store = new CapacitorImageContentStore()
    filesystem.readFile.mockResolvedValue({ data: new Blob(['unexpected']) })
    await expect(store.read(asset())).rejects.toThrow('did not contain native file data')

    filesystem.deleteFile.mockRejectedValue(new Error('Permission denied'))
    await expect(store.delete(asset())).rejects.toThrow('Permission denied')
  })

  it('uses a safe app-private URI and a default MIME type when metadata is absent', async () => {
    const store = new CapacitorImageContentStore()
    filesystem.readFile.mockResolvedValue({ data: 'AQID' })

    const restored = await store.read(asset({ mime_type: null }))
    expect(restored?.type).toBe('application/octet-stream')
    await expect(getNativeImageUri('image-1')).resolves.toBe('content://beta-bot/images/image-1')
    expect(filesystem.getUri).toHaveBeenCalledWith({
      path: 'images/image-1', directory: 'DATA',
    })
  })
})
