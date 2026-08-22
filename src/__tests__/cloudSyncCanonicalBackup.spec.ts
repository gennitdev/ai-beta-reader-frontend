// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageAsset } from '@/lib/database'

const mocks = vi.hoisted(() => ({
  exportDatabase: vi.fn(),
  importDatabase: vi.fn(async () => {}),
  runtimeStore: null as null | { read: ReturnType<typeof vi.fn> },
  bundleExport: vi.fn(),
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  createGeneration: vi.fn(),
  captureSnapshot: vi.fn(),
  restoreRows: vi.fn(),
  restoreSnapshot: vi.fn(),
  previewImport: vi.fn(),
  prepareReplacement: vi.fn(),
  replaceLibrary: vi.fn(),
  recoveryStore: { kind: 'recovery-store' },
  sha256: vi.fn(),
}))

vi.mock('@/lib/database', () => ({
  db: { exportDatabase: mocks.exportDatabase, importDatabase: mocks.importDatabase },
}))
vi.mock('@/lib/runtimeImageContentStore', () => ({
  createRuntimeImageContentStore: () => mocks.runtimeStore,
}))
vi.mock('@/lib/libraryBundle/export', () => ({
  createFullLibraryBundleExport: mocks.bundleExport,
}))
vi.mock('@/lib/encryption', () => ({
  Encryption: { encrypt: mocks.encrypt, decrypt: mocks.decrypt },
}))
vi.mock('@/lib/libraryBundle/adapters/drive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/libraryBundle/adapters/drive')>()
  return { ...actual, createDriveBackupGeneration: mocks.createGeneration }
})
vi.mock('@/lib/cloudSyncImageAssets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cloudSyncImageAssets')>()
  return {
    ...actual,
    captureImageContentSnapshot: mocks.captureSnapshot,
    restoreImageRows: mocks.restoreRows,
    restoreImageContentSnapshot: mocks.restoreSnapshot,
  }
})
vi.mock('@/lib/libraryBundle/importPreview', () => ({
  previewBundleZipImport: mocks.previewImport,
}))
vi.mock('@/lib/recovery/replacement', () => ({
  prepareLibraryReplacement: mocks.prepareReplacement,
  replaceLibraryWithRecovery: mocks.replaceLibrary,
}))
vi.mock('@/lib/recovery/runtime', () => ({
  createRuntimeRecoveryStore: () => mocks.recoveryStore,
}))
vi.mock('@/lib/libraryBundle/semanticHash', () => ({ sha256Hex: mocks.sha256 }))

import { CloudSync, type CloudProvider } from '@/lib/cloudSync'

function provider(): CloudProvider {
  return {
    name: 'Drive',
    authenticate: vi.fn(async () => {}),
    isAuthenticated: vi.fn(() => true),
    upload: vi.fn(async () => {}),
    download: vi.fn(async () => null),
    uploadGeneration: vi.fn(),
    listGenerations: vi.fn(async () => []),
    downloadGeneration: vi.fn(),
    deleteGeneration: vi.fn(),
  }
}

function image(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: 'image-1', book_id: 'book-1', chapter_id: null, asset_type: 'cover',
    file_name: 'cover.png', file_path: 'images/cover.png', mime_type: 'image/png',
    image_data: null, notes: '', created_at: '', updated_at: '', ...overrides,
  }
}

