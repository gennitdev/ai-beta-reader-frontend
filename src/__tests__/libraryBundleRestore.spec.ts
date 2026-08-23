// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { completeCanonicalLibraryFixture } from './fixtures/libraryBundle'
import type { ImageAsset } from '@/lib/database'
import type { ImageContentStore } from '@/lib/imageContentStore'
import {
  canonicalAssetFilePath,
  importCanonicalLibraryModel,
  removeCanonicalAssetsAbsentFromModel,
} from '@/lib/libraryBundle/restore'

function memoryImageStore(events: string[] = []): ImageContentStore {
  const values = new Map<string, Blob>()
  return {
    read: vi.fn(async (asset: ImageAsset) => {
      events.push(`read:${asset.id}`)
      return values.get(asset.id) ?? null
    }),
    write: vi.fn(async (asset: ImageAsset, blob: Blob) => {
      events.push(`write:${asset.id}`)
      values.set(asset.id, blob)
    }),
    delete: vi.fn(async (asset: ImageAsset) => { values.delete(asset.id) }),
    exists: vi.fn(async (asset: ImageAsset) => values.has(asset.id)),
  }
}

describe('canonical library restore', () => {
  it('writes and verifies one binary asset at a time before importing metadata-only JSON', async () => {
    const model = completeCanonicalLibraryFixture()
    model.assets.push({ ...model.assets[0], id: 'image/two', file_name: '../second image.png' })
    const events: string[] = []
    const importDatabaseBackup = vi.fn(async (bytes: Uint8Array) => {
      events.push('database')
      const data = JSON.parse(new TextDecoder().decode(bytes))
      expect(data.image_assets).toEqual([
        expect.objectContaining({
          id: model.assets[0].id,
          image_data: null,
          content_hash: model.assets[0].sha256,
          content_hash_algorithm: 'sha256-v1',
          content_byte_length: 3,
        }),
        expect.objectContaining({
          id: 'image/two', image_data: null,
          file_path: 'images/library/image_two/.._second_image.png',
        }),
      ])
      expect(JSON.stringify(data)).not.toContain('base64')
    })

    await importCanonicalLibraryModel(model, {
      imageStore: memoryImageStore(events),
      importDatabaseBackup,
    })

    expect(events).toEqual([
      `write:${model.assets[0].id}`, `read:${model.assets[0].id}`,
      'write:image/two', 'read:image/two', 'database',
    ])
    expect(importDatabaseBackup).toHaveBeenCalledOnce()
  })

  it('creates safe, stable storage paths', () => {
    const asset = { ...completeCanonicalLibraryFixture().assets[0], id: '../../cover', file_name: '..' }
    expect(canonicalAssetFilePath(asset)).toBe('images/library/.._.._cover/image')
  })

  it('requires an image store and complete bytes for illustrated backups', async () => {
    const model = completeCanonicalLibraryFixture()
    await expect(importCanonicalLibraryModel(model, {
      imageStore: null,
      importDatabaseBackup: vi.fn(),
    })).rejects.toThrow('cannot store the images')

    model.assets[0].bytes = null
    await expect(importCanonicalLibraryModel(model, {
      imageStore: memoryImageStore(),
      importDatabaseBackup: vi.fn(),
    })).rejects.toThrow('missing required bytes')
  })

  it('rejects a stored image that does not match canonical integrity metadata', async () => {
    const store = memoryImageStore()
    store.read = vi.fn(async () => new Blob([new Uint8Array([9])], { type: 'image/png' }))
    await expect(importCanonicalLibraryModel(completeCanonicalLibraryFixture(), {
      imageStore: store,
      importDatabaseBackup: vi.fn(),
    })).rejects.toThrow(/integrity check/i)
  })

  it('removes only failed-replacement assets that are absent from the rollback model', async () => {
    const incoming = completeCanonicalLibraryFixture()
    incoming.assets.push({ ...incoming.assets[0], id: 'new-image' })
    const rollback = completeCanonicalLibraryFixture()
    const store = memoryImageStore()

    await removeCanonicalAssetsAbsentFromModel(store, incoming.assets, rollback)

    expect(store.delete).toHaveBeenCalledOnce()
    expect(store.delete).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-image' }))
  })
})