type PrivateCloudSync = {
  importCanonicalDatabase: (data: Uint8Array) => Promise<void>
  restoreBundle: (data: Uint8Array) => Promise<boolean>
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runtimeStore = null
  mocks.exportDatabase.mockResolvedValue(new TextEncoder().encode('{"version":5}'))
  mocks.encrypt.mockResolvedValue('encrypted')
  mocks.decrypt.mockResolvedValue(new Uint8Array())
  mocks.createGeneration.mockResolvedValue({ id: 'generation-1' })
  mocks.bundleExport.mockResolvedValue({ zipBytes: new Uint8Array([1, 2, 3]) })
  mocks.captureSnapshot.mockResolvedValue([])
  mocks.restoreRows.mockResolvedValue({ rows: [], assets: [], missingImageIds: [] })
  mocks.restoreSnapshot.mockResolvedValue(undefined)
  mocks.previewImport.mockResolvedValue({ plan: { replaceEligible: true } })
  mocks.prepareReplacement.mockResolvedValue({ recovery: true })
  mocks.replaceLibrary.mockResolvedValue(undefined)
  mocks.sha256.mockResolvedValue('database-hash')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('CloudSync canonical backup and import', () => {
  it('exports, encrypts, and uploads a canonical generation with fixed metadata', async () => {
    const now = new Date('2026-08-22T12:00:00.000Z')
    const cloud = new CloudSync(provider(), { now: () => now, appVersion: '9.1.0' })

    await expect(cloud.backup('pw')).resolves.toEqual({ id: 'generation-1' })

    const [databaseBytes, bundleOptions] = mocks.bundleExport.mock.calls[0]
    expect(Array.from(databaseBytes)).toEqual(Array.from(new TextEncoder().encode('{"version":5}')))
    expect(bundleOptions).toEqual(expect.objectContaining({
      exportedAt: now.toISOString(), appVersion: '9.1.0', readAssetBytes: expect.any(Function),
    }))
    expect(mocks.encrypt).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), 'pw')
    expect(mocks.createGeneration).toHaveBeenCalledWith(
      expect.any(Object),
      'encrypted',
      expect.objectContaining({ createdAt: now.toISOString(), appVersion: '9.1.0' }),
    )
  })

  it('reads stored asset bytes and falls back to embedded bytes when storage fails', async () => {
    const read = vi.fn()
      .mockResolvedValueOnce(new Blob([new Uint8Array([4, 5])]))
      .mockRejectedValueOnce(new Error('disk offline'))
    mocks.runtimeStore = { read }
    mocks.bundleExport.mockImplementation(async (_data, options) => ({
      zipBytes: new Uint8Array([
        ...(await options.readAssetBytes(image({ id: 'stored' }))),
        ...(await options.readAssetBytes(image({
          id: 'embedded', image_data: 'data:image/png;base64,AQID',
        }))),
      ]),
    }))

    await new CloudSync(provider()).backup('pw')

    expect(mocks.encrypt).toHaveBeenCalledWith(new Uint8Array([4, 5, 1, 2, 3]), 'pw')
  })

  it('rejects a canonical backup when an asset has no readable bytes', async () => {
    mocks.runtimeStore = { read: vi.fn(async () => null) }
    mocks.bundleExport.mockImplementation(async (_data, options) => {
      await options.readAssetBytes(image({ id: 'missing' }))
      return { zipBytes: new Uint8Array() }
    })

    await expect(new CloudSync(provider()).backup('pw')).rejects.toThrow(
      'Image missing is missing required bytes',
    )
  })

  it('strips embedded image data when canonical import has no content store', async () => {
    const data = new TextEncoder().encode(JSON.stringify({
      version: 5,
      image_assets: [
        { id: 'image-1', image_data: 'data:image/png;base64,AQ==' },
        ['positional-row'],
      ],
    }))
    const cloud = new CloudSync(provider()) as unknown as PrivateCloudSync

    await cloud.importCanonicalDatabase(data)

    const imported = JSON.parse(new TextDecoder().decode(mocks.importDatabase.mock.calls[0][0]))
    expect(imported.image_assets[0].image_data).toBeNull()
    expect(imported.image_assets[1]).toEqual(['positional-row'])
  })

  it('restores canonical image rows and synthesizes safe missing paths', async () => {
    mocks.runtimeStore = { read: vi.fn() }
    const restoredRow = { id: 'unsafe_id', file_path: 'images/library/unsafe_id/image.png' }
    mocks.restoreRows.mockResolvedValue({ rows: [restoredRow], assets: [], missingImageIds: [] })
    const data = new TextEncoder().encode(JSON.stringify({
      version: 5,
      image_assets: [{ id: 'unsafe/id', file_name: null, file_path: '' }],
    }))
    const cloud = new CloudSync(provider()) as unknown as PrivateCloudSync

    await cloud.importCanonicalDatabase(data)

    expect(mocks.captureSnapshot).toHaveBeenCalledWith([
      expect.objectContaining({ file_path: 'images/library/unsafe_id/image' }),
    ], mocks.runtimeStore)
    const importedBytes = mocks.importDatabase.mock.calls[0][0]
    expect(ArrayBuffer.isView(importedBytes)).toBe(true)
  })

  it('rolls image content back when canonical database import fails', async () => {
    mocks.runtimeStore = { read: vi.fn() }
    mocks.captureSnapshot.mockResolvedValue([{ id: 'snapshot' }])
    mocks.restoreRows.mockResolvedValue({ rows: [{ id: 'image-1' }], assets: [], missingImageIds: [] })
    mocks.importDatabase.mockRejectedValueOnce(new Error('database rejected import'))
    const data = new TextEncoder().encode(JSON.stringify({
      version: 5, image_assets: [{ id: 'image-1', file_name: 'image.png' }],
    }))
    const cloud = new CloudSync(provider()) as unknown as PrivateCloudSync

    await expect(cloud.importCanonicalDatabase(data)).rejects.toThrow('database rejected import')
    expect(mocks.restoreSnapshot).toHaveBeenCalledWith([{ id: 'snapshot' }], mocks.runtimeStore)
  })

  it('rejects a canonical bundle that is not eligible for full replacement', async () => {
    mocks.previewImport.mockResolvedValueOnce({ plan: { replaceEligible: false } })
    const cloud = new CloudSync(provider()) as unknown as PrivateCloudSync

    await expect(cloud.restoreBundle(new Uint8Array([0x50, 0x4b, 3, 4])))
      .rejects.toThrow('not a complete, validated full-library bundle')
  })

  it('prepares recovery and replaces the library for an eligible canonical bundle', async () => {
    const preview = {
      plan: { replaceEligible: true },
      localModel: { books: [] },
      incomingModel: { books: [{ id: 'book-1' }] },
      databaseGeneration: new Uint8Array([7]),
    }
    mocks.previewImport.mockResolvedValueOnce(preview)
    mocks.replaceLibrary.mockImplementationOnce(async (
      _store, _plan, _incoming, _recovery, _hash, importDatabase,
    ) => {
      await importDatabase(new TextEncoder().encode(JSON.stringify({ version: 5, image_assets: [] })))
    })
    const now = new Date('2026-08-22T12:00:00.000Z')
    const cloud = new CloudSync(provider(), { now: () => now, appVersion: '9.1.0' }) as unknown as PrivateCloudSync

    await expect(cloud.restoreBundle(new Uint8Array([0x50, 0x4b, 3, 4]))).resolves.toBe(true)

    expect(mocks.prepareReplacement).toHaveBeenCalledWith(
      mocks.recoveryStore,
      preview.plan,
      preview.localModel,
      preview.databaseGeneration,
      expect.objectContaining({ createdAt: now.toISOString(), appVersion: '9.1.0' }),
    )
    expect(mocks.replaceLibrary).toHaveBeenCalledWith(
      mocks.recoveryStore,
      preview.plan,
      preview.incomingModel,
      { recovery: true },
      'database-hash',
      expect.any(Function),
    )
    expect(mocks.importDatabase).toHaveBeenCalled()
  })

  it('restores legacy image metadata without a runtime content store', async () => {
    const legacy = {
      version: 5,
      books: [],
      chapters: [],
      wiki_pages: [],
      image_assets: [{
        id: 'image-1', book_id: 'book-1', asset_type: 'cover', file_name: 'cover.png',
        file_path: 'images/cover.png',
        image_data: 'data:image/png;base64,AQID',
      }],
    }
    mocks.decrypt.mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify(legacy)))
    const cloudProvider = provider()
    cloudProvider.download = vi.fn(async () => 'ciphertext')

    await expect(new CloudSync(cloudProvider).restore('pw')).resolves.toBe(true)

    const imported = JSON.parse(new TextDecoder().decode(mocks.importDatabase.mock.calls[0][0]))
    expect(imported.image_assets[0].image_data).toBeNull()
  })

  it('reports corrupt compressed legacy data', async () => {
    mocks.decrypt.mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
    const cloudProvider = provider()
    cloudProvider.download = vi.fn(async () => 'GZ1:ciphertext')

    await expect(new CloudSync(cloudProvider).restore('pw'))
      .rejects.toThrow('Failed to decompress backup')
  })

  it('runs auto-sync callbacks through both success and failure logging', async () => {
    let callback: (() => Promise<void>) | undefined
    vi.spyOn(window, 'setInterval').mockImplementation(((candidate: () => Promise<void>) => {
      callback = candidate
      return 42
    }) as typeof window.setInterval)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cloud = new CloudSync(provider())
    const backup = vi.spyOn(cloud, 'backup').mockResolvedValue({ id: 'generation-1' } as never)

    expect(cloud.startAutoSync('pw')).toBe(42)
    await callback?.()
    backup.mockRejectedValueOnce(new Error('backup failed'))
    await callback?.()

    expect(backup).toHaveBeenCalledTimes(2)
    expect(console.error).toHaveBeenCalledWith('Auto-backup failed:', expect.any(Error))
  })
})
